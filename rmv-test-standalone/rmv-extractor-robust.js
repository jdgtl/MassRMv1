// Robust RMV Personal Data Extractor
// Handles timeouts, session issues, and anti-automation better

const puppeteer = require('puppeteer');
const winston = require('winston');

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

class RobustRMVExtractor {
    constructor() {
        this.browser = null;
    }

    /**
     * Extract personal data with better error handling and timeouts
     */
    async extractPersonalData(url) {
        logger.info('🔍 Starting robust RMV personal data extraction...');
        logger.info(`📍 URL: ${url}`);

        try {
            // Initialize browser with anti-detection settings
            this.browser = await puppeteer.launch({
                headless: "new", // Use new headless mode to avoid deprecation
                defaultViewport: { width: 1366, height: 768 },
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-extensions',
                    '--no-first-run',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-translate',
                    '--hide-scrollbars',
                    '--metrics-recording-only',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--no-pings',
                    '--password-store=basic',
                    '--use-mock-keychain',
                    '--disable-component-extensions-with-background-pages',
                    '--disable-background-networking',
                    '--disable-background-timer-throttling',
                    '--disable-renderer-backgrounding',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-client-side-phishing-detection'
                ]
            });

            const page = await this.browser.newPage();
            
            // Set realistic user agent
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Set extra headers to appear more human
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9'
            });

            // Remove webdriver property
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
            });

            const personalData = await this.navigateAndExtractWithRetries(page, url);
            
            logger.info('✅ Personal data extraction completed successfully');
            return personalData;

        } catch (error) {
            logger.error('❌ Failed to extract personal data:', error.message);
            throw error;
        } finally {
            if (this.browser) {
                await this.browser.close();
                logger.info('🔒 Browser closed');
            }
        }
    }

    /**
     * Navigate with retry logic and better error handling
     */
    async navigateAndExtractWithRetries(page, url, maxRetries = 2) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info(`🎯 Attempt ${attempt}/${maxRetries}: Starting navigation...`);
                
                // Step 1: Load the initial page
                logger.info('📋 Step 1: Loading RMV appointment page...');
                await page.goto(url, { 
                    waitUntil: 'networkidle2', 
                    timeout: 30000 
                });
                
                await this.humanDelay(2000, 4000);
                
                const pageTitle = await page.title();
                logger.info(`📄 Page title: ${pageTitle}`);
                
                // Quick check for personal data on initial page
                const initialData = await this.extractPersonalDataFromPage(page);
                if (this.hasReadablePersonalData(initialData)) {
                    logger.info('✅ Found readable personal data on initial page');
                    return initialData;
                }
                
                // Step 2: Handle office selection with careful clicking
                logger.info('🏢 Step 2: Selecting office...');
                const officeResult = await this.selectOfficeCarefully(page);
                if (!officeResult) {
                    throw new Error('Failed to select office');
                }
                
                // Step 3: Try faster direct approach - look for customer info without full navigation
                logger.info('🔍 Step 3: Checking for customer information form...');
                
                // Wait for any forms to load
                await this.humanDelay(3000, 5000);
                
                // Check if we're already on customer info page
                const customerData = await this.extractPersonalDataFromPage(page);
                if (this.hasReadablePersonalData(customerData)) {
                    logger.info('✅ Found readable personal data after office selection');
                    return customerData;
                }
                
                // Step 4: Try to find appointment slots without expanding sections (safer approach)
                logger.info('⏰ Step 4: Looking for available appointment slots...');
                const appointmentResult = await this.selectAppointmentSafely(page);
                
                if (appointmentResult) {
                    // Step 5: Try to proceed to customer info
                    logger.info('➡️ Step 5: Proceeding to customer information...');
                    await this.proceedToCustomerInfo(page);
                    
                    await this.humanDelay(2000, 4000);
                    
                    // Final extraction
                    const finalData = await this.extractPersonalDataFromPage(page);
                    if (this.hasReadablePersonalData(finalData)) {
                        logger.info('✅ Successfully extracted personal data');
                        return finalData;
                    }
                }
                
                // Return whatever we could find
                logger.warn(`⚠️ Attempt ${attempt} completed but no readable data found`);
                return initialData;
                
            } catch (error) {
                logger.error(`❌ Attempt ${attempt} failed: ${error.message}`);
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Wait before retry
                await this.humanDelay(3000, 5000);
            }
        }
    }
    
    /**
     * Select office more carefully to avoid session issues
     */
    async selectOfficeCarefully(page) {
        try {
            // Look for offices
            await page.waitForSelector('.QflowObjectItem[data-id]', { timeout: 15000 });
            
            const offices = await page.evaluate(() => {
                const officeElements = document.querySelectorAll('.QflowObjectItem[data-id]');
                return Array.from(officeElements).slice(0, 3).map((element, index) => ({
                    index: index,
                    id: element.getAttribute('data-id'),
                    text: element.textContent.trim().split('\n')[0],
                    visible: element.offsetParent !== null
                }));
            });
            
            logger.info(`Found ${offices.length} offices`);
            
            // Try to click the first visible office
            for (const office of offices) {
                if (office.visible) {
                    logger.info(`🎯 Selecting office: ${office.text}`);
                    
                    try {
                        // Use JavaScript click to avoid session issues
                        await page.evaluate((dataId) => {
                            const element = document.querySelector(`[data-id="${dataId}"]`);
                            if (element) {
                                element.click();
                                return true;
                            }
                            return false;
                        }, office.id);
                        
                        await this.humanDelay(2000, 4000);
                        
                        // Wait for page to update
                        try {
                            await page.waitForFunction(
                                () => document.title.toLowerCase().includes('time') || 
                                      document.title.toLowerCase().includes('appointment') ||
                                      document.querySelector('.ServiceAppointmentDateTime'),
                                { timeout: 10000 }
                            );
                        } catch (waitError) {
                            logger.warn('⚠️ Page update wait failed, continuing...');
                        }
                        
                        return true;
                        
                    } catch (clickError) {
                        logger.warn(`⚠️ Failed to click office ${office.text}: ${clickError.message}`);
                    }
                }
            }
            
            return false;
            
        } catch (error) {
            logger.error(`❌ Office selection failed: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Select appointment more safely without expanding sections
     */
    async selectAppointmentSafely(page) {
        try {
            // Look for already visible appointments first
            let appointments = await page.$$('.ServiceAppointmentDateTime[data-datetime]:not(.disabled)');
            
            if (appointments.length === 0) {
                logger.info('🔍 No visible appointments found, checking page content...');
                return false;
            }
            
            logger.info(`Found ${appointments.length} appointments`);
            
            // Try to find and click a visible appointment
            for (let i = 0; i < Math.min(appointments.length, 5); i++) {
                try {
                    const appointment = appointments[i];
                    const isVisible = await appointment.evaluate(el => el.offsetParent !== null);
                    
                    if (isVisible) {
                        logger.info(`🎯 Clicking appointment ${i + 1}...`);
                        
                        // Use JavaScript click for reliability
                        await appointment.evaluate(el => el.click());
                        await this.humanDelay(2000, 3000);
                        
                        return true;
                    }
                } catch (clickError) {
                    logger.warn(`⚠️ Failed to click appointment ${i + 1}: ${clickError.message}`);
                }
            }
            
            return false;
            
        } catch (error) {
            logger.error(`❌ Appointment selection failed: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Try to proceed to customer info page
     */
    async proceedToCustomerInfo(page) {
        try {
            // Look for next/continue buttons
            const buttons = await page.$$('button, input[type="submit"]');
            
            for (const button of buttons) {
                try {
                    const text = await button.evaluate(el => el.textContent?.trim().toLowerCase() || '');
                    const isVisible = await button.evaluate(el => el.offsetParent !== null && !el.disabled);
                    
                    if (isVisible && (text.includes('next') || text.includes('continue'))) {
                        logger.info(`🔘 Clicking: "${text}"`);
                        await button.evaluate(el => el.click());
                        await this.humanDelay(3000, 5000);
                        return true;
                    }
                } catch (btnError) {
                    // Continue to next button
                }
            }
            
            return false;
            
        } catch (error) {
            logger.error(`❌ Failed to proceed to customer info: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Extract personal data from current page
     */
    async extractPersonalDataFromPage(page) {
        try {
            return await page.evaluate(() => {
                const personalData = {
                    firstName: '',
                    lastName: '',
                    email: '',
                    phone: '',
                    extractionMethod: 'robust_extraction',
                    extractionTimestamp: new Date().toISOString(),
                    sourceUrl: window.location.href,
                    pageTitle: document.title,
                    foundElements: []
                };

                // Helper function to get element selector
                function getElementSelector(element) {
                    if (element.id) return `#${element.id}`;
                    if (element.className) return `.${element.className.replace(/\s+/g, '.')}`;
                    return element.tagName.toLowerCase();
                }

                // Priority 1: Look for disabled form inputs (pre-filled user data)
                const disabledInputs = document.querySelectorAll('input[disabled][value]');
                disabledInputs.forEach(input => {
                    const value = input.value?.trim();
                    if (!value) return;

                    const classes = (input.className || '').toLowerCase();
                    const name = (input.name || '').toLowerCase();
                    const id = (input.id || '').toLowerCase();

                    // First name patterns
                    if (!personalData.firstName && 
                        (classes.includes('firstname') || name.includes('firstname') || 
                         id.includes('firstname'))) {
                        personalData.firstName = value;
                        personalData.foundElements.push({
                            field: 'firstName',
                            value: value,
                            selector: getElementSelector(input),
                            method: 'disabled_input'
                        });
                    }

                    // Last name patterns  
                    if (!personalData.lastName &&
                        (classes.includes('lastname') || name.includes('lastname') || 
                         id.includes('lastname'))) {
                        personalData.lastName = value;
                        personalData.foundElements.push({
                            field: 'lastName', 
                            value: value,
                            selector: getElementSelector(input),
                            method: 'disabled_input'
                        });
                    }

                    // Email patterns
                    if (!personalData.email &&
                        (classes.includes('email') || name.includes('email') || 
                         id.includes('email') || input.type === 'email' || value.includes('@'))) {
                        personalData.email = value;
                        personalData.foundElements.push({
                            field: 'email',
                            value: value, 
                            selector: getElementSelector(input),
                            method: 'disabled_input'
                        });
                    }
                });

                // Priority 2: Look for enabled phone inputs specifically (TelNumber1 class)
                if (!personalData.phone) {
                    const phoneInputs = document.querySelectorAll('input.TelNumber1[value], input[id*="TelNumber1"][value]');
                    phoneInputs.forEach(input => {
                        const value = input.value?.trim();
                        if (value && value.length >= 10) {
                            personalData.phone = value;
                            personalData.foundElements.push({
                                field: 'phone',
                                value: value,
                                selector: getElementSelector(input),
                                method: 'enabled_phone_input'
                            });
                        }
                    });
                }

                // Priority 3: Pattern matching for any remaining fields
                if (!personalData.email || !personalData.phone) {
                    const allInputs = document.querySelectorAll('input[value]');
                    allInputs.forEach(input => {
                        const value = input.value?.trim();
                        if (!value) return;

                        // Email pattern
                        if (!personalData.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                            personalData.email = value;
                            personalData.foundElements.push({
                                field: 'email',
                                value: value,
                                selector: getElementSelector(input),
                                method: 'pattern_match'
                            });
                        }

                        // Phone pattern - only readable formats, no encrypted tokens
                        if (!personalData.phone) {
                            const isReadablePhone = /^\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/.test(value) ||
                                                   (/^\d{10}$/.test(value.replace(/\D/g, '')) && value.length < 15);
                            const isNotEncrypted = value.length < 30 && !/^[A-Za-z0-9_-]{30,}$/.test(value);
                            
                            if (isReadablePhone && isNotEncrypted) {
                                personalData.phone = value;
                                personalData.foundElements.push({
                                    field: 'phone',
                                    value: value,
                                    selector: getElementSelector(input),
                                    method: 'readable_phone_pattern'
                                });
                            }
                        }
                    });
                }

                return personalData;
            });
            
        } catch (error) {
            logger.error(`❌ Data extraction failed: ${error.message}`);
            return {
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                extractionMethod: 'extraction_failed',
                error: error.message
            };
        }
    }
    
    /**
     * Check if personal data has readable (non-encrypted) information
     */
    hasReadablePersonalData(data) {
        if (!data) return false;
        
        // Check for readable first/last name
        const hasReadableName = (data.firstName && data.firstName.length < 50) || 
                               (data.lastName && data.lastName.length < 50);
        
        // Check for readable email
        const hasReadableEmail = data.email && data.email.includes('@') && data.email.length < 100;
        
        // Check for readable phone (not encrypted token)
        const hasReadablePhone = data.phone && /^[\d\s\-\(\)\+\.]{7,20}$/.test(data.phone);
        
        return !!(hasReadableName || hasReadableEmail || hasReadablePhone);
    }
    
    /**
     * Human-like delay between actions
     */
    async humanDelay(minMs = 1000, maxMs = 3000) {
        const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

module.exports = RobustRMVExtractor;