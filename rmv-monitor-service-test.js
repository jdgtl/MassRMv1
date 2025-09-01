// Simple test version of the RMV monitor service
const express = require('express');
const cors = require('cors');
const path = require('path');
const winston = require('winston');
const puppeteer = require('puppeteer');
const { enhanceScraperWithDirectUrls } = require('./rmv-direct-url');

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

// Express API Server
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.static(__dirname)); // Serve files from root directory

// Serve the clean interface with RMV URL + ZIP input as default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Test API Routes
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        running: true,
        expiresAt: config.expireDate,
        timestamp: new Date().toISOString(),
        message: 'RMV Monitor Test Service is running!'
    });
});

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'Test endpoint working!',
        timestamp: new Date().toISOString()
    });
});

// Serve the original HTML file for comparison
app.get('/original', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the interactive demo
app.get('/demo', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'interactive.html'));
});

// Legacy appointment check endpoint (removed mock implementation)
app.post('/api/check-appointments', (req, res) => {
    logger.info('Legacy endpoint called - redirecting to /api/scrape-rmv-appointments');
    res.status(410).json({
        success: false,
        error: 'This endpoint has been deprecated. Use /api/scrape-rmv-appointments instead.',
        timestamp: new Date().toISOString()
    });
});

// Live RMV appointment scraping endpoint
app.post('/api/scrape-rmv-appointments', async (req, res) => {
    const { rmvUrl, selectedCenters, userPreferences } = req.body;
    
    logger.info(`Starting RMV scrape for ${selectedCenters.length} centers`);
    logger.info(`URL: ${rmvUrl}`);
    
    let retryCount = 0;
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds base delay
    
    while (retryCount < maxRetries) {
        try {
            const appointments = await scrapeRMVAppointments(rmvUrl, selectedCenters, userPreferences);
            
            res.json({
                success: true,
                found: appointments.length > 0,
                appointments: appointments,
                timestamp: new Date().toISOString(),
                scrapedCenters: selectedCenters.length,
                retryCount: retryCount
            });
            return;
            
        } catch (error) {
            retryCount++;
            logger.error(`RMV scraping attempt ${retryCount} failed:`, error.message);
            
            if (retryCount >= maxRetries) {
                logger.error('Max retry attempts reached, returning error');
                res.status(500).json({
                    success: false,
                    error: `Failed after ${maxRetries} attempts: ${error.message}`,
                    timestamp: new Date().toISOString(),
                    retryCount: retryCount - 1
                });
                return;
            }
            
            // Exponential backoff delay
            const delay = baseDelay * Math.pow(2, retryCount - 1);
            logger.info(`Retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
});

// Personal data extraction endpoint for clean UI
app.post('/api/extract-personal-data', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ 
                success: false,
                error: 'URL is required' 
            });
        }

        if (!url.includes('rmvmassdotappt.cxmflow.com')) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid RMV URL format' 
            });
        }

        logger.info('Starting personal data extraction from:', url.substring(0, 50) + '...');

        const MinimalRMVExtractor = require('./rmv-extractor-minimal');
        const extractor = new MinimalRMVExtractor();
        
        const personalData = await extractor.extractPersonalData(url);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        logger.info('Personal data extraction completed:', {
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
        logger.error('Personal data extraction failed:', error.message);
        
        let userFriendlyMessage = error.message;
        
        // Provide more helpful error messages based on specific failure types
        if (error.message.includes('No appointment selected')) {
            userFriendlyMessage = 'Unable to navigate to customer information page - this URL may not have available appointments right now, or may be an invalid RMV link. Please check that your URL is from a valid RMV appointment scheduling session.';
        } else if (error.message.includes('Navigation timeout')) {
            userFriendlyMessage = 'The RMV website took too long to respond. Please try again in a few minutes.';
        } else if (error.message.includes('net::ERR_')) {
            userFriendlyMessage = 'Unable to connect to the RMV website. Please check your internet connection and try again.';
        } else if (error.message.includes('Target closed') || error.message.includes('Protocol error')) {
            userFriendlyMessage = 'Connection to RMV was interrupted. Please try again.';
        } else if (error.message.includes('Browser launch') || error.message.includes('browser') || error.message.includes('page')) {
            userFriendlyMessage = 'Browser initialization failed. Please try again in a moment.';
        }
        
        res.status(500).json({
            success: false,
            error: userFriendlyMessage,
            duration: duration,
            debugInfo: {
                originalError: error.message,
                url: req.body.url ? req.body.url.substring(0, 50) + '...' : 'unknown'
            }
        });
    }
});

// Clear sessions endpoint for frontend compatibility
app.post('/api/clear-sessions', (req, res) => {
    logger.info('🧹 Clear sessions endpoint called (test server - no actual sessions to clear)');
    
    res.json({
        success: true,
        message: 'Test server - no sessions to clear'
    });
});

// Note: Advanced direct URL generation is now handled by the rmv-direct-url.js module
// The old generateDirectAppointmentURL function has been replaced with enhanceScraperWithDirectUrls

// Session management helper function
async function handleSessionManagement(page) {
    try {
        // Look for CSRF tokens
        const csrfToken = await page.evaluate(() => {
            const tokenInput = document.querySelector('input[name="__RequestVerificationToken"], input[name="_token"], input[name="csrf_token"]');
            return tokenInput ? tokenInput.value : null;
        });
        
        if (csrfToken) {
            logger.info('Found CSRF token, session is valid');
        }
        
        // Look for wizard navigation elements
        const wizardSteps = await page.evaluate(() => {
            const stepIndicators = document.querySelectorAll('.step, .wizard-step, [class*="step"], [class*="wizard"]');
            return Array.from(stepIndicators).map(el => ({
                text: el.textContent.trim(),
                classes: el.className,
                active: el.classList.contains('active') || el.classList.contains('current')
            }));
        });
        
        if (wizardSteps.length > 0) {
            logger.info(`Found ${wizardSteps.length} wizard steps`);
            const activeStep = wizardSteps.find(step => step.active);
            if (activeStep) {
                logger.info(`Currently on step: ${activeStep.text}`);
            }
        }
        
        // Navigate through wizard if needed
        await navigateToAppointmentStep(page);
        
    } catch (error) {
        logger.warn('Session management warning:', error.message);
    }
}

// Navigate through multi-step wizard to reach appointment selection
async function navigateToAppointmentStep(page) {
    try {
        // Look for "Next" or "Continue" buttons to advance through wizard
        const nextButton = await page.$('button:contains("Next"), button:contains("Continue"), input[value*="Next"], input[value*="Continue"]');
        
        if (nextButton) {
            logger.info('Found navigation button, attempting to advance wizard');
            await nextButton.click();
            await page.waitForTimeout(2000);
            
            // Wait for navigation or form submission
            try {
                await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
                logger.info('Wizard step navigation completed');
            } catch (navError) {
                logger.info('No navigation detected, wizard may have updated content in place');
            }
        }
        
        // Look for appointment-specific elements after navigation
        const appointmentSection = await page.$('[class*="appointment"], [id*="appointment"], .calendar, .time-slot');
        
        if (appointmentSection) {
            logger.info('Successfully reached appointment selection section');
            return true;
        }
        
        return false;
        
    } catch (error) {
        logger.warn('Wizard navigation warning:', error.message);
        return false;
    }
}

// RMV Scraping Function using Puppeteer
async function scrapeRMVAppointments(rmvUrl, selectedCenters, userPreferences) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    const appointments = [];
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    try {
        logger.info('Navigating to RMV booking page...');
        await page.goto(rmvUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Wait for the page to load completely
        await page.waitForTimeout(3000);
        
        // Handle potential multi-step wizard navigation
        const currentUrl = page.url();
        logger.info(`Current URL: ${currentUrl}`);
        
        // Check if we're on the appointment selection page
        const pageTitle = await page.title();
        logger.info(`Page title: ${pageTitle}`);
        
        // Session management: handle CSRF tokens and form data
        await handleSessionManagement(page);
        
        // Look for RMV-specific appointment elements
        const rmvOfficeSelection = await page.$('[class*="office"], [class*="location"], select[name*="office"], select[name*="location"]');
        const calendarExists = await page.$('.calendar, .appointment-calendar, [class*="calendar"], [class*="appointment"]');
        const datePickerExists = await page.$('input[type="date"], .date-picker, [class*="date"]');
        
        if (rmvOfficeSelection || calendarExists || datePickerExists) {
            logger.info('Found RMV appointment interface - extracting office locations and times');
            
            // Extract RMV office locations and appointment data
            const rmvData = await page.evaluate(() => {
                const data = {
                    offices: [],
                    appointments: [],
                    availabilityText: [],
                    officeDataIds: new Map(), // Map office names to data-id values
                    locationData: [], // Enhanced location data from window.displayData
                    sessionData: null, // Session data for wizard navigation
                    debugInfo: {
                        foundSelects: [],
                        foundRadios: [],
                        foundButtons: [],
                        allFormElements: [],
                        windowDisplayData: null,
                        formJourney: null
                    }
                };
                
                // ENHANCED: Extract structured location data from window.displayData
                try {
                    if (window.displayData && Array.isArray(window.displayData)) {
                        data.locationData = window.displayData.map(location => ({
                            id: location.Id,
                            name: location.Name,
                            address: location.Address,
                            latitude: location.Latitude,
                            longitude: location.Longitude,
                            workingHours: location.InfoPageWorkingHours || 'Standard hours',
                            extRef: location.ExtRef,
                            fullData: location // Keep full object for debugging
                        }));
                        data.debugInfo.windowDisplayData = `Found ${window.displayData.length} locations in window.displayData`;
                    } else {
                        data.debugInfo.windowDisplayData = 'window.displayData not available or not an array';
                    }
                } catch (error) {
                    data.debugInfo.windowDisplayData = `Error accessing window.displayData: ${error.message}`;
                }
                
                // ENHANCED: Capture session data
                try {
                    const formJourney = sessionStorage.getItem('formJourney');
                    data.sessionData = {
                        formJourney: formJourney,
                        cookies: document.cookie,
                        currentUrl: window.location.href,
                        timestamp: new Date().toISOString()
                    };
                    data.debugInfo.formJourney = formJourney ? 'formJourney captured' : 'formJourney not found';
                } catch (error) {
                    data.debugInfo.formJourney = `Error capturing session data: ${error.message}`;
                }
                
                // Debug: Find all form elements to understand the page structure
                const allSelects = document.querySelectorAll('select');
                const allRadios = document.querySelectorAll('input[type="radio"]');
                const allButtons = document.querySelectorAll('button');
                const allInputs = document.querySelectorAll('input');
                
                allSelects.forEach(sel => {
                    data.debugInfo.foundSelects.push({
                        name: sel.name,
                        id: sel.id,
                        className: sel.className,
                        options: Array.from(sel.options).map(opt => opt.text.trim()).filter(t => t.length > 0)
                    });
                });
                
                allRadios.forEach(radio => {
                    data.debugInfo.foundRadios.push({
                        name: radio.name,
                        id: radio.id,
                        value: radio.value,
                        className: radio.className,
                        nextSibling: radio.nextSibling?.textContent?.trim() || '',
                        parentText: radio.parentElement?.textContent?.trim() || ''
                    });
                });
                
                allButtons.forEach(btn => {
                    data.debugInfo.foundButtons.push({
                        text: btn.textContent.trim(),
                        className: btn.className,
                        id: btn.id,
                        disabled: btn.disabled
                    });
                });
                
                // PRECISE RMV LOCATION DETECTION: Based on actual landing page HTML structure
                
                // Primary method: RMV QflowObjectItem buttons (from actual locations-page.html)
                const qflowButtons = document.querySelectorAll('.QflowObjectItem[data-id]');
                if (qflowButtons.length > 0) {
                    console.log(`Found ${qflowButtons.length} QflowObjectItem location buttons`);
                    qflowButtons.forEach(btn => {
                        const officeName = btn.textContent.split('\n')[0].trim(); // First line is office name
                        const dataId = btn.getAttribute('data-id');
                        const fullText = btn.textContent.trim();
                        const subtitle = btn.querySelector('.subtitle')?.textContent?.trim() || '';
                        
                        if (officeName && dataId) {
                            data.offices.push({
                                name: officeName,
                                fullText: fullText,
                                subtitle: subtitle,
                                dataId: dataId,
                                selector: '.QflowObjectItem[data-id]'
                            });
                            data.officeDataIds.set(officeName, dataId);
                        }
                    });
                } else {
                    // Fallback 1: Check for specific RMV container IDs (from actual HTML structure)
                    const rmvContainerSelectors = [
                        '#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb .QflowObjectItem',  // First office selection step
                        '#539af26b-8d29-4bcc-9d48-a68591c638ce .QflowObjectItem',  // Alternative office selection step
                        '.ListView .QflowObjectItem'  // ListView container
                    ];
                    
                    let foundInContainer = false;
                    rmvContainerSelectors.forEach(containerSelector => {
                        if (!foundInContainer) {
                            const containerButtons = document.querySelectorAll(containerSelector);
                            if (containerButtons.length > 0) {
                                console.log(`Found ${containerButtons.length} locations in container: ${containerSelector}`);
                                foundInContainer = true;
                                
                                containerButtons.forEach(btn => {
                                    const officeName = btn.textContent.split('\n')[0].trim();
                                    const dataId = btn.getAttribute('data-id');
                                    const fullText = btn.textContent.trim();
                                    const subtitle = btn.querySelector('.subtitle')?.textContent?.trim() || '';
                                    
                                    if (officeName && dataId) {
                                        data.offices.push({
                                            name: officeName,
                                            fullText: fullText,
                                            subtitle: subtitle,
                                            dataId: dataId,
                                            selector: containerSelector
                                        });
                                        data.officeDataIds.set(officeName, dataId);
                                    }
                                });
                            }
                        }
                    });
                    
                    // Fallback 2: Generic button[data-id] search if containers not found
                    if (!foundInContainer) {
                        const genericButtons = document.querySelectorAll('button[data-id]');
                        if (genericButtons.length > 0) {
                            console.log(`Found ${genericButtons.length} generic buttons with data-id`);
                            genericButtons.forEach(btn => {
                                const officeName = btn.textContent.split('\n')[0].trim();
                                const dataId = btn.getAttribute('data-id');
                                const fullText = btn.textContent.trim();
                                
                                // Only include if text looks like a location
                                if (officeName && dataId && officeName.length > 2 && officeName.length < 50) {
                                    data.offices.push({
                                        name: officeName,
                                        fullText: fullText,
                                        subtitle: '',
                                        dataId: dataId,
                                        selector: 'button[data-id]'
                                    });
                                    data.officeDataIds.set(officeName, dataId);
                                }
                            });
                        }
                    }
                }
                
                // Look for appointment time slots
                const timeSelectors = [
                    'button[class*="appointment"]',
                    'button[class*="time"]',
                    'div[class*="time-slot"]',
                    'span[class*="time"]',
                    '.available-time',
                    '.time-slot',
                    '[data-time]',
                    '[data-date]',
                    'input[type="radio"][name*="time"]',
                    'input[type="radio"][name*="slot"]'
                ];
                
                timeSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const text = el.textContent || el.value || el.getAttribute('data-time') || '';
                        const timePattern = /(\d{1,2}:\d{2}[\s]*(AM|PM|am|pm))/i;
                        const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/;
                        
                        if (text && (timePattern.test(text) || datePattern.test(text))) {
                            data.appointments.push({
                                text: text.trim(),
                                element: selector,
                                available: !el.disabled && !el.classList.contains('disabled') && !el.classList.contains('unavailable')
                            });
                        }
                    });
                });
                
                // Look for availability messages
                const allText = document.body.innerText;
                const availabilityPatterns = [
                    /appointments? (?:are )?available/i,
                    /(\d+) appointments? found/i,
                    /next available(?:\s+appointment)?:?\s*([^\\n]+)/i,
                    /available times?:?\s*([^\\n]+)/i,
                    /(danvers|salem|boston|cambridge|brockton|lowell|worcester|springfield)[^\\n]*(\\d{1,2}:\\d{2}\\s*(?:am|pm))/i
                ];
                
                availabilityPatterns.forEach(pattern => {
                    const matches = allText.match(pattern);
                    if (matches) {
                        data.availabilityText.push(matches[0]);
                    }
                });
                
                return data;
            });
            
            logger.info(`Found ${rmvData.offices.length} offices and ${rmvData.appointments.length} potential appointment slots`);
            logger.info(`Availability text found: ${rmvData.availabilityText.length} matches`);
            
            // ENHANCED: Log location data and session info
            logger.info(`Enhanced location data: ${rmvData.debugInfo.windowDisplayData}`);
            logger.info(`Session data: ${rmvData.debugInfo.formJourney}`);
            if (rmvData.locationData && rmvData.locationData.length > 0) {
                logger.info(`Structured locations found: ${rmvData.locationData.length}`);
                rmvData.locationData.slice(0, 3).forEach(loc => {
                    logger.info(`  Location: ${loc.name} (ID: ${loc.id}) - ${loc.address}`);
                });
                if (rmvData.locationData.length > 3) {
                    logger.info(`  ... and ${rmvData.locationData.length - 3} more locations`);
                }
            }
            
            // Debug logging
            if (rmvData.debugInfo.foundSelects.length > 0) {
                logger.info(`Debug - Found ${rmvData.debugInfo.foundSelects.length} select elements:`);
                rmvData.debugInfo.foundSelects.forEach(sel => {
                    logger.info(`  Select: ${sel.name} (${sel.options.length} options) - ${sel.options.join(', ')}`);
                });
            }
            
            if (rmvData.debugInfo.foundRadios.length > 0) {
                logger.info(`Debug - Found ${rmvData.debugInfo.foundRadios.length} radio buttons:`);
                rmvData.debugInfo.foundRadios.slice(0, 5).forEach(radio => {
                    logger.info(`  Radio: ${radio.name}=${radio.value} - ${radio.parentText}`);
                });
            }
            
            if (rmvData.debugInfo.foundButtons.length > 0) {
                logger.info(`Debug - Found ${rmvData.debugInfo.foundButtons.length} buttons:`);
                rmvData.debugInfo.foundButtons.slice(0, 5).forEach(btn => {
                    logger.info(`  Button: "${btn.text}" (disabled: ${btn.disabled})`);
                });
            }
            
            // Process office locations
            const availableOffices = rmvData.offices.filter(office => 
                selectedCenters.some(selected => 
                    office.toLowerCase().includes(selected.toLowerCase()) ||
                    selected.toLowerCase().includes(office.toLowerCase())
                )
            );
            
            logger.info(`Matched ${availableOffices.length} offices: ${availableOffices.join(', ')}`);
            
            // ENHANCED: Use advanced direct URL construction to bypass anti-bot protection (PRIMARY METHOD)
            if (availableOffices.length > 0 && rmvData.locationData && rmvData.sessionData?.formJourney) {
                logger.info(`Found ${availableOffices.length} matching offices, using ADVANCED direct URL construction`);
                
                // Filter location data to match selected offices
                const matchingLocations = rmvData.locationData.filter(loc => {
                    return availableOffices.some(office => {
                        const officeName = office.split(/[\d\s,-]/)[0] || office.split(/[\s,]/)[0];
                        const locName = loc.name.toLowerCase();
                        const searchName = officeName.toLowerCase();
                        return locName.includes(searchName) || searchName.includes(locName);
                    });
                });
                
                logger.info(`Found ${matchingLocations.length} matching locations for direct URL generation`);
                matchingLocations.forEach(loc => logger.info(`  - ${loc.name} (ID: ${loc.id})`));
                
                try {
                    // Use advanced direct URL scraper
                    const directUrlResults = await enhanceScraperWithDirectUrls(
                        page, 
                        matchingLocations, 
                        rmvData.sessionData.formJourney
                    );
                    
                    logger.info(`Advanced direct URL scraper returned ${directUrlResults.length} results`);
                    
                    // Process results from advanced scraper
                    for (const result of directUrlResults) {
                        if (result.availableSlots && result.availableSlots.length > 0) {
                            logger.info(`✅ Found ${result.availableSlots.length} actual appointment slots for ${result.locationName}`);
                            
                            // Add each appointment slot as a separate appointment
                            result.availableSlots.forEach(slot => {
                                appointments.push({
                                    center: result.locationName,
                                    date: slot.date || userPreferences?.startDate || new Date().toLocaleDateString(),
                                    time: slot.time || slot.displayText,
                                    url: rmvUrl,
                                    raw: slot.displayText,
                                    type: 'direct-url-advanced',
                                    locationId: result.locationId,
                                    slotInfo: slot,
                                    method: result.method
                                });
                            });
                        } else {
                            logger.info(`No appointment slots found for ${result.locationName} - skipping (no fallback entries)`);
                            // No fallback entries - only return real appointments
                        }
                    }
                } catch (advancedScraperError) {
                    logger.error(`Advanced scraper failed: ${advancedScraperError.message}`);
                    // No fallback entries - only return real appointments when scraper works
                }
            } else {
                logger.warn('Insufficient data for advanced direct URL construction');
                if (!rmvData.locationData) logger.warn('- Missing location data');
                if (!rmvData.sessionData?.formJourney) logger.warn('- Missing formJourney session data');
                
                // No basic fallback - only return real appointments
            }
            
            // Process appointment slots with office context
            for (const slot of rmvData.appointments) {
                if (slot.available) {
                    const timeMatch = slot.text.match(/(\d{1,2}:\d{2}[\s]*(AM|PM|am|pm))/i);
                    const dateMatch = slot.text.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
                    
                    appointments.push({
                        center: availableOffices.length > 0 ? availableOffices[0] : 'RMV Location',
                        date: dateMatch ? dateMatch[1] : (userPreferences?.startDate || new Date().toLocaleDateString()),
                        time: timeMatch ? timeMatch[1] : slot.text,
                        url: rmvUrl,
                        raw: slot.text,
                        type: 'scraped',
                        offices: availableOffices
                    });
                }
            }
            
            // Add availability text as appointments if no structured slots found
            if (appointments.length === 0 && rmvData.availabilityText.length > 0) {
                rmvData.availabilityText.forEach(text => {
                    const timeMatch = text.match(/(\d{1,2}:\d{2}[\s]*(AM|PM|am|pm))/i);
                    const locationMatch = text.match(/(danvers|salem|boston|cambridge|brockton|lowell|worcester|springfield)/i);
                    
                    appointments.push({
                        center: locationMatch ? locationMatch[1] : 'RMV Location',
                        date: userPreferences?.startDate || new Date().toLocaleDateString(),
                        time: timeMatch ? timeMatch[1] : 'Available',
                        url: rmvUrl,
                        raw: text,
                        type: 'text-extracted'
                    });
                });
            }
            
            // Final fallback: If we found matching offices but no appointments, show office availability
            if (appointments.length === 0 && availableOffices.length > 0) {
                logger.info(`Creating fallback appointments for ${availableOffices.length} available offices`);
                
                // No office availability fallback - only return real appointments
            }
        } else {
            // Look for any text that might indicate appointment availability
            try {
                const pageContent = await page.evaluate(() => document.body.innerText);
                logger.info(`Page content preview: ${pageContent.substring(0, 500)}...`);
                
                // Check for common "no appointments" messages
                const noAppointmentMessages = [
                    'no appointments available',
                    'no available appointments',
                    'currently no appointments',
                    'appointments are not available',
                    'no times available',
                    'fully booked',
                    'try again later'
                ];
                
                const hasNoAppointments = noAppointmentMessages.some(msg => 
                    pageContent.toLowerCase().includes(msg)
                );
                
                // Check for error messages or blocked access
                const errorMessages = [
                    'access denied',
                    'blocked',
                    'captcha',
                    'verification required',
                    'too many requests',
                    'rate limit',
                    'temporarily unavailable',
                    'system error'
                ];
                
                const hasError = errorMessages.some(msg => 
                    pageContent.toLowerCase().includes(msg)
                );
                
                if (hasError) {
                    throw new Error('RMV system returned an error or blocked access');
                }
                
                if (hasNoAppointments) {
                    logger.info('Page indicates no appointments are available');
                } else {
                    // No fallback entries - only return real appointments
                    logger.info('No appointment structure recognized, returning empty results');
                }
            } catch (contentError) {
                logger.error('Error reading page content:', contentError.message);
                throw new Error('Failed to analyze page content for appointments');
            }
        }
        
    } catch (error) {
        logger.error('Error during scraping:', error.message);
        
        // Classify error types for better retry logic
        if (error.message.includes('timeout') || error.message.includes('navigation')) {
            throw new Error(`Network timeout while accessing RMV: ${error.message}`);
        } else if (error.message.includes('blocked') || error.message.includes('captcha')) {
            throw new Error(`RMV access blocked or requires verification: ${error.message}`);
        } else if (error.message.includes('page crashed') || error.message.includes('browser')) {
            throw new Error(`Browser error during scraping: ${error.message}`);
        } else {
            throw new Error(`Scraping failed: ${error.message}`);
        }
    } finally {
        try {
            await browser.close();
            logger.info('Browser closed successfully');
        } catch (closeError) {
            logger.warn('Warning: Failed to close browser:', closeError.message);
        }
    }
    
    logger.info(`Scraping completed. Found ${appointments.length} appointments`);
    return appointments;
}

// Start the server
async function startServer() {
    try {
        app.listen(config.port, () => {
            logger.info(`✅ RMV Monitor Test Server running on http://localhost:${config.port}`);
            logger.info(`✅ Service will expire on ${config.expireDate.toLocaleDateString()}`);
            logger.info(`📱 Open http://localhost:${config.port} in your browser to test`);
            logger.info(`🔍 Health check: http://localhost:${config.port}/health`);
            logger.info(`📋 Original UI: http://localhost:${config.port}/original`);
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