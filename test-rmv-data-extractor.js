// RMV Personal Data Extractor Test Script
// Extracts name, email, and phone from RMV appointment URLs

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

class RMVDataExtractor {
    constructor() {
        this.appointmentUrl = null;
        this.personalData = {};
        this.browser = null;
    }

    /**
     * Extract personal data from RMV appointment URL
     * @param {string} url - The RMV appointment URL with AccessToken
     * @returns {Promise<Object>} Personal data object
     */
    async extractPersonalData(url) {
        this.appointmentUrl = url;
        
        logger.info('🔍 Starting RMV personal data extraction...');
        logger.info(`📍 URL: ${url}`);

        try {
            // Initialize browser
            this.browser = await puppeteer.launch({
                headless: true, // Use headless for testing
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

            // Step 1: Navigate to appointment URL and progress to Customer Info page
            const personalData = await this.navigateAndExtract(url);
            
            logger.info('✅ Personal data extracted successfully:');
            console.table(personalData);
            
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
     * Navigate through appointment flow and extract data
     * @param {string} url - The appointment URL
     * @returns {Promise<Object>} Extracted personal data
     */
    async navigateAndExtract(url) {
        const page = await this.browser.newPage();
        
        // Set user agent to avoid detection
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        try {
            logger.info('📋 Step 1: Loading appointment page...');
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
            
            // Wait for page to fully load
            await page.waitForTimeout(3000);
            
            // Check if we're on the correct page
            const pageTitle = await page.title();
            logger.info(`📄 Page title: ${pageTitle}`);
            
            // Step 2: Handle office selection first (based on working 3-step approach)
            logger.info('🏢 Step 2: Handling office selection...');
            
            // Look for office selection buttons (QflowObjectItem)
            await page.waitForSelector('.QflowObjectItem[data-id]', { timeout: 15000 });
            
            const offices = await page.evaluate(() => {
                const officeElements = document.querySelectorAll('.QflowObjectItem[data-id]');
                return Array.from(officeElements).map(element => ({
                    id: element.getAttribute('data-id'),
                    name: element.textContent.trim().split('\n')[0],
                    selector: `[data-id="${element.getAttribute('data-id')}"]`
                }));
            });
            
            logger.info(`Found ${offices.length} offices: ${offices.map(o => o.name).slice(0, 3).join(', ')}...`);
            
            if (offices.length === 0) {
                throw new Error('No offices found on page');
            }
            
            // Select the first office (we just need any office to get to personal data)
            const firstOffice = offices[0];
            logger.info(`🎯 Selecting office: ${firstOffice.name}`);
            
            await page.evaluate((selector) => {
                const element = document.querySelector(selector);
                if (element) {
                    element.click();
                }
            }, firstOffice.selector);
            
            // Wait for navigation to appointment selection page
            await page.waitForTimeout(3000);
            
            try {
                await Promise.race([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                    page.waitForSelector('.ServiceAppointmentDateTime[data-datetime]', { timeout: 15000 }),
                    new Promise(resolve => setTimeout(resolve, 10000))
                ]);
            } catch (navError) {
                logger.warn('⚠️ Navigation wait failed, continuing anyway...');
            }
            
            logger.info('⏰ Step 3: Looking for time slots...');
            
            // Now look for time slot containers
            await page.waitForSelector('.ServiceAppointmentDateTime[data-datetime]', { timeout: 15000 });
            
            // Try to expand afternoon section if it exists
            try {
                const afternoonControl = await page.$('.DateTimeGrouping-Control.Afternoon, .DateTimeGrouping-Control[data-period="Afternoon"]');
                if (afternoonControl) {
                    logger.info('🌅 Expanding afternoon time slots...');
                    await afternoonControl.click();
                    await page.waitForTimeout(2000);
                }
            } catch (error) {
                logger.warn('⚠️ Could not expand afternoon slots, continuing...');
            }
            
            // Select first available time slot
            logger.info('🎯 Step 4: Selecting first available time slot...');
            const timeSlot = await page.waitForSelector('.ServiceAppointmentDateTime[data-datetime]:not(.disabled)', { timeout: 10000 });
            
            if (timeSlot) {
                await timeSlot.click();
                logger.info('✅ Time slot selected');
                await page.waitForTimeout(2000);
            } else {
                throw new Error('No available time slots found');
            }
            
            // Look for and click the Next button
            logger.info('➡️ Step 5: Proceeding to Customer Information...');
            
            // Try different selectors for the Next button
            const nextButtonSelectors = [
                'button.next-button',
                'button[type="submit"]',
                'input[type="submit"][value*="Next"]',
                'button:contains("Next")',
                '.btn-primary',
                '.next'
            ];
            
            let nextButton = null;
            for (const selector of nextButtonSelectors) {
                try {
                    nextButton = await page.$(selector);
                    if (nextButton) {
                        logger.info(`🔘 Found next button with selector: ${selector}`);
                        break;
                    }
                } catch (error) {
                    // Continue to next selector
                }
            }
            
            if (nextButton) {
                await nextButton.click();
                await page.waitForTimeout(3000);
                
                // Wait for navigation or new content
                try {
                    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
                } catch (navError) {
                    logger.info('No navigation detected, checking for form updates...');
                }
                
                logger.info('✅ Proceeded to next step');
            } else {
                logger.warn('⚠️ Could not find Next button, trying to extract data from current page');
            }
            
            // Step 6: Extract personal data from form fields
            logger.info('📝 Step 6: Extracting personal data...');
            
            // Wait a bit for any dynamic content to load
            await page.waitForTimeout(2000);
            
            // Extract personal data from various possible selectors
            const personalData = await page.evaluate(() => {
                const data = {
                    firstName: '',
                    lastName: '',
                    email: '',
                    phone: '',
                    extractionMethod: 'puppeteer_form_extraction',
                    extractionTimestamp: new Date().toISOString(),
                    sourceUrl: window.location.href,
                    debugInfo: {
                        foundElements: [],
                        allInputs: []
                    }
                };
                
                // Try different selectors for each field
                const fieldSelectors = {
                    firstName: [
                        'input.FirstName[disabled]',
                        'input[name*="FirstName"][disabled]',
                        'input[name*="firstname"][disabled]',
                        'input[placeholder*="First"][disabled]',
                        '#FirstName[disabled]',
                        'input[value][disabled][class*="first"]'
                    ],
                    lastName: [
                        'input.LastName[disabled]',
                        'input[name*="LastName"][disabled]',
                        'input[name*="lastname"][disabled]',
                        'input[placeholder*="Last"][disabled]',
                        '#LastName[disabled]',
                        'input[value][disabled][class*="last"]'
                    ],
                    email: [
                        'input.EMail[disabled]',
                        'input.Email[disabled]',
                        'input[name*="Email"][disabled]',
                        'input[name*="email"][disabled]',
                        'input[type="email"][disabled]',
                        'input[placeholder*="email"][disabled]',
                        '#Email[disabled]',
                        'input[value*="@"][disabled]'
                    ],
                    phone: [
                        'input.TelNumber1',
                        'input[name*="Phone"]',
                        'input[name*="phone"]',
                        'input[name*="Tel"]',
                        'input[name*="tel"]',
                        'input[type="tel"]',
                        'input[placeholder*="phone"]',
                        '#Phone',
                        'input[value][pattern*="[0-9]"]'
                    ]
                };
                
                // Get all form inputs for debugging
                const allInputs = document.querySelectorAll('input');
                allInputs.forEach(input => {
                    data.debugInfo.allInputs.push({
                        type: input.type,
                        name: input.name || '',
                        className: input.className || '',
                        id: input.id || '',
                        placeholder: input.placeholder || '',
                        value: input.value || '',
                        disabled: input.disabled,
                        tagName: input.tagName
                    });
                });
                
                // Try to extract each field
                Object.keys(fieldSelectors).forEach(field => {
                    for (const selector of fieldSelectors[field]) {
                        try {
                            const element = document.querySelector(selector);
                            if (element && element.value && element.value.trim()) {
                                data[field] = element.value.trim();
                                data.debugInfo.foundElements.push({
                                    field: field,
                                    selector: selector,
                                    value: element.value
                                });
                                return; // Found value, move to next field
                            }
                        } catch (e) {
                            // Continue to next selector
                        }
                    }
                });
                
                return data;
            });
            
            // Log debug information
            logger.info(`🔍 Found ${personalData.debugInfo.allInputs.length} input elements on page`);
            logger.info(`✅ Successfully extracted ${personalData.debugInfo.foundElements.length} field values`);
            
            personalData.debugInfo.foundElements.forEach(element => {
                logger.info(`  📋 ${element.field}: "${element.value}" (using ${element.selector})`);
            });
            
            // Clean up debug info for return (keep it minimal)
            delete personalData.debugInfo.allInputs;
            
            return personalData;
            
        } catch (error) {
            logger.error('❌ Error during navigation and extraction:', error.message);
            
            // Try to get page content for debugging
            try {
                const content = await page.content();
                const contentPreview = content.substring(0, 500);
                logger.error(`📄 Page content preview: ${contentPreview}...`);
            } catch (contentError) {
                logger.error('Could not retrieve page content for debugging');
            }
            
            throw error;
        } finally {
            await page.close();
        }
    }
}

// Test function
async function testRMVDataExtraction() {
    console.log('🧪 Starting RMV Data Extractor Test...');
    console.log('=' .repeat(50));
    
    const extractor = new RMVDataExtractor();
    
    // Example RMV appointment URL (using the one from previous tests)
    const appointmentUrl = 'https://rmvmassdotappt.cxmflow.com/Appointment/Index/2c052fc7-571f-4b76-9790-7e91f103c408?AccessToken=f7fb561d-7dc4-411b-b082-f29b705d26c5';
    
    const startTime = Date.now();
    
    try {
        const personalData = await extractor.extractPersonalData(appointmentUrl);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('');
        console.log('🎉 EXTRACTION SUCCESS!');
        console.log('=' .repeat(50));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log('📊 Extracted Data:');
        console.table(personalData);
        
        // Validate extracted data
        const hasValidData = personalData.firstName || personalData.lastName || personalData.email || personalData.phone;
        
        if (hasValidData) {
            console.log('✅ Test PASSED - Personal data successfully extracted');
        } else {
            console.log('⚠️  Test PARTIAL - No personal data found (may need different selectors)');
        }
        
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('');
        console.log('❌ EXTRACTION FAILED!');
        console.log('=' .repeat(50));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`💥 Error: ${error.message}`);
        console.log('❌ Test FAILED - Could not extract personal data');
    }
    
    console.log('');
    console.log('🏁 Test Complete');
}

// Export for use in other modules
module.exports = RMVDataExtractor;

// Run test if this file is executed directly
if (require.main === module) {
    testRMVDataExtraction().catch(console.error);
}