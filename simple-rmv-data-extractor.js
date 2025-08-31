// Simple RMV Personal Data Extractor Test Script
// Simplified approach to extract personal data from RMV URLs

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

class SimpleRMVDataExtractor {
    constructor() {
        this.browser = null;
    }

    /**
     * Extract personal data from RMV appointment URL using multiple strategies
     * @param {string} url - The RMV appointment URL with AccessToken
     * @returns {Promise<Object>} Personal data object
     */
    async extractPersonalData(url) {
        logger.info('🔍 Starting simple RMV personal data extraction...');
        logger.info(`📍 URL: ${url}`);

        try {
            // Initialize browser
            this.browser = await puppeteer.launch({
                headless: "new", // Use new headless mode
                defaultViewport: { width: 1280, height: 720 },
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security'
                ]
            });

            // Try multiple extraction strategies
            const strategies = [
                () => this.strategyDirectExtraction(url),
                () => this.strategyWithOfficeNavigation(url),
                () => this.strategyDeepScan(url)
            ];

            let lastError;
            for (let i = 0; i < strategies.length; i++) {
                try {
                    logger.info(`🎯 Trying extraction strategy ${i + 1}/${strategies.length}...`);
                    const result = await strategies[i]();
                    
                    if (this.hasValidPersonalData(result)) {
                        logger.info('✅ Successfully extracted personal data!');
                        return result;
                    } else {
                        logger.warn(`⚠️ Strategy ${i + 1} didn't find personal data, trying next...`);
                    }
                } catch (error) {
                    logger.error(`❌ Strategy ${i + 1} failed: ${error.message}`);
                    lastError = error;
                }
            }

            throw new Error(`All extraction strategies failed. Last error: ${lastError?.message}`);

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
     * Strategy 1: Direct extraction from initial page
     */
    async strategyDirectExtraction(url) {
        const page = await this.browser.newPage();
        
        try {
            logger.info('📋 Strategy 1: Direct page extraction...');
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            await page.waitForTimeout(2000);

            const pageTitle = await page.title();
            logger.info(`📄 Page title: ${pageTitle}`);

            return await this.scanPageForPersonalData(page);

        } finally {
            await page.close();
        }
    }

    /**
     * Strategy 2: Navigate through office selection then scan
     */
    async strategyWithOfficeNavigation(url) {
        const page = await this.browser.newPage();
        
        try {
            logger.info('📋 Strategy 2: Office navigation + extraction...');
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            await page.waitForTimeout(2000);

            // Try to select an office if on office selection page
            const offices = await page.$$('.QflowObjectItem[data-id]');
            if (offices.length > 0) {
                logger.info(`🏢 Found ${offices.length} offices, selecting first one...`);
                await offices[0].click();
                await page.waitForTimeout(3000);
                
                try {
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
                } catch (navError) {
                    logger.info('No navigation detected, continuing...');
                }
            }

            return await this.scanPageForPersonalData(page);

        } finally {
            await page.close();
        }
    }

    /**
     * Strategy 3: Deep scan - try to navigate through entire flow
     */
    async strategyDeepScan(url) {
        const page = await this.browser.newPage();
        
        try {
            logger.info('📋 Strategy 3: Deep navigation scan...');
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            await page.waitForTimeout(2000);

            const maxSteps = 5;
            for (let step = 0; step < maxSteps; step++) {
                logger.info(`🔄 Deep scan step ${step + 1}/${maxSteps}...`);
                
                // Scan current page for personal data
                const personalData = await this.scanPageForPersonalData(page);
                if (this.hasValidPersonalData(personalData)) {
                    logger.info(`✅ Found personal data on step ${step + 1}!`);
                    return personalData;
                }

                // Try to advance to next step
                const advanced = await this.tryAdvanceToNextStep(page);
                if (!advanced) {
                    logger.info(`🛑 Cannot advance further from step ${step + 1}`);
                    break;
                }
                
                await page.waitForTimeout(2000);
            }

            // Return whatever we found, even if incomplete
            return await this.scanPageForPersonalData(page);

        } finally {
            await page.close();
        }
    }

    /**
     * Try to advance to the next step in the appointment flow
     */
    async tryAdvanceToNextStep(page) {
        try {
            // Try office selection first
            const offices = await page.$$('.QflowObjectItem[data-id]');
            if (offices.length > 0) {
                logger.info('🏢 Clicking office...');
                await offices[0].click();
                await page.waitForTimeout(3000);
                return true;
            }

            // Try appointment selection
            const appointments = await page.$$('.ServiceAppointmentDateTime[data-datetime]:not(.disabled)');
            if (appointments.length > 0) {
                logger.info('⏰ Clicking appointment...');
                await appointments[0].click();
                await page.waitForTimeout(3000);
                return true;
            }

            // Try next/continue buttons
            const nextButtons = await page.$$('button:has-text("Next"), button:has-text("Continue"), input[type="submit"], .btn-primary');
            for (const button of nextButtons) {
                try {
                    const text = await button.textContent();
                    if (text && text.match(/next|continue|submit|proceed/i)) {
                        logger.info(`🔘 Clicking button: "${text}"`);
                        await button.click();
                        await page.waitForTimeout(3000);
                        return true;
                    }
                } catch (e) {
                    // Continue to next button
                }
            }

            return false;

        } catch (error) {
            logger.warn(`⚠️ Could not advance: ${error.message}`);
            return false;
        }
    }

    /**
     * Comprehensive scan of page for personal data
     */
    async scanPageForPersonalData(page) {
        return await page.evaluate(() => {
            const personalData = {
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                extractionMethod: 'comprehensive_scan',
                extractionTimestamp: new Date().toISOString(),
                sourceUrl: window.location.href,
                pageTitle: document.title,
                foundElements: []
            };

            // Strategy 1: Look for disabled form inputs (pre-filled user data)
            const disabledInputs = document.querySelectorAll('input[disabled][value]');
            disabledInputs.forEach(input => {
                const value = input.value?.trim();
                if (!value) return;

                const className = input.className.toLowerCase();
                const name = input.name?.toLowerCase() || '';
                const id = input.id?.toLowerCase() || '';
                const placeholder = input.placeholder?.toLowerCase() || '';

                // First name detection
                if (!personalData.firstName && 
                    (className.includes('firstname') || name.includes('firstname') || 
                     id.includes('firstname') || placeholder.includes('first'))) {
                    personalData.firstName = value;
                    personalData.foundElements.push({field: 'firstName', selector: input.tagName + (input.className ? '.' + input.className.replace(/\s+/g, '.') : ''), value});
                }

                // Last name detection
                if (!personalData.lastName && 
                    (className.includes('lastname') || name.includes('lastname') || 
                     id.includes('lastname') || placeholder.includes('last'))) {
                    personalData.lastName = value;
                    personalData.foundElements.push({field: 'lastName', selector: input.tagName + (input.className ? '.' + input.className.replace(/\s+/g, '.') : ''), value});
                }

                // Email detection
                if (!personalData.email && 
                    (className.includes('email') || name.includes('email') || 
                     id.includes('email') || input.type === 'email' || value.includes('@'))) {
                    personalData.email = value;
                    personalData.foundElements.push({field: 'email', selector: input.tagName + (input.className ? '.' + input.className.replace(/\s+/g, '.') : ''), value});
                }

                // Phone detection
                if (!personalData.phone && 
                    (className.includes('phone') || className.includes('tel') || name.includes('phone') || 
                     name.includes('tel') || input.type === 'tel' || /^\d{10,}$/.test(value.replace(/\D/g, '')))) {
                    personalData.phone = value;
                    personalData.foundElements.push({field: 'phone', selector: input.tagName + (input.className ? '.' + input.className.replace(/\s+/g, '.') : ''), value});
                }
            });

            // Strategy 2: Look for any form inputs with values (enabled or disabled)
            if (!personalData.firstName || !personalData.lastName || !personalData.email || !personalData.phone) {
                const allInputs = document.querySelectorAll('input[value]');
                allInputs.forEach(input => {
                    const value = input.value?.trim();
                    if (!value) return;

                    // Email pattern matching
                    if (!personalData.email && value.includes('@') && value.includes('.')) {
                        personalData.email = value;
                        personalData.foundElements.push({field: 'email', selector: 'input[value*="@"]', value});
                    }

                    // Phone pattern matching
                    if (!personalData.phone && /^\d{10,}$/.test(value.replace(/\D/g, ''))) {
                        personalData.phone = value;
                        personalData.foundElements.push({field: 'phone', selector: 'input[value]', value});
                    }
                });
            }

            // Strategy 3: Look for text content on page
            if (!personalData.email) {
                const emailMatches = document.body.innerText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
                if (emailMatches && emailMatches.length > 0) {
                    personalData.email = emailMatches[0];
                    personalData.foundElements.push({field: 'email', selector: 'text-content', value: emailMatches[0]});
                }
            }

            return personalData;
        });
    }

    /**
     * Check if we have valid personal data
     */
    hasValidPersonalData(data) {
        if (!data) return false;
        return !!(data.firstName || data.lastName || data.email || data.phone);
    }
}

// Test function
async function testSimpleRMVDataExtraction() {
    console.log('🧪 Testing Simple RMV Data Extractor...');
    console.log('='.repeat(50));
    
    const extractor = new SimpleRMVDataExtractor();
    
    // Example RMV appointment URL
    const appointmentUrl = 'https://rmvmassdotappt.cxmflow.com/Appointment/Index/2c052fc7-571f-4b76-9790-7e91f103c408?AccessToken=f7fb561d-7dc4-411b-b082-f29b705d26c5';
    
    const startTime = Date.now();
    
    try {
        const personalData = await extractor.extractPersonalData(appointmentUrl);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('');
        console.log('🎉 EXTRACTION COMPLETE!');
        console.log('='.repeat(50));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`📄 Page: ${personalData.pageTitle}`);
        console.log(`🔗 URL: ${personalData.sourceUrl}`);
        console.log('');
        console.log('📊 Extracted Data:');
        
        const cleanData = {
            firstName: personalData.firstName || '(not found)',
            lastName: personalData.lastName || '(not found)', 
            email: personalData.email || '(not found)',
            phone: personalData.phone || '(not found)'
        };
        console.table(cleanData);
        
        if (personalData.foundElements && personalData.foundElements.length > 0) {
            console.log('');
            console.log('🔍 Found Elements:');
            personalData.foundElements.forEach(element => {
                console.log(`  📋 ${element.field}: "${element.value}" (${element.selector})`);
            });
        }
        
        const hasValidData = extractor.hasValidPersonalData(personalData);
        
        if (hasValidData) {
            console.log('');
            console.log('✅ Test PASSED - Personal data successfully extracted!');
        } else {
            console.log('');
            console.log('⚠️  Test PARTIAL - No personal data found');
        }
        
        return personalData;
        
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('');
        console.log('❌ EXTRACTION FAILED!');
        console.log('='.repeat(50));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`💥 Error: ${error.message}`);
        console.log('❌ Test FAILED - Could not extract personal data');
        
        throw error;
    }
}

// Export for use in other modules
module.exports = SimpleRMVDataExtractor;

// Run test if this file is executed directly
if (require.main === module) {
    testSimpleRMVDataExtraction().catch(console.error);
}