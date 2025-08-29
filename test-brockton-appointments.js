// Test Brockton specifically to see the actual appointment dates and times
const puppeteer = require('puppeteer');
const { DirectUrlScraper } = require('./rmv-direct-url');

async function testBrocktonAppointments() {
  console.log('🚀 Testing Brockton appointments to see actual dates and times...');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
  });
  
  try {
    const page = await browser.newPage();
    const scraper = new DirectUrlScraper();
    
    // Test location: Brockton (ID: 33)
    const testLocation = { id: 33, name: 'Brockton' };
    
    console.log(`\n📍 Testing ${testLocation.name} (ID: ${testLocation.id})...`);
    
    const result = await scraper.comprehensiveLocationSelection(page, testLocation);
    
    if (result.success && result.appointments && result.appointments.length > 0) {
      console.log(`\n✅ SUCCESS! Found ${result.appointments.length} appointments`);
      console.log(`Method: ${result.method}`);
      
      console.log('\n📅 APPOINTMENT DETAILS:');
      result.appointments.slice(0, 20).forEach((apt, index) => {
        console.log(`  ${index + 1}. ${apt.date} at ${apt.time} (${apt.displayText || 'no display text'})`);
      });
      
      if (result.appointments.length > 20) {
        console.log(`  ... and ${result.appointments.length - 20} more appointments`);
      }
      
    } else {
      console.log('\n❌ No appointments found');
      if (result.error) console.log(`Error: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

testBrocktonAppointments().catch(console.error);