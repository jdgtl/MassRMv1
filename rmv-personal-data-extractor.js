// Minimal RMV Personal Data Extractor
// Bypasses all network tests and uses simplest approach

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

class MinimalRMVExtractor {
    constructor() {
        this.browser = null;
    }

    /**
     * Extract personal data with minimal configuration
     */
    async extractPersonalData(url) {
        logger.info('🔍 Starting minimal RMV personal data extraction...');
        logger.info(`📍 URL: ${url}`);

        try {
            // Use most basic browser configuration possible
            logger.info('🚀 Launching browser with minimal config...');
            try {
                // Check environment variables for Puppeteer configuration
                const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
                
                const launchOptions = {
                    headless: 'new', // Use new headless mode
                };
                
                // Only set executablePath if explicitly provided and not empty
                if (executablePath && executablePath.trim() !== '') {
                    launchOptions.executablePath = executablePath;
                    logger.info(`Using custom executable path: ${executablePath}`);
                } else {
                    logger.info('Using Puppeteer bundled Chromium (default)');
                }
                
                launchOptions.args = [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-web-security',
                        '--disable-gpu',
                        '--no-first-run'
                        // Removed --no-zygote and --single-process as they may cause frame detachment
                    ],
                launchOptions.timeout = 30000;
                
                this.browser = await puppeteer.launch(launchOptions);
                logger.info('✅ Browser launched successfully');
            } catch (launchError) {
                logger.error('❌ Browser launch failed:', {
                    message: launchError.message,
                    name: launchError.name,
                    code: launchError.code
                });
                throw launchError;
            }

            const page = await this.browser.newPage();
            logger.info('✅ New page created');
            
            // Small delay to ensure browser is fully initialized
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Skip all fancy headers and user agents - keep it simple
            logger.info('📋 Loading RMV page directly...');
            
            // Direct navigation with generous timeout
            try {
                await page.goto(url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 60000 
                });
                logger.info('✅ Page navigation completed');
            } catch (navigationError) {
                logger.error('❌ Page navigation failed:', {
                    message: navigationError.message,
                    name: navigationError.name,
                    code: navigationError.code
                });
                throw navigationError;
            }
            
            // Quick wait for page to settle
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const pageTitle = await page.title();
            logger.info(`📄 Page loaded: ${pageTitle}`);
            
            // Always navigate through the full flow to reach customer information page
            logger.info('🔄 Navigating through appointment flow to customer information...');
            const personalData = await this.navigateToCustomerInfo(page);
            
            logger.info('✅ Extraction completed');
            return personalData;
            
        } catch (error) {
            logger.error('❌ Minimal extraction failed:', {
                message: error.message,
                name: error.name,
                code: error.code,
                stack: error.stack?.substring(0, 200)
            });
            throw error;
        } finally {
            if (this.browser) {
                await this.browser.close();
                logger.info('🔒 Browser closed');
            }
        }
    }

    /**
     * Extract data directly without any navigation
     */
    async extractDataDirect(page) {
        try {
            return await page.evaluate(() => {
                const personalData = {
                    firstName: '',
                    lastName: '',
                    email: '',
                    phone: '',
                    extractionMethod: 'minimal_direct',
                    extractionTimestamp: new Date().toISOString(),
                    sourceUrl: window.location.href,
                    pageTitle: document.title,
                    foundElements: [],
                    debugInfo: {
                        totalInputs: 0,
                        inputsWithValues: 0,
                        pageText: document.body?.innerText?.substring(0, 200) || 'No text found'
                    }
                };

                // Get all inputs on page
                const allInputs = document.querySelectorAll('input');
                personalData.debugInfo.totalInputs = allInputs.length;
                
                // Look at every single input field
                allInputs.forEach(input => {
                    const value = input.value?.trim();
                    if (!value) return;
                    
                    personalData.debugInfo.inputsWithValues++;
                    
                    // Log all inputs for debugging
                    const inputInfo = {
                        value: value.substring(0, 50), // First 50 chars
                        type: input.type,
                        name: input.name || '',
                        id: input.id || '',
                        className: input.className || ''
                    };
                    
                    // Simple field detection
                    const fieldText = (inputInfo.name + ' ' + inputInfo.id + ' ' + inputInfo.className).toLowerCase();
                    
                    // First name
                    if (!personalData.firstName && fieldText.includes('first')) {
                        personalData.firstName = value;
                        personalData.foundElements.push({field: 'firstName', value, method: 'simple_match'});
                    }
                    
                    // Last name  
                    if (!personalData.lastName && fieldText.includes('last')) {
                        personalData.lastName = value;
                        personalData.foundElements.push({field: 'lastName', value, method: 'simple_match'});
                    }
                    
                    // Email
                    if (!personalData.email && value.includes('@')) {
                        personalData.email = value;
                        personalData.foundElements.push({field: 'email', value, method: 'simple_match'});
                    }
                    
                    // Phone - prioritize TelNumber1 class and readable phone formats only
                    if (!personalData.phone) {
                        const isPhoneField = fieldText.includes('telnumber1') || 
                                           fieldText.includes('phone') || 
                                           fieldText.includes('tel');
                        const isReadablePhone = /^\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/.test(value) ||
                                               (/^\d{10}$/.test(value.replace(/\D/g, '')) && value.length < 15);
                        const isNotEncrypted = value.length < 30 && !/^[A-Za-z0-9_-]{30,}$/.test(value);
                        
                        if ((isPhoneField || isReadablePhone) && isNotEncrypted) {
                            personalData.phone = value;
                            personalData.foundElements.push({field: 'phone', value, method: 'readable_phone_match'});
                        }
                    }
                });

                return personalData;
            });
            
        } catch (error) {
            logger.error(`❌ Data extraction error: ${error.message}`);
            return {
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                extractionMethod: 'failed',
                error: error.message
            };
        }
    }

    /**
     * Navigate through full appointment flow to customer info page
     */
    async navigateToCustomerInfo(page) {
        try {
            // Step 1: Select office
            logger.info('🏢 Selecting office...');
            const offices = await page.$$('.QflowObjectItem[data-id]');
            
            if (offices.length > 0) {
                await offices[0].evaluate(el => el.click());
                await new Promise(resolve => setTimeout(resolve, 2000));
                logger.info(`✅ Office selected`);
            }

            // Step 2: Select appointment
            logger.info('⏰ Selecting appointment...');
            
            // Look for appointments in DateTimeGrouping-Container (all appointments are in DOM)
            const appointmentContainers = await page.$$('.DateTimeGrouping-Container');
            logger.info(`🔍 Found ${appointmentContainers.length} appointment containers`);
            
            // Count all appointments across all containers
            const allAppointments = await page.$$('.ServiceAppointmentDateTime');
            logger.info(`📅 Found ${allAppointments.length} total appointment slots`);
            
            // Now select first available appointment
            let appointmentSelected = false;
            
            if (allAppointments.length > 0) {
                // Try multiple appointments until one works
                for (let i = 0; i < Math.min(allAppointments.length, 5); i++) {
                    try {
                        const appointment = allAppointments[i];
                        const ariaLabel = await appointment.evaluate(el => el.getAttribute('aria-label'));
                        const isVisible = await appointment.evaluate(el => el.offsetParent !== null);
                        logger.info(`📋 Appointment ${i + 1}: "${ariaLabel}" visible=${isVisible}`);
                        
                        if (isVisible) {
                            logger.info(`🎯 Clicking appointment ${i + 1}: "${ariaLabel}"...`);
                            await appointment.evaluate(el => el.click());
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            appointmentSelected = true;
                            logger.info('✅ Appointment selected successfully');
                            break;
                        }
                    } catch (e) {
                        logger.warn(`⚠️ Failed to select appointment ${i + 1}: ${e.message}`);
                    }
                }
            }

            // Check for pagination if no appointments were found or selected
            if (!appointmentSelected && allAppointments.length === 0) {
                logger.info('🔍 No appointments found, checking for pagination...');
                const nextPageButton = await page.$('.paginate-action-container.next a');
                
                if (nextPageButton) {
                    logger.info('📄 Found next page button, clicking to load more appointments...');
                    await nextPageButton.evaluate(el => el.click());
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Try to select appointments from new page
                    const paginatedAppointments = await page.$$('.ServiceAppointmentDateTime');
                    logger.info(`📅 Found ${paginatedAppointments.length} appointments after pagination`);
                    
                    for (let i = 0; i < Math.min(paginatedAppointments.length, 5); i++) {
                        try {
                            const appointment = paginatedAppointments[i];
                            const ariaLabel = await appointment.evaluate(el => el.getAttribute('aria-label'));
                            const isVisible = await appointment.evaluate(el => el.offsetParent !== null);
                            
                            if (isVisible) {
                                logger.info(`🎯 Clicking paginated appointment ${i + 1}: "${ariaLabel}"...`);
                                await appointment.evaluate(el => el.click());
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                appointmentSelected = true;
                                logger.info('✅ Appointment selected successfully from paginated results');
                                break;
                            }
                        } catch (e) {
                            logger.warn(`⚠️ Failed to select paginated appointment ${i + 1}: ${e.message}`);
                        }
                    }
                } else {
                    logger.warn('⚠️ No appointments found and no pagination available');
                }
            }
            
            // Verify appointment was actually selected
            if (!appointmentSelected) {
                logger.warn('⚠️ Failed to select any appointment - attempting to extract data from current page');
                // Try to extract data from current page even without appointment selection
                const currentPageData = await this.extractDataDirect(page);
                if (currentPageData && (currentPageData.firstName || currentPageData.lastName || currentPageData.email || currentPageData.phone)) {
                    logger.info('✅ Found personal data on current page without appointment selection');
                    return currentPageData;
                } else {
                    logger.error('❌ No personal data found on current page and no appointments available');
                    throw new Error('No appointment selected - cannot proceed');
                }
            } else {
                logger.info('✅ Appointment selection confirmed - proceeding to Next button');
            }

            // Step 3: Click Next button
            logger.info('➡️ Looking for Next button...');
            
            // First try to find the specific .next-button selector
            const nextButton = await page.$('.next-button');
            if (nextButton) {
                const isVisible = await nextButton.evaluate(el => el.offsetParent !== null && !el.disabled);
                if (isVisible) {
                    logger.info('🔘 Clicking .next-button');
                    await nextButton.evaluate(el => el.click());
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } else {
                    logger.warn('⚠️ .next-button found but not visible/disabled');
                }
            } else {
                // Fallback to generic button search
                logger.info('🔍 .next-button not found, searching for generic Next buttons...');
                const buttons = await page.$$('button');
                
                for (const button of buttons) {
                    try {
                        const text = await button.evaluate(el => el.textContent?.trim().toLowerCase());
                        const isVisible = await button.evaluate(el => el.offsetParent !== null && !el.disabled);
                        
                        if (isVisible && text && text.includes('next')) {
                            logger.info(`🔘 Clicking Next: "${text}"`);
                            await button.evaluate(el => el.click());
                            await new Promise(resolve => setTimeout(resolve, 3000));
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }

            // Extract data from final page
            const finalData = await this.extractDataDirect(page);
            logger.info(`📄 Final page: ${await page.title()}`);
            
            return finalData;
            
        } catch (error) {
            logger.error(`❌ Navigation failed: ${error.message}`);
            throw error; // Don't return encrypted data - fail properly
        }
    }

    /**
     * Dynamic wait that responds to DOM changes (faster than fixed timeouts)
     */
    async waitForDOMChange(page, timeout = 5000) {
        try {
            await page.waitForFunction(
                () => document.readyState === 'complete',
                { timeout: timeout }
            );
            await new Promise(resolve => setTimeout(resolve, 800)); // Minimum safe delay
        } catch (timeoutError) {
            // Fallback to short fixed wait if DOM never settles
            await new Promise(resolve => setTimeout(resolve, 1200));
        }
    }

}

module.exports = MinimalRMVExtractor;