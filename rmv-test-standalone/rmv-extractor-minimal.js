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
            this.browser = await puppeteer.launch({
                headless: true,  // Use old headless mode for maximum compatibility
                args: [
                    '--no-sandbox'  // Minimal args - only what's absolutely necessary
                ],
                timeout: 30000
            });

            const page = await this.browser.newPage();
            
            // Skip all fancy headers and user agents - keep it simple
            logger.info('📋 Loading RMV page directly...');
            
            // Direct navigation with generous timeout
            await page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: 60000 
            });
            
            // Wait for page to settle
            await page.waitForTimeout(5000);
            
            const pageTitle = await page.title();
            logger.info(`📄 Page loaded: ${pageTitle}`);
            
            // Always navigate through the full flow to reach customer information page
            logger.info('🔄 Navigating through appointment flow to customer information...');
            const personalData = await this.navigateToCustomerInfo(page);
            
            logger.info('✅ Extraction completed');
            return personalData;
            
        } catch (error) {
            logger.error('❌ Minimal extraction failed:', error.message);
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
                await page.waitForTimeout(4000);
                logger.info(`✅ Office selected`);
            }

            // Step 2: Select appointment
            logger.info('⏰ Selecting appointment...');
            
            // Expand ALL available time sections 
            const timeControls = await page.$$('.DateTimeGrouping-Control');
            logger.info(`🔍 Found ${timeControls.length} time period controls`);
            
            for (let i = 0; i < timeControls.length; i++) {
                try {
                    const control = timeControls[i];
                    const text = await control.evaluate(el => el.textContent);
                    
                    if (text && text.toLowerCase().includes('available')) {
                        logger.info(`🌅 Expanding time section ${i + 1}: "${text}"`);
                        await control.evaluate(el => el.click());
                        await page.waitForTimeout(3000);
                        
                        // Check if any appointments became visible after this expansion
                        const visibleCheck = await page.$$eval('.ServiceAppointmentDateTime[data-datetime]:not(.disabled)', 
                            elements => elements.filter(el => el.offsetParent !== null).length);
                        logger.info(`📊 Visible appointments after expansion: ${visibleCheck}`);
                        
                        if (visibleCheck > 0) {
                            logger.info('✅ Found visible appointments after expanding this section');
                            break;
                        }
                    }
                } catch (e) {
                    logger.warn(`⚠️ Failed to expand time section ${i + 1}: ${e.message}`);
                }
            }

            // Now select first available appointment
            let appointmentSelected = false;
            const appointments = await page.$$('.ServiceAppointmentDateTime[data-datetime]:not(.disabled)');
            logger.info(`📅 Found ${appointments.length} appointment slots`);
            
            if (appointments.length > 0) {
                // Try multiple appointments until one works
                for (let i = 0; i < Math.min(appointments.length, 5); i++) {
                    try {
                        const appointment = appointments[i];
                        const isVisible = await appointment.evaluate(el => el.offsetParent !== null);
                        logger.info(`📋 Appointment ${i + 1}: visible=${isVisible}`);
                        
                        if (isVisible) {
                            logger.info(`🎯 Clicking appointment ${i + 1}...`);
                            await appointment.evaluate(el => el.click());
                            await page.waitForTimeout(4000);
                            appointmentSelected = true;
                            logger.info('✅ Appointment selected successfully');
                            break;
                        }
                    } catch (e) {
                        logger.warn(`⚠️ Failed to select appointment ${i + 1}: ${e.message}`);
                    }
                }
            }

            if (!appointmentSelected) {
                logger.warn('⚠️ No appointment was selected - may need to expand more sections');
                
                // Try expanding any other expandable sections
                const allExpandable = await page.$$('.DateTimeGrouping-Control, [class*="expand"], [class*="toggle"]');
                for (const control of allExpandable.slice(0, 3)) {
                    try {
                        const text = await control.evaluate(el => el.textContent);
                        if (text && text.toLowerCase().includes('available')) {
                            logger.info(`🔄 Trying to expand: "${text.substring(0, 30)}..."`);
                            await control.evaluate(el => el.click());
                            await page.waitForTimeout(2000);
                        }
                    } catch (e) {
                        // Continue
                    }
                }
                
                // Try appointment selection again after expanding sections
                logger.info('🔄 Retrying appointment selection after expanding sections...');
                const newAppointments = await page.$$('.ServiceAppointmentDateTime[data-datetime]:not(.disabled)');
                logger.info(`📅 Found ${newAppointments.length} appointments after expanding`);
                
                for (let i = 0; i < Math.min(newAppointments.length, 10); i++) {
                    try {
                        const appointment = newAppointments[i];
                        const isVisible = await appointment.evaluate(el => el.offsetParent !== null);
                        logger.info(`📋 Retry appointment ${i + 1}: visible=${isVisible}`);
                        
                        if (isVisible) {
                            logger.info(`🎯 Clicking appointment ${i + 1} after expansion...`);
                            await appointment.evaluate(el => el.click());
                            await page.waitForTimeout(4000);
                            appointmentSelected = true;
                            logger.info('✅ Appointment selected successfully after expanding sections');
                            break;
                        }
                    } catch (e) {
                        logger.warn(`⚠️ Failed to select appointment ${i + 1} after expansion: ${e.message}`);
                    }
                }
            }
            
            // Verify appointment was actually selected
            if (!appointmentSelected) {
                logger.error('❌ Failed to select any appointment - cannot proceed to Next step');
                throw new Error('No appointment selected - cannot proceed');
            } else {
                logger.info('✅ Appointment selection confirmed - proceeding to Next button');
            }

            // Step 3: Click Next button
            logger.info('➡️ Looking for Next button...');
            const buttons = await page.$$('button');
            
            for (const button of buttons) {
                try {
                    const text = await button.evaluate(el => el.textContent?.trim().toLowerCase());
                    const isVisible = await button.evaluate(el => el.offsetParent !== null && !el.disabled);
                    
                    if (isVisible && text && text.includes('next')) {
                        logger.info(`🔘 Clicking Next: "${text}"`);
                        await button.evaluate(el => el.click());
                        await page.waitForTimeout(4000);
                        break;
                    }
                } catch (e) {
                    continue;
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

}

module.exports = MinimalRMVExtractor;