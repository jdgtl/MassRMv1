// Ultra-Resilient RMV Personal Data Extractor
// Handles network issues, timeouts, and connection problems

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

class ResilientRMVExtractor {
    constructor() {
        this.browser = null;
    }

    /**
     * Extract personal data with maximum resilience
     */
    async extractPersonalData(url) {
        logger.info('🔍 Starting ultra-resilient RMV personal data extraction...');
        logger.info(`📍 URL: ${url}`);

        // Test network connectivity first
        try {
            await this.testNetworkConnectivity();
        } catch (networkError) {
            throw new Error(`Network connectivity test failed: ${networkError.message}`);
        }

        let lastError;
        
        // Try multiple browser configurations
        const browserConfigs = [
            { name: 'Standard Config', config: this.getStandardBrowserConfig() },
            { name: 'Minimal Config', config: this.getMinimalBrowserConfig() },
            { name: 'Legacy Config', config: this.getLegacyBrowserConfig() }
        ];

        for (const { name, config } of browserConfigs) {
            try {
                logger.info(`🚀 Trying ${name}...`);
                return await this.attemptExtractionWithConfig(url, config);
            } catch (error) {
                logger.warn(`⚠️ ${name} failed: ${error.message}`);
                lastError = error;
                
                // Clean up browser if it exists
                if (this.browser) {
                    try {
                        await this.browser.close();
                    } catch (closeError) {
                        // Ignore close errors
                    }
                    this.browser = null;
                }
                
                // Wait before trying next config
                await this.delay(2000);
            }
        }

        throw new Error(`All browser configurations failed. Last error: ${lastError.message}`);
    }

    /**
     * Test basic network connectivity
     */
    async testNetworkConnectivity() {
        logger.info('🌐 Testing network connectivity...');
        
        const testBrowser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        try {
            const testPage = await testBrowser.newPage();
            
            // Test with a simple page first
            await testPage.goto('https://www.google.com', { 
                waitUntil: 'domcontentloaded',
                timeout: 10000 
            });
            
            logger.info('✅ Basic network connectivity confirmed');
            
            // Test RMV domain connectivity
            await testPage.goto('https://rmvmassdotappt.cxmflow.com', {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            
            logger.info('✅ RMV domain connectivity confirmed');
            
        } finally {
            await testBrowser.close();
        }
    }

    /**
     * Attempt extraction with specific browser configuration
     */
    async attemptExtractionWithConfig(url, config) {
        this.browser = await puppeteer.launch(config);
        
        try {
            const page = await this.browser.newPage();
            
            // Set up page with error handling
            page.on('error', (err) => {
                logger.warn(`Page error: ${err.message}`);
            });
            
            page.on('pageerror', (err) => {
                logger.warn(`Page script error: ${err.message}`);
            });

            // Set realistic user agent and headers
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            await page.setExtraHTTPHeaders({
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            });

            // Multiple attempts at navigation
            const personalData = await this.navigateWithRetries(page, url);
            
            return personalData;
            
        } finally {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                logger.info('🔒 Browser closed');
            }
        }
    }

    /**
     * Navigate with multiple retry strategies
     */
    async navigateWithRetries(page, url, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info(`🎯 Navigation attempt ${attempt}/${maxRetries}...`);
                
                // Progressive timeout strategy - start short, get longer
                const timeout = 15000 + (attempt * 10000); // 15s, 25s, 35s
                
                logger.info(`📋 Loading RMV page (timeout: ${timeout}ms)...`);
                
                // Try different waitUntil strategies
                const waitStrategies = ['networkidle2', 'domcontentloaded', 'load'];
                let pageLoaded = false;
                
                for (const strategy of waitStrategies) {
                    try {
                        await page.goto(url, { 
                            waitUntil: strategy, 
                            timeout: timeout 
                        });
                        logger.info(`✅ Page loaded with strategy: ${strategy}`);
                        pageLoaded = true;
                        break;
                    } catch (loadError) {
                        logger.warn(`⚠️ Load strategy '${strategy}' failed: ${loadError.message}`);
                    }
                }
                
                if (!pageLoaded) {
                    throw new Error('All page load strategies failed');
                }
                
                // Wait a bit for any dynamic content
                await this.delay(3000);
                
                const pageTitle = await page.title();
                logger.info(`📄 Page title: ${pageTitle}`);
                
                // Extract whatever data we can find
                const personalData = await this.extractPersonalDataRobust(page);
                
                if (this.hasAnyValidData(personalData)) {
                    logger.info('✅ Successfully extracted some personal data');
                    return personalData;
                }
                
                // If no data found, try some basic navigation
                const navigatedData = await this.tryBasicNavigation(page);
                
                if (this.hasAnyValidData(navigatedData)) {
                    logger.info('✅ Found data after basic navigation');
                    return navigatedData;
                }
                
                // Return whatever we found
                logger.warn(`⚠️ Attempt ${attempt} found limited data`);
                if (attempt === maxRetries) {
                    return personalData;
                }
                
            } catch (error) {
                logger.error(`❌ Attempt ${attempt} failed: ${error.message}`);
                lastError = error;
                
                if (attempt < maxRetries) {
                    const waitTime = 3000 * attempt; // 3s, 6s, 9s
                    logger.info(`⏳ Waiting ${waitTime}ms before retry...`);
                    await this.delay(waitTime);
                }
            }
        }
        
        throw lastError || new Error('All navigation attempts failed');
    }

    /**
     * Try basic navigation without complex interactions
     */
    async tryBasicNavigation(page) {
        try {
            logger.info('🔍 Attempting basic navigation...');
            
            // Look for any clickable elements that might lead to forms
            const clickableElements = await page.$$('button, a, .QflowObjectItem');
            
            for (let i = 0; i < Math.min(clickableElements.length, 3); i++) {
                try {
                    const element = clickableElements[i];
                    const text = await element.evaluate(el => el.textContent?.trim() || '');
                    
                    if (text && text.length > 0 && text.length < 100) {
                        logger.info(`🔘 Trying to click: "${text}"`);
                        
                        await element.click();
                        await this.delay(3000);
                        
                        // Check for data after click
                        const data = await this.extractPersonalDataRobust(page);
                        if (this.hasAnyValidData(data)) {
                            return data;
                        }
                    }
                } catch (clickError) {
                    logger.warn(`⚠️ Click attempt failed: ${clickError.message}`);
                }
            }
            
            // Return whatever we can extract from current page
            return await this.extractPersonalDataRobust(page);
            
        } catch (error) {
            logger.error(`❌ Basic navigation failed: ${error.message}`);
            return await this.extractPersonalDataRobust(page);
        }
    }

    /**
     * Robust data extraction that tries multiple methods
     */
    async extractPersonalDataRobust(page) {
        try {
            return await page.evaluate(() => {
                const personalData = {
                    firstName: '',
                    lastName: '',
                    email: '',
                    phone: '',
                    extractionMethod: 'resilient_extraction',
                    extractionTimestamp: new Date().toISOString(),
                    sourceUrl: window.location.href,
                    pageTitle: document.title,
                    foundElements: [],
                    debugInfo: {
                        totalInputs: 0,
                        inputsWithValues: 0,
                        pageHasContent: document.body?.innerText?.length > 100
                    }
                };

                // Helper function
                function getElementSelector(element) {
                    if (element.id) return `#${element.id}`;
                    if (element.className) return `.${element.className.replace(/\s+/g, '.')}`;
                    return element.tagName.toLowerCase();
                }

                // Comprehensive input search
                const allInputs = document.querySelectorAll('input');
                personalData.debugInfo.totalInputs = allInputs.length;
                
                const inputsWithValues = Array.from(allInputs).filter(input => input.value && input.value.trim());
                personalData.debugInfo.inputsWithValues = inputsWithValues.length;

                // Extract from any input with value
                inputsWithValues.forEach(input => {
                    const value = input.value.trim();
                    if (!value || value.length > 200) return; // Skip very long values (likely tokens)

                    const classes = (input.className || '').toLowerCase();
                    const name = (input.name || '').toLowerCase();
                    const id = (input.id || '').toLowerCase();
                    const type = (input.type || '').toLowerCase();

                    // First name detection
                    if (!personalData.firstName && value.length < 50 && 
                        (classes.includes('firstname') || name.includes('firstname') || 
                         id.includes('firstname') || classes.includes('first'))) {
                        personalData.firstName = value;
                        personalData.foundElements.push({
                            field: 'firstName',
                            value: value,
                            selector: getElementSelector(input),
                            method: 'input_field'
                        });
                    }

                    // Last name detection
                    if (!personalData.lastName && value.length < 50 &&
                        (classes.includes('lastname') || name.includes('lastname') || 
                         id.includes('lastname') || classes.includes('last'))) {
                        personalData.lastName = value;
                        personalData.foundElements.push({
                            field: 'lastName',
                            value: value,
                            selector: getElementSelector(input),
                            method: 'input_field'
                        });
                    }

                    // Email detection
                    if (!personalData.email && value.includes('@') && value.includes('.') && value.length < 100) {
                        personalData.email = value;
                        personalData.foundElements.push({
                            field: 'email',
                            value: value,
                            selector: getElementSelector(input),
                            method: 'input_field'
                        });
                    }

                    // Phone detection - only readable formats, no encrypted tokens
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
                                method: 'readable_phone_input'
                            });
                        }
                    }
                });

                // Text content scanning as fallback
                if (!personalData.email) {
                    const emailMatches = document.body.innerText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
                    if (emailMatches && emailMatches.length > 0) {
                        personalData.email = emailMatches[0];
                        personalData.foundElements.push({
                            field: 'email',
                            value: emailMatches[0],
                            selector: 'text-content',
                            method: 'text_scan'
                        });
                    }
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
                error: error.message,
                extractionTimestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Check if we have any valid data (more lenient than before)
     */
    hasAnyValidData(data) {
        if (!data) return false;
        return !!(data.firstName || data.lastName || data.email || data.phone);
    }

    /**
     * Browser configuration options
     */
    getStandardBrowserConfig() {
        return {
            headless: "new",
            defaultViewport: { width: 1366, height: 768 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-blink-features=AutomationControlled',
                '--disable-extensions',
                '--no-first-run'
            ]
        };
    }

    getMinimalBrowserConfig() {
        return {
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        };
    }

    getLegacyBrowserConfig() {
        return {
            headless: true, // Use old headless mode
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        };
    }

    /**
     * Simple delay utility
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ResilientRMVExtractor;