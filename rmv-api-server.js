// Complete RMV Monitor Service with User Data Extraction
const express = require('express');
const cors = require('cors');
const path = require('path');
const winston = require('winston');
const fs = require('fs').promises;

// User data extraction modules
const { RMVUserDataExtractor, EnhancedRMVScraper } = require('./rmv-appointment-scraper');

// Configuration
const config = {
    port: process.env.PORT || 3000,
    checkInterval: process.env.CHECK_INTERVAL || 5,
    expireDate: new Date('2025-09-03T23:59:59')
};

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.simple()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

// Simple database simulation
const db = {
    async load() {
        try {
            const data = await fs.readFile('./data.json', 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return { appointments: [], users: [], extractedUserData: {} };
        }
    },
    async save(data) {
        await fs.writeFile('./data.json', JSON.stringify(data, null, 2));
    },
    async logAppointment(appointment) {
        const data = await this.load();
        data.appointments.push({
            ...appointment,
            id: Date.now(),
            timestamp: new Date().toISOString()
        });
        await this.save(data);
    }
};

// Import puppeteer for real browser functionality
const puppeteer = require('puppeteer');

// RMV scraper service
const service = {
    scraper: {
        browser: null,
        async initialize() {
            try {
                // Check environment variables for Puppeteer configuration
                const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
                const skipDownload = process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD;
                
                if (executablePath && executablePath.trim() !== '') {
                    logger.info(`Using custom executable path: ${executablePath}`);
                } else {
                    logger.info('Using Puppeteer bundled Chromium (default)');
                }
                
                const launchOptions = {
                    headless: 'new', // Use new headless mode
                };
                
                // Only set executablePath if explicitly provided and not empty
                if (executablePath && executablePath.trim() !== '') {
                    launchOptions.executablePath = executablePath;
                }
                
                launchOptions.args = [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor',
                        '--disable-background-networking',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--disable-field-trial-config',
                        '--disable-ipc-flooding-protection',
                        '--no-default-browser-check',
                        '--no-first-run',
                        '--disable-default-apps',
                        '--disable-extensions',
                        '--disable-plugins',
                        '--disable-sync',
                        '--disable-translate',
                        '--hide-scrollbars',
                        '--mute-audio',
                        '--no-zygote',
                        '--single-process',
                        '--disable-blink-features=AutomationControlled'
                    ],
                launchOptions.ignoreDefaultArgs = ['--enable-automation'];
                launchOptions.defaultViewport = null;
                
                this.browser = await puppeteer.launch(launchOptions);
                logger.info('Puppeteer browser initialized');
                
                // Add browser warm-up period to prevent first-attempt failures
                await new Promise(resolve => setTimeout(resolve, 1000));
                logger.info('Browser warm-up completed');
                return true;
            } catch (error) {
                logger.error('Failed to initialize Puppeteer browser:', error.message);
                throw error;
            }
        },
        async checkRMVUrl(fullUrl, userPreferences) {
            // Production 3-Step Navigation RMV scraping
            logger.info('Starting 3-Step Navigation RMV scraping for URL:', fullUrl);
            
            if (!this.browser) {
                throw new Error('Browser not initialized');
            }

            const page = await this.browser.newPage();
            const appointments = [];
            
            // Set user agent to avoid detection  
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            
            try {
                // STEP 1: Navigate to initial URL and extract office list
                logger.info('STEP 1: Navigating to RMV booking page and loading office list...');
                await page.goto(fullUrl, { waitUntil: 'networkidle0', timeout: 30000 });
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Extract location data and offices
                const rmvData = await page.evaluate(() => {
                    const data = {
                        offices: [],
                        locationData: [],
                        pageTitle: document.title,
                        debugInfo: {
                            bodyText: document.body.innerText.substring(0, 1000)
                        }
                    };
                    
                    // Extract structured location data from window.displayData
                    if (window.displayData && Array.isArray(window.displayData)) {
                        data.locationData = window.displayData.map(location => ({
                            id: location.Id,
                            name: location.Name,
                            address: location.Address
                        }));
                    }
                    
                    // Extract office buttons from the page
                    const qflowButtons = document.querySelectorAll('.QflowObjectItem[data-id]');
                    qflowButtons.forEach(btn => {
                        const officeName = btn.textContent.split('\n')[0].trim();
                        const dataId = btn.getAttribute('data-id');
                        
                        if (officeName && dataId) {
                            data.offices.push({
                                name: officeName,
                                dataId: dataId,
                                fullText: btn.textContent.trim()
                            });
                        }
                    });
                    
                    return data;
                });
                
                logger.info(`Found ${rmvData.offices.length} offices available`);
                logger.info('🏢 All available offices:', rmvData.offices.map(o => o.name));
                
                // STEP 2: Filter and navigate through selected locations  
                const selectedCenters = userPreferences?.locations || userPreferences?.centers || [];
                const matchedOffices = rmvData.offices.filter(office => 
                    selectedCenters.some(selected => 
                        office.name.toLowerCase().includes(selected.toLowerCase()) ||
                        selected.toLowerCase().includes(office.name.toLowerCase())
                    )
                );
                
                // If no matches, try all offices (limit to 3 for performance)
                if (matchedOffices.length === 0 && rmvData.offices.length > 0) {
                    logger.warn('No offices matched user preferences, using first 3 offices');
                    matchedOffices.push(...rmvData.offices.slice(0, 3));
                }
                
                logger.info(`STEP 2: Found ${matchedOffices.length} matching offices: ${matchedOffices.map(o => o.name).join(', ')}`);
                
                // Navigate to each matched office to get appointment times
                for (const office of matchedOffices) {
                    logger.info(`STEP 3: Navigating to ${office.name} for appointment times...`);
                    
                    try {
                        // Click on the office location
                        const locationSelector = `.QflowObjectItem[data-id="${office.dataId}"]`;
                        await page.locator(locationSelector).wait();
                        
                        // More robust clicking with error handling
                        try {
                            await page.evaluate((selector) => {
                                const element = document.querySelector(selector);
                                if (element) {
                                    element.click();
                                }
                            }, locationSelector);
                            logger.info(`   ✅ Clicked ${office.name}`);
                        } catch (clickError) {
                            logger.warn(`   ⚠️ Click failed, trying alternative method: ${clickError.message}`);
                            await page.$eval(locationSelector, el => el.click());
                        }
                        
                        // Wait for navigation with more robust waiting
                        await new Promise(resolve => setTimeout(resolve, 3000)); // Give time for navigation
                        
                        try {
                            await Promise.race([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                                page.locator('.ServiceAppointmentDateTime[data-datetime]').wait(),
                                new Promise(resolve => setTimeout(resolve, 10000)) // Fallback timeout
                            ]);
                        } catch (navError) {
                            logger.warn(`   ⚠️ Navigation wait failed: ${navError.message}`);
                            // Continue anyway, might have already navigated
                        }
                        
                        // Check if we're now on the appointment selection page
                        const appointmentPageTitle = await page.title();
                        logger.info(`Navigated to: ${appointmentPageTitle}`);
                        
                        // Extract appointment times using the pattern from attleboro-landing-page.html
                        const officeAppointments = await page.evaluate(() => {
                            const slots = [];
                            
                            // Look for ServiceAppointmentDateTime elements with data-datetime
                            const appointmentElements = document.querySelectorAll('.ServiceAppointmentDateTime[data-datetime]');
                            
                            appointmentElements.forEach(el => {
                                const dateTime = el.getAttribute('data-datetime');
                                const displayTime = el.textContent.trim();
                                const isAvailable = !el.classList.contains('disabled') && 
                                                  !el.classList.contains('unavailable') &&
                                                  el.classList.contains('valid');
                                
                                if (dateTime && displayTime && isAvailable) {
                                    // Parse the datetime
                                    const dt = new Date(dateTime);
                                    const date = dt.toLocaleDateString();
                                    const time = displayTime;
                                    
                                    slots.push({
                                        date: date,
                                        time: time,
                                        datetime: dateTime,
                                        displayText: displayTime,
                                        available: true
                                    });
                                }
                            });
                            
                            // Also look for grouped appointment displays
                            const groupedElements = document.querySelectorAll('.DateTimeGrouping-Container .ServiceAppointmentDateTime');
                            groupedElements.forEach(el => {
                                const dateTime = el.getAttribute('data-datetime');
                                const displayTime = el.textContent.trim();
                                const isAvailable = !el.classList.contains('disabled') && 
                                                  el.classList.contains('valid');
                                
                                if (dateTime && displayTime && isAvailable) {
                                    const dt = new Date(dateTime);
                                    const date = dt.toLocaleDateString();
                                    
                                    // Avoid duplicates
                                    const isDuplicate = slots.some(slot => 
                                        slot.datetime === dateTime
                                    );
                                    
                                    if (!isDuplicate) {
                                        slots.push({
                                            date: date,
                                            time: displayTime,
                                            datetime: dateTime,
                                            displayText: displayTime,
                                            available: true
                                        });
                                    }
                                }
                            });
                            
                            return {
                                slots: slots,
                                pageTitle: document.title,
                                totalFound: slots.length
                            };
                        });
                        
                        logger.info(`Found ${officeAppointments.totalFound} appointment slots for ${office.name}`);
                        
                        // Add appointments to our collection
                        officeAppointments.slots.forEach(slot => {
                            appointments.push({
                                center: office.name,
                                date: slot.date,
                                time: slot.time,
                                url: page.url(),
                                raw: slot.displayText,
                                type: '3-step-navigation',
                                datetime: slot.datetime,
                                officeName: office.name,
                                officeId: office.dataId
                            });
                        });
                        
                        // Go back to office selection for next office
                        if (matchedOffices.length > 1) {
                            await page.goBack();
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                        
                    } catch (officeError) {
                        logger.error(`Error processing office ${office.name}: ${officeError.message}`);
                        
                        // Try to recover by going back to the main URL
                        try {
                            await page.goto(fullUrl, { waitUntil: 'networkidle0', timeout: 15000 });
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        } catch (recoverError) {
                            logger.error(`Recovery failed: ${recoverError.message}`);
                        }
                    }
                }
                
                // If no appointments found through navigation, check if we're already on appointment page
                if (appointments.length === 0) {
                    logger.info('No appointments found through navigation, checking if already on appointment page...');
                    
                    const currentPageAppointments = await page.evaluate(() => {
                        const slots = [];
                        const appointmentElements = document.querySelectorAll('.ServiceAppointmentDateTime[data-datetime]');
                        
                        appointmentElements.forEach(el => {
                            const dateTime = el.getAttribute('data-datetime');
                            const displayTime = el.textContent.trim();
                            const isAvailable = !el.classList.contains('disabled') && 
                                              el.classList.contains('valid');
                            
                            if (dateTime && displayTime && isAvailable) {
                                const dt = new Date(dateTime);
                                slots.push({
                                    date: dt.toLocaleDateString(),
                                    time: displayTime,
                                    datetime: dateTime,
                                    displayText: displayTime,
                                    available: true
                                });
                            }
                        });
                        
                        return slots;
                    });
                    
                    if (currentPageAppointments.length > 0) {
                        logger.info(`Found ${currentPageAppointments.length} appointments on current page`);
                        currentPageAppointments.forEach(slot => {
                            appointments.push({
                                center: selectedCenters[0] || 'RMV Location',
                                date: slot.date,
                                time: slot.time,
                                url: page.url(),
                                raw: slot.displayText,
                                type: 'direct-appointment-page',
                                datetime: slot.datetime
                            });
                        });
                    }
                }
                
            } catch (error) {
                logger.error('Error during 3-step RMV scraping:', error.message);
                throw new Error(`3-step RMV scraping failed: ${error.message}`);
            } finally {
                await page.close();
            }
            
            logger.info(`3-Step RMV scraping completed. Found ${appointments.length} total appointments across all locations`);
            return appointments;
        }
    }
};

// Express API Server
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.static(__dirname));

// Serve the main interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index-improved.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        running: true,
        features: 'user_data_extraction_enabled',
        timestamp: new Date().toISOString(),
        message: 'RMV Monitor Service with User Data Extraction is running!'
    });
});

// Add the endpoint that the UI is actually calling
app.post('/api/scrape-rmv-appointments', async (req, res) => {
    try {
        const { rmvUrl, selectedCenters, preferences } = req.body;

        // Validate input
        if (!rmvUrl) {
            return res.status(400).json({
                success: false,
                error: 'RMV URL is required',
                timestamp: new Date().toISOString()
            });
        }

        logger.info(`Starting RMV appointment scraping for ${selectedCenters?.length || 0} centers`);
        logger.info(`RMV URL: ${rmvUrl}`);

        // Initialize scraper if not already initialized
        if (!service.scraper.browser) {
            logger.info('Initializing Puppeteer browser...');
            await service.scraper.initialize();
        }

        let appointments = [];

        try {
            // Use our 3-step scraper
            appointments = await service.scraper.checkRMVUrl(
                rmvUrl,
                { locations: selectedCenters, ...preferences }
            );
        } catch (scrapeError) {
            logger.error('Scraping error:', scrapeError);
            return res.status(500).json({
                success: false,
                error: 'Failed to scrape appointments',
                details: scrapeError.message,
                timestamp: new Date().toISOString()
            });
        }

        // Log appointments to database
        if (appointments && appointments.length > 0) {
            logger.info(`Found ${appointments.length} appointments!`);

            for (const apt of appointments) {
                await db.logAppointment({
                    ...apt,
                    source: 'ui_scrape'
                });
            }
        }

        // Return results
        const response = {
            success: true,
            found: appointments.length > 0,
            appointments: appointments,
            timestamp: new Date().toISOString(),
            message: appointments.length > 0 ?
                `Found ${appointments.length} available appointment(s)` :
                'No appointments currently available'
        };

        res.json(response);

    } catch (error) {
        logger.error('API error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Update the /api/check-appointments endpoint to include user extraction
app.post('/api/check-appointments', async (req, res) => {
    try {
        const { rmvUrl, selectedCenters, userPreferences, extractUserData } = req.body;

        // Validate input
        if (!rmvUrl) {
            return res.status(400).json({
                success: false,
                error: 'RMV URL is required',
                timestamp: new Date().toISOString()
            });
        }

        logger.info(`Starting RMV appointment check for ${selectedCenters?.length || 0} centers`);
        logger.info(`RMV URL: ${rmvUrl}`);
        logger.info(`Extract user data: ${extractUserData || false}`);

        // Initialize scraper if not already initialized
        if (!service.scraper.browser) {
            logger.info('Initializing Puppeteer browser...');
            await service.scraper.initialize();
        }

        // Create enhanced scraper for user data extraction
        const enhancedScraper = new EnhancedRMVScraper(service.scraper, logger);

        let appointments = [];
        let userData = null;

        try {
            if (extractUserData) {
                // Use enhanced scraper that also extracts user data
                const result = await enhancedScraper.checkRMVUrlWithUserData(
                    rmvUrl,
                    userPreferences || { centers: selectedCenters }
                );

                appointments = result.appointments || [];
                userData = result.userData;

                logger.info('User data extraction results:', {
                    found: userData?.foundUserInfo,
                    hasValidData: userData?.validated?.isValid,
                    source: userData?.extracted?.source
                });

                // If we found user data, save it for auto-fill
                if (userData?.validated?.isValid) {
                    await saveExtractedUserData(userData);
                }

            } else {
                // Regular appointment check without user data extraction
                appointments = await service.scraper.checkRMVUrl(
                    rmvUrl,
                    { ...userPreferences, centers: selectedCenters }
                );
            }

            // Log appointments to database
            if (appointments && appointments.length > 0) {
                logger.info(`Found ${appointments.length} appointments!`);

                for (const apt of appointments) {
                    await db.logAppointment({
                        ...apt,
                        source: 'api_check'
                    });
                }
            }

        } catch (scrapeError) {
            logger.error('Scraping error:', scrapeError);
            throw scrapeError;
        }

        // Return results with user data if extracted
        const response = {
            success: true,
            found: appointments.length > 0,
            appointments: appointments,
            timestamp: new Date().toISOString(),
            message: appointments.length > 0 ?
                `Found ${appointments.length} available appointment(s)` :
                'No appointments currently available'
        };

        if (userData) {
            response.userData = {
                found: userData.foundUserInfo,
                autoFillAvailable: userData.validated?.isValid,
                fields: userData.validated?.cleaned || {},
                source: userData.extracted?.source,
                accessToken: userData.urlParams?.accessToken,
                sessionId: userData.urlParams?.sessionId
            };
        }

        res.json(response);

    } catch (error) {
        logger.error('Error checking appointments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check appointments',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// New endpoint specifically for extracting user data from URL
app.post('/api/extract-user-data', async (req, res) => {
    try {
        const { rmvUrl } = req.body;

        if (!rmvUrl) {
            return res.status(400).json({
                success: false,
                error: 'RMV URL is required'
            });
        }

        logger.info('Extracting user data from RMV URL...');

        // Initialize browser if needed
        if (!service.scraper.browser) {
            await service.scraper.initialize();
        }

        const page = await service.scraper.browser.newPage();

        try {
            const extractor = new RMVUserDataExtractor(logger);

            // Setup response capture
            await extractor.setupResponseCapture(page);

            // Navigate to the URL
            await page.goto(rmvUrl, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Extract user data
            const userData = await extractor.extractUserDataFromPage(page);

            // Validate the data
            const validated = extractor.validateUserData(userData);

            // Extract URL parameters
            const urlData = extractor.extractFromURLParams(rmvUrl);

            res.json({
                success: true,
                found: userData.found,
                autoFillAvailable: validated.isValid,
                extracted: {
                    firstName: validated.cleaned.firstName || null,
                    lastName: validated.cleaned.lastName || null,
                    email: validated.cleaned.email || null,
                    phone: validated.cleaned.phoneFormatted || null,
                    rawPhone: validated.cleaned.phone || null
                },
                source: userData.source,
                urlParams: {
                    accessToken: urlData.accessToken,
                    sessionId: urlData.sessionId
                },
                errors: validated.errors,
                timestamp: new Date().toISOString()
            });

        } finally {
            await page.close();
        }

    } catch (error) {
        logger.error('Error extracting user data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to extract user data',
            details: error.message
        });
    }
});

// Retry logic for appointment scraping with browser restart capability
async function fastAppointmentsScrapingWithRetry(rmvUrl, selectedCenters, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.info(`🔍 Appointment scraping attempt ${attempt}/${maxRetries}...`);
            
            return await fastAppointmentsScraping(rmvUrl, selectedCenters);
            
        } catch (error) {
            logger.warn(`⚠️ Attempt ${attempt} failed: ${error.message}`);
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Check if we need to restart browser
            const needsBrowserRestart = 
                error.message.includes('Target closed') ||
                error.message.includes('Protocol error') ||
                error.message.includes('Session closed') ||
                error.message.includes('Target.createTarget timed out');
                
            if (needsBrowserRestart) {
                logger.info('🔄 Browser restart needed for appointment scraping, reinitializing...');
                try {
                    if (service.scraper.browser) {
                        await service.scraper.browser.close();
                        service.scraper.browser = null;
                    }
                    await service.scraper.initialize();
                } catch (restartError) {
                    logger.error('❌ Browser restart failed:', restartError.message);
                }
            }
            
            // Progressive backoff: 2s, 4s, 8s
            const delay = 2000 * attempt;
            logger.info(`⏱️ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Fast appointments scraping function
async function fastAppointmentsScraping(rmvUrl, selectedCenters) {
    const startTime = Date.now();
    logger.info('🚀 Starting FAST appointments scraping...');
    logger.info(`📍 URL: ${rmvUrl?.substring(0, 50)}...`);
    logger.info(`📋 Selected centers: ${selectedCenters?.join(', ')}`);

    if (!service.scraper.browser) {
        throw new Error('Browser not initialized');
    }
    const page = await service.scraper.browser.newPage();
    const appointments = [];

    try {
        // Enhanced anti-detection measures
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });
        
        // Set realistic browser properties to avoid detection
        await page.evaluateOnNewDocument(() => {
            // Override the navigator.webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
            
            // Mock realistic screen properties
            Object.defineProperty(screen, 'width', { get: () => 1920 });
            Object.defineProperty(screen, 'height', { get: () => 1080 });
            Object.defineProperty(screen, 'availWidth', { get: () => 1920 });
            Object.defineProperty(screen, 'availHeight', { get: () => 1040 });
            
            // Add some realistic plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' }
                ],
            });
        });
        
        // More selective resource blocking to avoid detection
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            // Only block heavy resources, keep CSS for proper rendering
            if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
                req.abort();
            } else {
                req.continue();
            }
        });

        // STEP 1: Navigate to RMV page with aggressive timeout
        logger.info('🌐 Loading RMV page with fast settings...');
        await page.goto(rmvUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 10000 
        });
        
        // Quick wait for dynamic content
        await new Promise(resolve => setTimeout(resolve, 1500));

        // STEP 2: Extract offices quickly
        const offices = await page.evaluate(() => {
            const officeList = [];
            const buttons = document.querySelectorAll('.QflowObjectItem[data-id]');
            buttons.forEach(btn => {
                const name = btn.textContent.split('\n')[0].trim();
                const dataId = btn.getAttribute('data-id');
                if (name && dataId) {
                    officeList.push({ name, dataId });
                }
            });
            return officeList;
        });

        logger.info(`⚡ Found ${offices.length} offices in ${Date.now() - startTime}ms`);

        // STEP 3: Filter matching offices
        const matchedOffices = offices.filter(office => 
            selectedCenters.some(selected => 
                office.name.toLowerCase().includes(selected.toLowerCase()) ||
                selected.toLowerCase().includes(office.name.toLowerCase())
            )
        );

        if (matchedOffices.length === 0 && offices.length > 0) {
            matchedOffices.push(...offices.slice(0, 2)); // Limit to 2 for speed
        }

        logger.info(`🎯 Processing ${matchedOffices.length} matched offices: ${matchedOffices.map(o => o.name).join(', ')}`);

        // STEP 4: Process offices with enhanced reliability and anti-detection
        for (const office of matchedOffices) {
            try {
                logger.info(`🏢 Processing ${office.name}...`);
                
                // Human-like mouse movement and click
                const element = await page.$(`.QflowObjectItem[data-id="${office.dataId}"]`);
                if (!element) {
                    logger.warn(`⚠️ Office element not found: ${office.name}`);
                    continue;
                }
                
                // Scroll element into view naturally
                await element.scrollIntoView();
                await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200)); // Random delay 300-500ms
                
                // Verify page stability before mouse interaction
                try {
                    await page.evaluate(() => document.readyState);
                    await new Promise(resolve => setTimeout(resolve, 500)); // Additional stability wait
                } catch (stabilityError) {
                    throw new Error(`Page stability check failed: ${stabilityError.message}`);
                }

                // Get element bounds for realistic click with enhanced error handling
                const box = await element.boundingBox();
                if (box) {
                    try {
                        // Click at center with slight randomness
                        const x = box.x + box.width / 2 + (Math.random() - 0.5) * 10;
                        const y = box.y + box.height / 2 + (Math.random() - 0.5) * 10;
                        await page.mouse.click(x, y, { delay: 50 + Math.random() * 50 });
                        logger.info(`✅ Clicked ${office.name}, waiting for page response...`);
                    } catch (clickError) {
                        // If mouse click fails, try element.click() as fallback
                        logger.warn(`⚠️ Mouse click failed for ${office.name}, trying fallback: ${clickError.message}`);
                        await element.click();
                        logger.info(`✅ Fallback click succeeded for ${office.name}`);
                    }
                } else {
                    // Fallback to regular click
                    await element.click();
                    logger.info(`✅ Standard click for ${office.name}`);
                }
                
                // More robust navigation waiting with multiple fallback strategies
                let navigationSuccessful = false;
                try {
                    // First, wait a bit for the click to register
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    await Promise.race([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
                            .then(() => { navigationSuccessful = true; }),
                        page.waitForSelector('.ServiceAppointmentDateTime[data-datetime], .appointment-slot', { timeout: 15000 })
                            .then(() => { navigationSuccessful = true; }),
                        new Promise((resolve, reject) => 
                            setTimeout(() => reject(new Error('Timeout after 15 seconds')), 15000)
                        )
                    ]);
                } catch (navError) {
                    logger.warn(`⚠️ Navigation timeout for ${office.name}, trying to continue anyway...`);
                    // Give it more time to load
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }

                // Hybrid appointment extraction (rmv1 + rmv2 selectors for better compatibility)
                const officeAppointments = await page.evaluate((officeName, rmvUrl, officeDataId) => {
                    const slots = [];
                    
                    // Try rmv1's simpler selector first (.appointment-slot)
                    let elements = document.querySelectorAll('.appointment-slot');
                    let selectorUsed = 'rmv1-style';
                    
                    // Fallback to current rmv2 selector if rmv1 doesn't work
                    if (elements.length === 0) {
                        elements = document.querySelectorAll('.ServiceAppointmentDateTime[data-datetime]');
                        selectorUsed = 'rmv2-style';
                    }
                    
                    console.log(`Found ${elements.length} elements using ${selectorUsed} selector`);
                    
                    // Debug: Log details of first few elements
                    if (elements.length > 0) {
                        console.log('Sample element analysis:');
                        for (let i = 0; i < Math.min(3, elements.length); i++) {
                            const el = elements[i];
                            console.log(`Element ${i+1}:`, {
                                text: el.textContent?.trim().substring(0, 50),
                                classes: el.className,
                                hasDataDatetime: !!el.getAttribute('data-datetime'),
                                dataDatetime: el.getAttribute('data-datetime')
                            });
                        }
                    }
                    
                    elements.forEach(el => {
                        if (selectorUsed === 'rmv1-style') {
                            // rmv1 approach - simpler extraction
                            const displayTime = el.textContent.trim();
                            const isAvailable = !el.classList.contains('disabled') && 
                                              !el.classList.contains('unavailable');
                            
                            if (displayTime && isAvailable && displayTime.match(/\d+:\d+/)) {
                                slots.push({
                                    center: officeName,
                                    date: new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }),
                                    time: displayTime,
                                    url: rmvUrl,
                                    raw: displayTime,
                                    type: 'rmv1-compatible',
                                    datetime: displayTime,
                                    officeName: officeName,
                                    officeId: officeDataId
                                });
                            }
                        } else {
                            // rmv2 approach - current method with data-datetime
                            const dateTime = el.getAttribute('data-datetime');
                            const displayTime = el.textContent.trim();
                            const isAvailable = !el.classList.contains('disabled') && 
                                              !el.classList.contains('unavailable');
                            
                            if (dateTime && displayTime && isAvailable) {
                                const dt = new Date(dateTime);
                                slots.push({
                                    center: officeName,
                                    date: dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }),
                                    time: displayTime,
                                    url: rmvUrl,
                                    raw: displayTime,
                                    type: 'rmv2-compatible',
                                    datetime: dt.toLocaleString('en-US'),
                                    officeName: officeName,
                                    officeId: officeDataId
                                });
                            }
                        }
                    });
                    
                    // Return debugging info along with slots
                    const debugInfo = elements.length > 0 ? {
                        sampleElements: Array.from(elements).slice(0, 3).map((el, i) => ({
                            index: i + 1,
                            text: el.textContent?.trim().substring(0, 50),
                            classes: el.className,
                            hasDataDatetime: !!el.getAttribute('data-datetime'),
                            dataDatetime: el.getAttribute('data-datetime'),
                            hasDisabled: el.classList.contains('disabled'),
                            hasUnavailable: el.classList.contains('unavailable'),
                            hasValid: el.classList.contains('valid')
                        }))
                    } : null;
                    
                    return { slots, selectorUsed, elementsFound: elements.length, debugInfo };
                }, office.name, rmvUrl, office.dataId);

                appointments.push(...officeAppointments.slots);
                logger.info(`✅ Found ${officeAppointments.slots.length} appointments for ${office.name} (using ${officeAppointments.selectorUsed}, ${officeAppointments.elementsFound} elements)`);
                
                // Debug logging for element analysis
                if (officeAppointments.debugInfo && officeAppointments.elementsFound > 0 && officeAppointments.slots.length === 0) {
                    logger.info(`🔍 Debug - Found elements but no appointments. Sample analysis:`);
                    officeAppointments.debugInfo.sampleElements.forEach(el => {
                        logger.info(`  Element ${el.index}: text="${el.text}", classes="${el.classes}", hasValid=${el.hasValid}, hasDisabled=${el.hasDisabled}, hasDataDatetime=${el.hasDataDatetime}`);
                    });
                }

                // Quick navigation back to office list (except for last office)
                if (office !== matchedOffices[matchedOffices.length - 1]) {
                    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 4000 });
                    await new Promise(resolve => setTimeout(resolve, 300));
                }

            } catch (error) {
                logger.warn(`⚠️ Error processing ${office.name}: ${error.message}`);
                
                // If page was closed/crashed, try to recover
                if (error.message.includes('Target closed') || error.message.includes('Protocol error')) {
                    logger.info(`🔄 Page crashed for ${office.name}, attempting recovery...`);
                    try {
                        // Check if page is still valid
                        if (page.isClosed()) {
                            logger.info(`🆕 Creating new page for recovery...`);
                            await page.close().catch(() => {}); // Ignore errors
                            page = await service.scraper.browser.newPage();
                            
                            // Reapply anti-detection measures
                            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                            await page.setViewport({ width: 1366, height: 768 });
                            
                            // Re-navigate to main page
                            await page.goto(rmvUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            logger.info(`🔄 Page recovered, but skipping ${office.name} for this cycle`);
                        }
                    } catch (recoveryError) {
                        logger.error(`❌ Failed to recover page: ${recoveryError.message}`);
                        break; // Exit the loop if we can't recover
                    }
                }
            }
        }

        const duration = Date.now() - startTime;
        logger.info(`🏁 FAST scraping completed: ${appointments.length} appointments in ${duration}ms`);

        return appointments;

    } finally {
        await page.close();
    }
}

// Fast personal data extraction endpoint
app.post('/api/extract-personal-data', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        if (!url.includes('rmvmassdotappt.cxmflow.com')) {
            return res.status(400).json({ error: 'Invalid RMV URL format' });
        }

        logger.info('Starting fast personal data extraction...');

        const MinimalRMVExtractor = require('./rmv-personal-data-extractor');
        const extractor = new MinimalRMVExtractor();
        
        const personalData = await extractor.extractPersonalData(url);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        logger.info('Fast extraction completed:', {
            duration: `${duration}s`,
            foundFields: Object.keys(personalData).filter(key => personalData[key] && key !== 'extractionMethod')
        });

        res.json({
            success: true,
            personalData: personalData,
            duration: duration
        });

    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.error('Fast extraction failed:', error.message);
        
        res.status(500).json({
            error: error.message,
            duration: duration
        });
    }
});

// New endpoint to discover available locations from RMV URL
// Retry logic with browser restart capability
async function discoverLocationsWithRetry(rmvUrl, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.info(`🔍 Location discovery attempt ${attempt}/${maxRetries} for URL...`);
            
            // Initialize browser if needed
            if (!service.scraper.browser) {
                await service.scraper.initialize();
            }

            const page = await service.scraper.browser.newPage();
            
            try {
                // Set user agent to avoid detection
                await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                
                // Navigate to RMV page
                await page.goto(rmvUrl, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 10000 
                });

                // Extract location data
                const locationData = await page.evaluate(() => {
                    const data = { locations: [], offices: [] };
                    
                    // NEW: Extract appointment type information from DisplayData section
                    const displayDataSection = document.querySelector('.DisplayData');
                    console.log('🔍 DEBUG: DisplayData section found:', !!displayDataSection);
                    
                    if (displayDataSection) {
                        console.log('📋 DEBUG: DisplayData innerHTML:', displayDataSection.innerHTML);
                        
                        // Extract Service
                        const serviceElement = displayDataSection.querySelector('.displaydata-text');
                        const serviceText = serviceElement?.textContent?.trim();
                        
                        // Extract Appointment Type (second displaydata-text element)
                        const appointmentTypeElements = displayDataSection.querySelectorAll('.displaydata-text');
                        const appointmentTypeText = appointmentTypeElements[1]?.textContent?.trim();
                        
                        console.log('🎯 DEBUG: Service extracted:', serviceText);
                        console.log('📝 DEBUG: Appointment Type extracted:', appointmentTypeText);
                        
                        data.appointmentInfo = {
                            service: serviceText || null,
                            appointmentType: appointmentTypeText || null
                        };
                    } else {
                        console.log('⚠️ DEBUG: DisplayData section not found on this page');
                        console.log('📄 DEBUG: Current page title:', document.title);
                        console.log('🔍 DEBUG: Available classes:', Array.from(document.querySelectorAll('[class*="display"], [class*="Display"]')).map(el => el.className));
                    }
                    
                    // Primary method: Extract from window.displayData
                    if (window.displayData && Array.isArray(window.displayData)) {
                        data.locations = window.displayData.map(location => ({
                            id: location.Id,
                            name: location.Name,
                            displayName: location.DisplayName || location.Name,
                            address: location.Address,
                            latitude: location.Latitude,
                            longitude: location.Longitude
                        }));
                    }
                    
                    // Secondary method: Extract from DOM buttons
                    const qflowButtons = document.querySelectorAll('.QflowObjectItem[data-id]');
                    qflowButtons.forEach(button => {
                        const nameElement = button.querySelector('h3, .office-name, [class*="name"]');
                        const addressElement = button.querySelector('p, .office-address, [class*="address"]');
                        
                        if (nameElement) {
                            data.offices.push({
                                id: button.getAttribute('data-id'),
                                name: nameElement.textContent?.trim() || 'Unknown Location',
                                address: addressElement?.textContent?.trim() || 'Address not available'
                            });
                        }
                    });
                    
                    return data;
                });

                await page.close();
                return locationData;
                
            } catch (pageError) {
                await page.close();
                throw pageError;
            }
            
        } catch (error) {
            logger.warn(`⚠️ Attempt ${attempt} failed: ${error.message}`);
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Check if we need to restart browser
            const needsBrowserRestart = 
                error.message.includes('Execution context was destroyed') ||
                error.message.includes('Target closed') ||
                error.message.includes('Target.createTarget timed out') ||
                error.message.includes('Protocol error');
                
            if (needsBrowserRestart) {
                logger.info('🔄 Browser restart needed, reinitializing...');
                try {
                    if (service.scraper.browser) {
                        await service.scraper.browser.close();
                        service.scraper.browser = null;
                    }
                    await service.scraper.initialize();
                } catch (restartError) {
                    logger.error('❌ Browser restart failed:', restartError.message);
                }
            }
            
            // Progressive backoff: 2s, 4s, 8s
            const delay = 2000 * attempt;
            logger.info(`⏱️ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

app.post('/api/discover-locations', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { rmvUrl } = req.body;

        if (!rmvUrl) {
            return res.status(400).json({ 
                success: false,
                error: 'RMV URL is required' 
            });
        }

        if (!rmvUrl.includes('rmvmassdotappt.cxmflow.com')) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid RMV URL format' 
            });
        }

        logger.info('🔍 Starting location discovery from RMV URL...');

        const locationData = await discoverLocationsWithRetry(rmvUrl);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        logger.info(`✅ Location discovery completed in ${duration}s:`, {
            hasDisplayData: true,
            locationsFound: locationData.locations.length,
            officesFound: locationData.offices.length
        });

        // Return the discovered locations
        res.json({
            success: true,
            locations: locationData.locations,
            offices: locationData.offices,
            appointmentInfo: locationData.appointmentInfo || null,
            totalFound: locationData.locations.length || locationData.offices.length,
            duration: duration,
            message: `Found ${locationData.locations.length || locationData.offices.length} available locations`
        });

    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.error('❌ Location discovery failed:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message,
            duration: duration
        });
    }
});

// Helper function to save extracted user data
async function saveExtractedUserData(userData) {
    try {
        const data = await db.load();

        // Create or update extracted data cache
        if (!data.extractedUserData) {
            data.extractedUserData = {};
        }

        const sessionId = userData.urlParams?.sessionId;
        if (sessionId) {
            data.extractedUserData[sessionId] = {
                ...userData.validated.cleaned,
                extractedAt: new Date().toISOString(),
                accessToken: userData.urlParams.accessToken
            };

            await db.save(data);
            logger.info(`Saved extracted user data for session: ${sessionId}`);
        }
    } catch (error) {
        logger.error('Error saving extracted user data:', error);
    }
}

// Updated frontend JavaScript to use auto-fill
const frontendAutoFillScript = `
<script>
// Add this to your index-improved.html

let extractedUserData = null;

// Function to check for user data when URL is entered
async function checkForUserData() {
    const rmvUrl = document.getElementById('rmvUrl').value;

    if (!rmvUrl || !rmvUrl.includes('rmvmassdotappt.cxmflow.com')) {
        return;
    }

    // Show loading indicator
    showAutoFillLoading();

    try {
        const response = await fetch('/api/extract-user-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rmvUrl })
        });

        const data = await response.json();

        if (data.success && data.autoFillAvailable) {
            extractedUserData = data.extracted;
            showAutoFillPrompt(data.extracted);
        } else if (data.found) {
            addLog('Some user data found but incomplete. Please fill in the missing fields.', 'info');
            partialAutoFill(data.extracted);
        } else {
            addLog('No user data found in URL. Please enter your information manually.', 'info');
        }
    } catch (error) {
        console.error('Error extracting user data:', error);
        addLog('Could not extract user data from URL', 'warning');
    } finally {
        hideAutoFillLoading();
    }
}

// Function to show auto-fill prompt
function showAutoFillPrompt(userData) {
    const promptHtml = \`
        <div class="autofill-prompt" id="autoFillPrompt">
            <div class="autofill-header">
                <h3>🎉 User Information Detected!</h3>
                <button onclick="closeAutoFillPrompt()" class="close-btn">×</button>
            </div>
            <div class="autofill-content">
                <p>We found your information from the RMV URL:</p>
                <ul>
                    \${userData.firstName ? '<li>First Name: ' + userData.firstName + '</li>' : ''}
                    \${userData.lastName ? '<li>Last Name: ' + userData.lastName + '</li>' : ''}
                    \${userData.email ? '<li>Email: ' + userData.email + '</li>' : ''}
                    \${userData.phone ? '<li>Phone: ' + userData.phone + '</li>' : ''}
                </ul>
                <div class="autofill-actions">
                    <button onclick="applyAutoFill()" class="btn btn-primary">Use This Information</button>
                    <button onclick="closeAutoFillPrompt()" class="btn btn-secondary">Enter Manually</button>
                </div>
            </div>
        </div>
    \`;

    // Add to page
    const container = document.createElement('div');
    container.innerHTML = promptHtml;
    document.body.appendChild(container.firstElementChild);
}

// Function to apply auto-fill
function applyAutoFill() {
    if (extractedUserData) {
        if (extractedUserData.firstName) {
            document.getElementById('firstName').value = extractedUserData.firstName;
        }
        if (extractedUserData.lastName) {
            document.getElementById('lastName').value = extractedUserData.lastName;
        }
        if (extractedUserData.email) {
            document.getElementById('email').value = extractedUserData.email;
        }
        if (extractedUserData.rawPhone) {
            document.getElementById('phone').value = extractedUserData.rawPhone;
        }

        addLog('User information auto-filled successfully!', 'success');

        // Mark fields as validated
        document.querySelectorAll('.auto-filled').forEach(el => {
            el.classList.add('validated');
        });
    }

    closeAutoFillPrompt();
}

// Partial auto-fill for incomplete data
function partialAutoFill(userData) {
    if (userData.firstName && document.getElementById('firstName').value === '') {
        document.getElementById('firstName').value = userData.firstName;
        document.getElementById('firstName').classList.add('auto-filled');
    }
    if (userData.lastName && document.getElementById('lastName').value === '') {
        document.getElementById('lastName').value = userData.lastName;
        document.getElementById('lastName').classList.add('auto-filled');
    }
    if (userData.email && document.getElementById('email').value === '') {
        document.getElementById('email').value = userData.email;
        document.getElementById('email').classList.add('auto-filled');
    }
    if (userData.rawPhone && document.getElementById('phone').value === '') {
        document.getElementById('phone').value = userData.rawPhone;
        document.getElementById('phone').classList.add('auto-filled');
    }
}

// Close auto-fill prompt
function closeAutoFillPrompt() {
    const prompt = document.getElementById('autoFillPrompt');
    if (prompt) {
        prompt.remove();
    }
}

// Add event listener to RMV URL field
document.getElementById('rmvUrl').addEventListener('blur', checkForUserData);
document.getElementById('rmvUrl').addEventListener('paste', () => {
    setTimeout(checkForUserData, 100);
});

// Modified start monitoring to include user data extraction
async function startMonitoringWithExtraction() {
    if (!validateForm()) return;

    const formData = {
        rmvUrl: document.getElementById('rmvUrl').value,
        selectedCenters: Array.from(selectedCenters),
        userPreferences: {
            startTime: document.getElementById('startTimeSlider').value,
            endTime: document.getElementById('endTimeSlider').value,
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value
        },
        extractUserData: true // Enable user data extraction
    };

    // Call the API with extraction enabled
    const response = await fetch('/api/check-appointments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (data.userData && data.userData.found) {
        addLog('User data extracted from RMV session', 'success');
    }

    // Continue with normal monitoring...
}

// CSS for auto-fill prompt
const autoFillStyles = \`
<style>
.autofill-prompt {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 15px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    padding: 25px;
    z-index: 10000;
    max-width: 500px;
    animation: slideIn 0.3s ease;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translate(-50%, -60%);
    }
    to {
        opacity: 1;
        transform: translate(-50%, -50%);
    }
}

.autofill-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 2px solid #f0f0f0;
}

.autofill-header h3 {
    margin: 0;
    color: #667eea;
}

.close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #999;
}

.autofill-content ul {
    list-style: none;
    padding: 0;
    margin: 15px 0;
}

.autofill-content li {
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
}

.autofill-actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
}

.auto-filled {
    background-color: #e8f5e9 !important;
    border-color: #4caf50 !important;
}

.auto-filled.validated {
    border-color: #2e7d32 !important;
}

.autofill-loading {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
}

.autofill-loading::after {
    content: '⚡';
    animation: pulse 1s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
</style>
\`;

// Add styles to page
document.head.insertAdjacentHTML('beforeend', autoFillStyles);
<\/script>
`;

// Active monitoring sessions storage
let activeMonitoringSessions = new Map();

// Start/Stop monitoring endpoints
app.post('/api/start-monitoring', async (req, res) => {
    try {
        const { rmvUrl, selectedCenters, preferences, personalData } = req.body;
        
        if (!rmvUrl || !selectedCenters || selectedCenters.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'RMV URL and selected centers are required'
            });
        }

        // Generate session ID
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Clear all existing sessions before starting new monitoring
        const oldSessionCount = activeMonitoringSessions.size;
        activeMonitoringSessions.clear();
        if (oldSessionCount > 0) {
            logger.info(`🧹 Cleared ${oldSessionCount} old monitoring sessions before starting new session ${sessionId}`);
        }
        
        // Debug: Log what we received from frontend
        logger.info(`🔍 Debug: Received data for ${sessionId}:`, {
            rmvUrl: rmvUrl?.substring(0, 50) + '...',
            selectedCenters: selectedCenters,
            preferences: preferences,
            selectedCentersLength: selectedCenters?.length,
            selectedCentersType: typeof selectedCenters
        });

        // Store monitoring session
        activeMonitoringSessions.set(sessionId, {
            rmvUrl,
            selectedCenters,
            preferences: preferences || {},
            personalData: personalData || {},
            startedAt: new Date().toISOString(),
            lastChecked: null,
            appointmentsFound: []
        });

        logger.info(`🟢 Started monitoring session ${sessionId} for ${selectedCenters?.length || 0} locations`);
        
        // Trigger immediate appointment check for this new session
        logger.info(`⚡ Running immediate check for new session ${sessionId}`);
        setTimeout(async () => {
            try {
                const session = activeMonitoringSessions.get(sessionId);
                if (session) {
                    await processMonitoringSession(sessionId, session);
                }
            } catch (error) {
                logger.error(`Error in immediate check for ${sessionId}:`, error.message);
            }
        }, 2000); // Give 2 seconds for response to complete
        
        res.json({
            success: true,
            sessionId,
            message: 'Monitoring started successfully',
            locationsCount: selectedCenters.length
        });

    } catch (error) {
        logger.error('Error starting monitoring:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/stop-monitoring', async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (sessionId && activeMonitoringSessions.has(sessionId)) {
            activeMonitoringSessions.delete(sessionId);
            logger.info(`🔴 Stopped monitoring session ${sessionId}`);
            
            res.json({
                success: true,
                message: 'Monitoring stopped successfully'
            });
        } else {
            // Stop all sessions if no specific sessionId
            const count = activeMonitoringSessions.size;
            activeMonitoringSessions.clear();
            logger.info(`🔴 Stopped all ${count} monitoring sessions`);
            
            res.json({
                success: true,
                message: `Stopped ${count} monitoring sessions`
            });
        }

    } catch (error) {
        logger.error('Error stopping monitoring:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Clear all monitoring sessions (for testing)
app.post('/api/clear-sessions', (req, res) => {
    const clearedCount = activeMonitoringSessions.size;
    activeMonitoringSessions.clear();
    logger.info(`🧹 Manually cleared ${clearedCount} monitoring sessions`);
    
    res.json({
        success: true,
        message: `Cleared ${clearedCount} monitoring sessions`
    });
});

// Health check endpoint for production monitoring
app.get('/api/health', async (req, res) => {
    const startTime = Date.now();
    let puppeteerHealthy = false;
    let error = null;
    
    try {
        // Test browser connectivity
        if (!service.scraper.browser) {
            await service.scraper.initialize();
        }
        
        const page = await service.scraper.browser.newPage();
        await page.goto('about:blank', { timeout: 5000 });
        await page.close();
        
        puppeteerHealthy = true;
        
    } catch (e) {
        error = e.message;
        logger.warn(`⚠️ Health check failed: ${error}`);
        
        // Try to restart browser if unhealthy
        try {
            if (service.scraper.browser) {
                await service.scraper.browser.close();
                service.scraper.browser = null;
            }
            await service.scraper.initialize();
            logger.info('🔄 Browser restarted during health check');
        } catch (restartError) {
            logger.error('❌ Browser restart failed during health check:', restartError.message);
        }
    }
    
    const responseTime = Date.now() - startTime;
    const isHealthy = puppeteerHealthy;
    
    if (isHealthy) {
        res.json({
            status: 'healthy',
            puppeteer: 'ok',
            responseTime: `${responseTime}ms`,
            activeSessions: activeMonitoringSessions.size,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(503).json({
            status: 'unhealthy',
            puppeteer: 'failed',
            error: error,
            responseTime: `${responseTime}ms`,
            activeSessions: activeMonitoringSessions.size,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    }
});

// Get monitoring status
app.get('/api/monitoring-status', (req, res) => {
    const sessions = Array.from(activeMonitoringSessions.entries()).map(([sessionId, session]) => ({
        sessionId,
        locationsCount: session.selectedCenters.length,
        startedAt: session.startedAt,
        lastChecked: session.lastChecked,
        appointmentsFound: Array.isArray(session.appointmentsFound) ? session.appointmentsFound.length : 0,
        appointments: session.appointmentsFound || []
    }));

    res.json({
        success: true,
        activeSessions: sessions.length,
        sessions: sessions,
        totalLocations: sessions.reduce((sum, s) => sum + s.locationsCount, 0)
    });
});

// Manual trigger for monitoring cycle (for testing)
app.post('/api/trigger-monitoring-cycle', async (req, res) => {
    try {
        logger.info('🔄 Manual monitoring cycle triggered');
        await runMonitoringCycle();
        
        res.json({
            success: true,
            message: 'Monitoring cycle completed',
            activeSessions: activeMonitoringSessions.size
        });
    } catch (error) {
        logger.error('❌ Manual monitoring cycle failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Main monitoring loop
async function runMonitoringCycle() {
    logger.info(`🔄 Monitoring cycle starting - found ${activeMonitoringSessions.size} active sessions`);
    
    if (activeMonitoringSessions.size === 0) {
        logger.info(`Checking for ${activeMonitoringSessions.size} active users`);
        return;
    }

    logger.info(`🔍 Processing ${activeMonitoringSessions.size} active monitoring sessions...`);
    
    // Debug: List all active sessions
    for (const [sessionId, session] of activeMonitoringSessions) {
        logger.info(`📋 Session ${sessionId}: ${session.selectedCenters.length} locations, started ${session.startedAt}`);
    }

    for (const [sessionId, session] of activeMonitoringSessions) {
        await processMonitoringSession(sessionId, session);
    }
}

// Process individual monitoring session
async function processMonitoringSession(sessionId, session) {
    try {
        logger.info(`📋 Processing session ${sessionId} (${session.selectedCenters.length} locations)`);
        
        // Use fast appointments scraping (5-8 seconds vs 19+ seconds)
        const appointments = await fastAppointmentsScrapingWithRetry(
            session.rmvUrl,
            session.selectedCenters
        );
        
        // Debug: Log the actual results structure
        logger.info(`🔍 Results for ${sessionId}:`, {
            appointmentsFound: appointments?.length || 0,
            isArray: Array.isArray(appointments),
            sampleAppointment: appointments?.[0]
        });
        
        if (Array.isArray(appointments) && appointments.length > 0) {
            logger.info(`✅ Found ${appointments.length} appointments for session ${sessionId}`);
            
            // Store results in session
            session.appointmentsFound = appointments;
            session.lastChecked = new Date().toISOString();
            
            // Here you could trigger notifications
            // await sendNotifications(session, appointments);
        } else {
            logger.info(`📅 No appointments found for session ${sessionId}`);
            session.lastChecked = new Date().toISOString();
        }

    } catch (error) {
        logger.error(`❌ Error processing session ${sessionId}: ${error.message}`);
        logger.error(`❌ Full error stack:`, error.stack);
        session.lastChecked = new Date().toISOString();
    }
}

// Start monitoring cycle
function startMonitoringCycle() {
    // Run immediately
    runMonitoringCycle();
    
    // Then run every 5 minutes
    setInterval(() => {
        logger.info('Starting appointment check cycle...');
        runMonitoringCycle();
    }, config.checkInterval * 60 * 1000);
}

// Start the server
async function startServer() {
    try {
        // Start HTTP server immediately for Railway health checks
        app.listen(config.port, async () => {
            logger.info('Starting RMV Monitor Service...');
            logger.info(`API Server running on port ${config.port}`);
            logger.info(`Service will expire on ${config.expireDate.toLocaleDateString()}`);
            
            try {
                // Initialize browser for scraping after server is running
                logger.info('Initializing Puppeteer browser...');
                await service.scraper.initialize();
                logger.info('RMV Monitor Service started successfully');
                
                // Start monitoring cycle
                startMonitoringCycle();
            } catch (browserError) {
                logger.error('Failed to initialize browser, but server is running:', browserError);
                // Server continues running even if browser initialization fails
                // This allows the service to be accessible for debugging
            }
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// Start the service
startServer();