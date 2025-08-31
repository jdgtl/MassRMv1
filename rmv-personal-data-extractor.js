// RMV Personal Data Extractor
// Integrates with existing scraper to extract personal information

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

class RMVPersonalDataExtractor {
    constructor() {
        this.browser = null;
    }

    /**
     * Extract personal data from RMV appointment URL by navigating through the booking flow
     * @param {string} url - The RMV appointment URL with AccessToken
     * @returns {Promise<Object>} Personal data object
     */
    async extractPersonalData(url) {
        logger.info('🔍 Starting RMV personal data extraction...');
        logger.info(`📍 URL: ${url}`);

        try {
            // Initialize browser with same settings as working scraper
            this.browser = await puppeteer.launch({
                headless: true,
                defaultViewport: null,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ]
            });

            const page = await this.browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            const personalData = await this.navigateToPersonalDataPage(page, url);
            
            logger.info('✅ Personal data extraction completed');
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
     * Navigate through RMV flow to reach personal data page
     */
    async navigateToPersonalDataPage(page, url) {
        try {
            // Step 1: Load initial URL
            logger.info('📋 Step 1: Loading RMV appointment page...');
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
            await page.waitForTimeout(3000);

            const pageTitle = await page.title();
            logger.info(`📄 Page title: ${pageTitle}`);

            // Check if we can extract personal data from current page
            let personalData = await this.extractPersonalDataFromPage(page);
            if (this.hasReadablePersonalData(personalData)) {
                logger.info('✅ Found readable personal data on initial page');
                return personalData;
            } else if (this.hasValidData(personalData)) {
                logger.info('⚠️ Found encrypted data on initial page, continuing to navigate for readable data...');
            }

            // Step 2: Handle office selection if present
            logger.info('🏢 Step 2: Checking for office selection...');
            const offices = await page.$$('.QflowObjectItem[data-id]');
            
            if (offices.length > 0) {
                logger.info(`Found ${offices.length} offices, selecting first available...`);
                
                // Click first office
                await page.evaluate(() => {
                    const firstOffice = document.querySelector('.QflowObjectItem[data-id]');
                    if (firstOffice) {
                        firstOffice.click();
                    }
                });

                // Wait for navigation
                await page.waitForTimeout(3000);
                
                try {
                    await Promise.race([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                        page.waitForSelector('.ServiceAppointmentDateTime[data-datetime]', { timeout: 15000 })
                    ]);
                } catch (navError) {
                    logger.warn('⚠️ Navigation wait failed, continuing...');
                }

                // Check for personal data after office selection
                personalData = await this.extractPersonalDataFromPage(page);
                if (this.hasReadablePersonalData(personalData)) {
                    logger.info('✅ Found readable personal data after office selection');
                    return personalData;
                }
            }

            // Step 3: Handle appointment selection if present
            logger.info('⏰ Step 3: Checking for appointment selection...');
            
            // First, try to expand any collapsed time period sections
            logger.info('🌅 Attempting to expand time period sections...');
            const expandableControls = await page.$$('.DateTimeGrouping-Control, .time-group-header, .expand-control, .toggle-control');
            
            if (expandableControls.length > 0) {
                logger.info(`Found ${expandableControls.length} expandable sections`);
                
                for (let i = 0; i < expandableControls.length; i++) {
                    try {
                        const control = expandableControls[i];
                        const text = await control.evaluate(el => el.textContent?.trim() || '');
                        const isVisible = await control.evaluate(el => el.offsetParent !== null);
                        
                        if (isVisible && text.toLowerCase().includes('available')) {
                            logger.info(`🔄 Expanding section: "${text}"`);
                            await control.click();
                            await page.waitForTimeout(3000);
                            
                            // Check if this revealed visible appointments
                            const nowVisible = await page.$$('.ServiceAppointmentDateTime[data-datetime]:not(.disabled)');
                            const visibleCount = await page.evaluate(() => {
                                const appointments = document.querySelectorAll('.ServiceAppointmentDateTime[data-datetime]:not(.disabled)');
                                return Array.from(appointments).filter(el => el.offsetParent !== null).length;
                            });
                            
                            logger.info(`📅 After expanding: ${visibleCount} visible appointments`);
                            
                            if (visibleCount > 0) {
                                logger.info('✅ Found visible appointments after expansion');
                                break;
                            }
                        }
                    } catch (expandError) {
                        logger.warn(`⚠️ Failed to expand section ${i + 1}: ${expandError.message}`);
                        // Continue with other sections
                    }
                }
            } else {
                logger.info('ℹ️ No expandable sections found');
            }
            
            const appointments = await page.$$('.ServiceAppointmentDateTime[data-datetime]:not(.disabled)');
            
            if (appointments.length > 0) {
                logger.info(`Found ${appointments.length} appointments, selecting first available...`);
                
                // Find first clickable appointment
                let appointmentClicked = false;
                for (let i = 0; i < appointments.length && !appointmentClicked; i++) {
                    try {
                        const appointment = appointments[i];
                        const isVisible = await appointment.evaluate(el => el.offsetParent !== null);
                        const isDisabled = await appointment.evaluate(el => el.classList.contains('disabled'));
                        
                        if (isVisible && !isDisabled) {
                            logger.info(`🎯 Clicking appointment ${i + 1}...`);
                            
                            // Scroll into view and click
                            await appointment.evaluate(el => el.scrollIntoView());
                            await page.waitForTimeout(1000);
                            await appointment.click();
                            appointmentClicked = true;
                            logger.info('✅ Appointment selected successfully');
                        } else {
                            logger.info(`⚠️ Appointment ${i + 1} not clickable: visible=${isVisible}, disabled=${isDisabled}`);
                        }
                    } catch (clickError) {
                        logger.warn(`⚠️ Failed to click appointment ${i + 1}: ${clickError.message}`);
                    }
                }
                
                if (!appointmentClicked) {
                    logger.warn('❌ No clickable appointments found');
                    throw new Error('No clickable appointments available');
                }
                
                await page.waitForTimeout(3000);

                // Wait for next page to load
                try {
                    await Promise.race([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                        page.waitForSelector('input[disabled][value]', { timeout: 10000 })
                    ]);
                } catch (navError) {
                    logger.warn('⚠️ Navigation wait failed after appointment selection...');
                }

                // Step 4: Click Next button to proceed to customer information form
                logger.info('➡️ Step 4: Clicking Next button to access customer information...');
                
                // Look for Next button after appointment selection
                const nextButtonSelectors = [
                    'button:has-text("Next")',
                    'button:has-text("Continue")', 
                    'input[type="submit"]',
                    'button[type="submit"]',
                    '.btn-primary',
                    '.next-button',
                    'button.btn'
                ];

                let nextButtonClicked = false;
                logger.info(`🔍 Looking for Next button using ${nextButtonSelectors.length} selectors...`);
                
                for (const selector of nextButtonSelectors) {
                    try {
                        const cleanSelector = selector.replace(':has-text', '').replace('("Next")', '').replace('("Continue")', '');
                        const buttons = await page.$$(cleanSelector);
                        logger.info(`📋 Found ${buttons.length} buttons with selector: ${cleanSelector}`);
                        
                        for (let i = 0; i < buttons.length; i++) {
                            try {
                                const button = buttons[i];
                                const text = await button.evaluate(el => el.textContent?.trim().toLowerCase() || '');
                                const isVisible = await button.evaluate(el => el.offsetParent !== null);
                                const isEnabled = await button.evaluate(el => !el.disabled);
                                
                                logger.info(`  Button ${i + 1}: text="${text}", visible=${isVisible}, enabled=${isEnabled}`);
                                
                                if (isVisible && isEnabled && (text.includes('next') || text.includes('continue') || text.includes('proceed') || selector.includes('submit'))) {
                                    logger.info(`🎯 Attempting to click Next button: "${text}"`);
                                    
                                    // Scroll button into view
                                    await button.evaluate(el => el.scrollIntoView());
                                    await page.waitForTimeout(1000);
                                    
                                    await button.click();
                                    logger.info('✅ Next button clicked successfully');
                                    await page.waitForTimeout(4000);
                                    
                                    // Wait for navigation to customer info page
                                    try {
                                        logger.info('⏳ Waiting for navigation after Next button...');
                                        await Promise.race([
                                            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                                            page.waitForSelector('input[disabled][value]', { timeout: 10000 })
                                        ]);
                                        logger.info('✅ Navigation completed');
                                    } catch (navError) {
                                        logger.warn(`⚠️ Navigation wait failed: ${navError.message}`);
                                    }
                                    
                                    nextButtonClicked = true;
                                    break;
                                }
                            } catch (btnError) {
                                logger.warn(`⚠️ Error checking button ${i + 1}: ${btnError.message}`);
                            }
                        }
                        if (nextButtonClicked) break;
                    } catch (selectorError) {
                        logger.warn(`⚠️ Error with selector ${selector}: ${selectorError.message}`);
                    }
                }

                if (nextButtonClicked) {
                    logger.info('✅ Successfully navigated to customer information page');
                    
                    // Wait a bit more for form to fully load
                    await page.waitForTimeout(2000);
                    
                    // Now extract personal data from customer info form
                    personalData = await this.extractPersonalDataFromPage(page);
                    if (this.hasReadablePersonalData(personalData)) {
                        logger.info('✅ Found readable personal data on customer information form');
                        return personalData;
                    } else if (this.hasValidData(personalData)) {
                        logger.info('⚠️ Found encrypted data on customer form, but proceeding to get readable data...');
                    }
                } else {
                    logger.warn('⚠️ Could not find or click Next button after appointment selection');
                }

                // Check for personal data after appointment selection (fallback)
                personalData = await this.extractPersonalDataFromPage(page);
                if (this.hasReadablePersonalData(personalData)) {
                    logger.info('✅ Found readable personal data after appointment selection');
                    return personalData;
                }
            }

            // Step 5: Try to advance through form steps (fallback)
            logger.info('➡️ Step 5: Attempting to advance through remaining form steps...');
            
            const maxSteps = 3;
            for (let step = 0; step < maxSteps; step++) {
                // Try various "next" button selectors
                const nextButtonSelectors = [
                    'button:has-text("Next")',
                    'button:has-text("Continue")', 
                    'input[type="submit"]',
                    'button[type="submit"]',
                    '.btn-primary',
                    '.next-button',
                    'button.btn'
                ];

                let clicked = false;
                for (const selector of nextButtonSelectors) {
                    try {
                        const buttons = await page.$$(selector.replace(':has-text', '').replace('("Next")', '').replace('("Continue")', ''));
                        
                        for (const button of buttons) {
                            try {
                                const text = await button.evaluate(el => el.textContent?.trim().toLowerCase() || '');
                                if (text.includes('next') || text.includes('continue') || text.includes('proceed')) {
                                    logger.info(`🔘 Clicking: "${text}"`);
                                    await button.click();
                                    await page.waitForTimeout(3000);
                                    clicked = true;
                                    break;
                                }
                            } catch (btnError) {
                                // Continue to next button
                            }
                        }
                        if (clicked) break;
                    } catch (selectorError) {
                        // Continue to next selector
                    }
                }

                if (clicked) {
                    // Check for personal data after clicking next
                    personalData = await this.extractPersonalDataFromPage(page);
                    if (this.hasReadablePersonalData(personalData)) {
                        logger.info(`✅ Found readable personal data on form step ${step + 1}`);
                        return personalData;
                    }
                } else {
                    logger.info(`🛑 Could not find next button on step ${step + 1}`);
                    break;
                }
            }

            // Return whatever data we could find
            logger.info('📝 Returning collected data...');
            return personalData || this.createEmptyPersonalDataObject(page);

        } catch (error) {
            logger.error('❌ Error during navigation:', error.message);
            logger.error('Full error details:', error);
            
            // Try to extract data from current page as fallback
            try {
                const fallbackData = await this.extractPersonalDataFromPage(page);
                fallbackData.extractionError = error.message;
                return fallbackData;
            } catch (fallbackError) {
                throw new Error(`Navigation failed and fallback extraction failed: ${error.message}`);
            }
        }
    }

    /**
     * Extract personal data from current page
     */
    async extractPersonalDataFromPage(page) {
        return await page.evaluate(() => {
            const personalData = {
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                extractionMethod: 'form_field_scan',
                extractionTimestamp: new Date().toISOString(),
                sourceUrl: window.location.href,
                pageTitle: document.title,
                foundElements: [],
                debugInfo: {
                    totalInputs: 0,
                    disabledInputs: 0,
                    inputsWithValues: 0
                }
            };

            // Get all input elements for analysis
            const allInputs = document.querySelectorAll('input');
            personalData.debugInfo.totalInputs = allInputs.length;

            // Priority 1: Look for disabled inputs (pre-filled personal data)
            const disabledInputs = document.querySelectorAll('input[disabled]');
            personalData.debugInfo.disabledInputs = disabledInputs.length;

            disabledInputs.forEach(input => {
                const value = input.value?.trim();
                if (!value) return;

                const classes = (input.className || '').toLowerCase();
                const name = (input.name || '').toLowerCase();
                const id = (input.id || '').toLowerCase();
                const placeholder = (input.placeholder || '').toLowerCase();

                // First name patterns
                if (!personalData.firstName && 
                    (classes.includes('firstname') || name.includes('firstname') || 
                     id.includes('firstname') || placeholder.includes('first'))) {
                    personalData.firstName = value;
                    personalData.foundElements.push({
                        field: 'firstName',
                        value: value,
                        selector: getElementSelector(input),
                        method: 'disabled_input_class'
                    });
                }

                // Last name patterns  
                if (!personalData.lastName &&
                    (classes.includes('lastname') || name.includes('lastname') || 
                     id.includes('lastname') || placeholder.includes('last'))) {
                    personalData.lastName = value;
                    personalData.foundElements.push({
                        field: 'lastName', 
                        value: value,
                        selector: getElementSelector(input),
                        method: 'disabled_input_class'
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
                        method: 'disabled_input_email'
                    });
                }

                // Phone patterns
                if (!personalData.phone &&
                    (classes.includes('phone') || classes.includes('tel') || name.includes('phone') ||
                     name.includes('tel') || input.type === 'tel' || /^\d{10,}$/.test(value.replace(/\D/g, '')))) {
                    personalData.phone = value;
                    personalData.foundElements.push({
                        field: 'phone',
                        value: value,
                        selector: getElementSelector(input),
                        method: 'disabled_input_phone'
                    });
                }
            });

            // Helper function to get element selector
            function getElementSelector(element) {
                if (element.id) return `#${element.id}`;
                if (element.className) return `.${element.className.replace(/\s+/g, '.')}`;
                return element.tagName.toLowerCase();
            }

            // Priority 2: Look for enabled phone inputs specifically (TelNumber1 class)
            if (!personalData.phone) {
                const phoneInputs = document.querySelectorAll('input.TelNumber1[value], input[id*="TelNumber1"][value], input[name*="TelNumber1"][value]');
                phoneInputs.forEach(input => {
                    const value = input.value?.trim();
                    if (value && /^\d{10}$/.test(value.replace(/\D/g, ''))) {
                        personalData.phone = value;
                        personalData.foundElements.push({
                            field: 'phone',
                            value: value,
                            selector: getElementSelector(input),
                            method: 'enabled_telnumber1_input'
                        });
                    }
                });
            }

            // Priority 3: Look for any inputs with values (if disabled inputs didn't work)
            const inputsWithValues = document.querySelectorAll('input[value]');
            personalData.debugInfo.inputsWithValues = inputsWithValues.length;

            inputsWithValues.forEach(input => {
                const value = input.value?.trim();
                if (!value) return;

                // Email detection by pattern
                if (!personalData.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    personalData.email = value;
                    personalData.foundElements.push({
                        field: 'email',
                        value: value,
                        selector: 'input[value*="@"]',
                        method: 'pattern_matching_email'
                    });
                }

                // Phone detection by pattern
                if (!personalData.phone && /^\d{10,}$/.test(value.replace(/\D/g, ''))) {
                    personalData.phone = value;
                    personalData.foundElements.push({
                        field: 'phone', 
                        value: value,
                        selector: 'input[value]',
                        method: 'pattern_matching_phone'
                    });
                }
            });

            return personalData;
        });
    }

    /**
     * Create empty personal data object for current page
     */
    async createEmptyPersonalDataObject(page) {
        const url = page.url();
        const title = await page.title();
        
        return {
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            extractionMethod: 'no_data_found',
            extractionTimestamp: new Date().toISOString(),
            sourceUrl: url,
            pageTitle: title,
            foundElements: [],
            debugInfo: {
                message: 'No personal data found on any visited page'
            }
        };
    }

    /**
     * Check if personal data object has valid data
     */
    hasValidData(data) {
        if (!data) return false;
        return !!(data.firstName || data.lastName || data.email || data.phone);
    }

    /**
     * Check if personal data has readable (non-encrypted) information
     */
    hasReadablePersonalData(data) {
        if (!data) return false;
        
        // Check for readable first name (not encrypted token)
        const hasReadableFirstName = data.firstName && data.firstName.length < 50 && !/^[A-Za-z0-9_-]{50,}$/.test(data.firstName);
        
        // Check for readable last name (not encrypted token)
        const hasReadableLastName = data.lastName && data.lastName.length < 50 && !/^[A-Za-z0-9_-]{50,}$/.test(data.lastName);
        
        // Check for readable email (contains @ and reasonable length)
        const hasReadableEmail = data.email && data.email.includes('@') && data.email.length < 100 && !/^[A-Za-z0-9_-]{50,}$/.test(data.email);
        
        // Check for readable phone (digits/formatting, not long encrypted token)
        const hasReadablePhone = data.phone && /^[\d\s\-\(\)\+\.]{7,20}$/.test(data.phone) && !/^[A-Za-z0-9_-]{50,}$/.test(data.phone);
        
        return !!(hasReadableFirstName || hasReadableLastName || hasReadableEmail || hasReadablePhone);
    }
}

// Test function
async function testPersonalDataExtraction() {
    console.log('🧪 Testing RMV Personal Data Extractor...');
    console.log('='.repeat(60));
    
    const extractor = new RMVPersonalDataExtractor();
    
    // Test URL
    const testUrl = 'https://rmvmassdotappt.cxmflow.com/Appointment/Index/2c052fc7-571f-4b76-9790-7e91f103c408?AccessToken=f7fb561d-7dc4-411b-b082-f29b705d26c5';
    
    const startTime = Date.now();
    
    try {
        const personalData = await extractor.extractPersonalData(testUrl);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('\n🎉 EXTRACTION COMPLETED!');
        console.log('='.repeat(60));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`📄 Final Page: ${personalData.pageTitle}`);
        console.log(`🔗 Final URL: ${personalData.sourceUrl}`);
        
        // Display extracted data
        console.log('\n📊 Personal Data Found:');
        const displayData = {
            'First Name': personalData.firstName || '❌ Not found',
            'Last Name': personalData.lastName || '❌ Not found',
            'Email': personalData.email || '❌ Not found', 
            'Phone': personalData.phone || '❌ Not found'
        };
        console.table(displayData);

        // Display extraction details
        if (personalData.foundElements && personalData.foundElements.length > 0) {
            console.log('\n🔍 Extraction Details:');
            personalData.foundElements.forEach((element, index) => {
                console.log(`  ${index + 1}. ${element.field}: "${element.value}"`);
                console.log(`     📍 Found via: ${element.method}`);
                console.log(`     🎯 Selector: ${element.selector}`);
            });
        }

        // Display debug info
        if (personalData.debugInfo) {
            console.log('\n🔧 Debug Info:');
            Object.entries(personalData.debugInfo).forEach(([key, value]) => {
                console.log(`  📋 ${key}: ${value}`);
            });
        }

        // Test result
        const hasValidData = extractor.hasValidData(personalData);
        console.log('\n' + '='.repeat(60));
        
        if (hasValidData) {
            console.log('✅ SUCCESS: Personal data extracted successfully!');
            console.log('🎯 This extractor can automatically populate user information.');
        } else {
            console.log('⚠️  PARTIAL: No personal data found, but extraction completed.');
            console.log('🔍 The system successfully navigated the flow but found no pre-filled data.');
        }
        
        return personalData;
        
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('\n❌ EXTRACTION FAILED!');
        console.log('='.repeat(60));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`💥 Error: ${error.message}`);
        
        throw error;
    }
}

// Export class
module.exports = RMVPersonalDataExtractor;

// Run test if executed directly
if (require.main === module) {
    testPersonalDataExtraction().catch(console.error);
}