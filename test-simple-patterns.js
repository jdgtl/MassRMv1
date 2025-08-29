// Quick test of simple URL patterns for RMV appointments
const puppeteer = require('puppeteer');
const { DirectUrlScraper } = require('./rmv-direct-url');

async function testSimplePatterns() {
  console.log('🚀 Starting simple pattern test for Danvers (ID: 12)...');
  
  const browser = await puppeteer.launch({ 
    headless: true, // Run in headless mode
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
  });
  
  try {
    const page = await browser.newPage();
    const scraper = new DirectUrlScraper();
    
    // Test location: Danvers (ID: 12)
    const testLocation = { id: 12, name: 'Danvers' };
    
    console.log(`\n📍 Testing comprehensive location selection for ${testLocation.name} (ID: ${testLocation.id})...`);
    
    const result = await scraper.comprehensiveLocationSelection(page, testLocation);
    
    if (result.success) {
      console.log(`\n✅ SUCCESS! Method: ${result.method}`);
      if (result.workingUrl) console.log(`Working URL: ${result.workingUrl}`);
      if (result.buttonText) console.log(`Button used: ${result.buttonText}`);
    } else {
      console.log('\n⚠️ Simple patterns got HTTP 200 but no appointment elements found');
      
      // Let's manually check what's on the last tested page
      const pageContent = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          bodyText: document.body.textContent.substring(0, 800),
          hasLocationSelection: document.querySelector('#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb .QflowObjectItem') !== null,
          appointmentElements: [
            '.appointment-slot', '.time-slot', '[data-time]', '.calendar-day',
            '.available-time', '.booking-slot', '.time-option'
          ].map(selector => ({
            selector,
            found: document.querySelector(selector) !== null,
            count: document.querySelectorAll(selector).length
          }))
        };
      });
      
      console.log('\n📄 Page Analysis:');
      console.log(`Title: ${pageContent.title}`);
      console.log(`URL: ${pageContent.url}`);
      console.log(`Still on location selection: ${pageContent.hasLocationSelection}`);
      console.log(`Content preview: ${pageContent.bodyText}...`);
      console.log('\n🔍 Appointment element search:');
      pageContent.appointmentElements.forEach(elem => {
        if (elem.found) {
          console.log(`  ✅ ${elem.selector}: ${elem.count} found`);
        } else {
          console.log(`  ❌ ${elem.selector}: not found`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

// Run the test
testSimplePatterns().then(() => {
  console.log('\n🏁 Test completed');
}).catch(error => {
  console.error('❌ Test error:', error);
});