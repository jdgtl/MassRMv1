// Direct test of 3-step navigation scraper
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

// 3-Step Navigation RMV scraper - PRODUCTION VERSION
async function checkRMVUrl(fullUrl, userPreferences = {}) {
    logger.info('🚀 Starting 3-Step Navigation RMV scraping for URL:', fullUrl);
    logger.info('👤 User preferences:', userPreferences);
    
    let browser;
    let page;
    
    try {
        // Initialize browser
        logger.info('🔧 Initializing Puppeteer...');
        browser = await puppeteer.launch({
            headless: true, // Run headless for CI compatibility
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
        
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const results = {
            success: false,
            step: 0,
            offices: [],
            selectedOffices: [],
            appointments: [],
            totalAppointments: 0,
            errors: []
        };
        
        // STEP 1: Navigate to initial URL and extract office list
        logger.info('📍 STEP 1: Loading initial URL and extracting office list...');
        results.step = 1;
        
        await page.goto(fullUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Wait for office list to load
        try {
            await page.waitForSelector('.QflowObjectItem[data-id]', { timeout: 15000 });
            logger.info('✅ Office selection page loaded');
        } catch (error) {
            logger.error('❌ Office selection elements not found');
            results.errors.push('Office selection elements not found');
            return results;
        }
        
        // Extract all offices
        const offices = await page.evaluate(() => {
            const officeElements = document.querySelectorAll('.QflowObjectItem[data-id]');
            return Array.from(officeElements).map(element => ({
                id: element.getAttribute('data-id'),
                name: element.textContent.trim(),
                selector: `[data-id="${element.getAttribute('data-id')}"]`
            }));
        });
        
        logger.info(`✅ Found ${offices.length} offices:`, offices.map(o => o.name));
        results.offices = offices;
        
        // STEP 2: Filter and navigate through selected locations
        logger.info('🔍 STEP 2: Filtering offices based on user preferences...');
        results.step = 2;
        
        const userLocations = userPreferences.locations || [];
        const selectedOffices = offices.filter(office => {
            return userLocations.some(userLoc => 
                office.name.toLowerCase().includes(userLoc.toLowerCase()) ||
                userLoc.toLowerCase().includes(office.name.toLowerCase())
            );
        });
        
        if (selectedOffices.length === 0) {
            logger.warn('⚠️ No offices matched user preferences, using all offices');
            selectedOffices.push(...offices);
        }
        
        logger.info(`📋 Selected ${selectedOffices.length} offices:`, selectedOffices.map(o => o.name));
        results.selectedOffices = selectedOffices;
        
        // STEP 3: Navigate to each matched office to get appointment times
        logger.info('⏰ STEP 3: Extracting appointments from selected offices...');
        results.step = 3;
        
        let totalAppointments = 0;
        
        for (const office of selectedOffices) {
            logger.info(`🏢 Processing ${office.name} (ID: ${office.id})...`);
            
            try {
                // Navigate back to main page if needed
                const currentUrl = page.url();
                if (!currentUrl.includes('rmvmassdotappt.cxmflow.com')) {
                    await page.goto(fullUrl, { waitUntil: 'networkidle0' });
                    await page.waitForSelector('.QflowObjectItem[data-id]', { timeout: 10000 });
                }
                
                // More robust clicking with error handling
                try {
                    await page.evaluate((selector) => {
                        const element = document.querySelector(selector);
                        if (element) {
                            element.click();
                        }
                    }, office.selector);
                    logger.info(`   ✅ Clicked ${office.name}`);
                } catch (clickError) {
                    logger.warn(`   ⚠️ Click failed, trying alternative method: ${clickError.message}`);
                    await page.$eval(office.selector, el => el.click());
                }
                
                // Wait for navigation to appointment page with more robust waiting
                await new Promise(resolve => setTimeout(resolve, 3000)); // Give time for navigation
                
                try {
                    await Promise.race([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                        page.waitForSelector('.ServiceAppointmentDateTime[data-datetime]', { timeout: 15000 }),
                        new Promise(resolve => setTimeout(resolve, 10000)) // Fallback timeout
                    ]);
                } catch (navError) {
                    logger.warn(`   ⚠️ Navigation wait failed: ${navError.message}`);
                    // Continue anyway, might have already navigated
                }
                
                logger.info('   📅 Appointment page loaded, extracting appointments...');
                
                // Extract appointment times using pattern from attleboro-landing-page.html
                const appointmentElements = await page.evaluate(() => {
                    const appointments = [];
                    const elements = document.querySelectorAll('.ServiceAppointmentDateTime[data-datetime]');
                    
                    elements.forEach(element => {
                        const datetime = element.getAttribute('data-datetime');
                        const serviceId = element.getAttribute('data-serviceid');
                        const appointmentTypeId = element.getAttribute('data-appointmenttypeid');
                        const displayTime = element.textContent.trim();
                        const isDisabled = element.classList.contains('disabled') || element.hasAttribute('disabled');
                        
                        if (datetime && !isDisabled) {
                            appointments.push({
                                datetime: datetime,
                                displayTime: displayTime,
                                serviceId: serviceId,
                                appointmentTypeId: appointmentTypeId,
                                available: !isDisabled,
                                rawData: {
                                    className: element.className,
                                    outerHTML: element.outerHTML.substring(0, 200) + '...'
                                }
                            });
                        }
                    });
                    
                    return appointments;
                });
                
                if (appointmentElements.length > 0) {
                    logger.info(`   ✅ Found ${appointmentElements.length} available appointments`);
                    
                    const officeAppointments = {
                        office: office.name,
                        officeId: office.id,
                        appointments: appointmentElements,
                        count: appointmentElements.length
                    };
                    
                    results.appointments.push(officeAppointments);
                    totalAppointments += appointmentElements.length;
                    
                    // Log first few appointments for verification
                    appointmentElements.slice(0, 3).forEach((apt, idx) => {
                        logger.info(`     ${idx + 1}. ${apt.datetime} - ${apt.displayTime}`);
                    });
                } else {
                    logger.warn(`   ⚠️ No appointments found for ${office.name}`);
                    results.appointments.push({
                        office: office.name,
                        officeId: office.id,
                        appointments: [],
                        count: 0
                    });
                }
                
            } catch (error) {
                logger.error(`   ❌ Error processing ${office.name}: ${error.message}`);
                results.errors.push(`${office.name}: ${error.message}`);
                
                results.appointments.push({
                    office: office.name,
                    officeId: office.id,
                    appointments: [],
                    count: 0,
                    error: error.message
                });
            }
            
            // Delay between offices
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Final results
        results.success = true;
        results.totalAppointments = totalAppointments;
        
        logger.info(`🎉 SCRAPING COMPLETE!`);
        logger.info(`   ✅ Processed ${selectedOffices.length} offices`);
        logger.info(`   📅 Found ${totalAppointments} total appointments`);
        logger.info(`   ❌ ${results.errors.length} errors encountered`);
        
        return results;
        
    } catch (error) {
        logger.error('❌ 3-step scraping failed:', error.message);
        return {
            success: false,
            step: 0,
            error: error.message,
            appointments: []
        };
    } finally {
        if (browser) {
            await browser.close();
            logger.info('🔒 Browser closed');
        }
    }
}

// Test execution
async function runTest() {
    console.log('🧪 Testing 3-Step Navigation Scraper...');
    
    const url = 'https://rmvmassdotappt.cxmflow.com/Appointment/Index/2c052fc7-571f-4b76-9790-7e91f103c408?AccessToken=f7fb561d-7dc4-411b-b082-f29b705d26c5';
    const preferences = { 
        locations: ['Danvers'] 
    };
    
    console.log('URL:', url);
    console.log('Target Location:', preferences.locations[0]);
    console.log('');
    
    const startTime = Date.now();
    const result = await checkRMVUrl(url, preferences);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(50));
    console.log('🏁 TEST RESULTS');
    console.log('='.repeat(50));
    console.log('Duration:', duration + 's');
    console.log('Success:', result.success ? '✅' : '❌');
    console.log('Step Reached:', result.step);
    console.log('Offices Found:', result.offices?.length || 0);
    console.log('Selected Offices:', result.selectedOffices?.length || 0);
    console.log('Total Appointments:', result.totalAppointments || 0);
    console.log('Errors:', result.errors?.length || 0);
    
    if (result.errors?.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(error => console.log('  ❌', error));
    }
    
    if (result.appointments?.length > 0) {
        console.log('\nAppointment Summary:');
        result.appointments.forEach(office => {
            console.log(`  📍 ${office.office}: ${office.count} appointments`);
            if (office.appointments.length > 0) {
                office.appointments.slice(0, 2).forEach(apt => {
                    console.log(`     - ${apt.datetime} (${apt.displayTime})`);
                });
                if (office.appointments.length > 2) {
                    console.log(`     ... and ${office.appointments.length - 2} more`);
                }
            }
        });
    }
    
    console.log('\n✅ Test Complete');
}

if (require.main === module) {
    runTest().catch(console.error);
}

module.exports = { checkRMVUrl };