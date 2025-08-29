// Test the integrated comprehensive location selection in the main service
const axios = require('axios');

async function testIntegratedService() {
  console.log('🚀 Testing integrated comprehensive location selection...');
  
  const testPayload = {
    rmvUrl: 'https://rmvmassdotappt.cxmflow.com/Appointment/Index/2c052fc7-571f-4b76-9790-7e91f103c408?AccessToken=cd490506-57d2-44f0-a546-7499978c89bb',
    selectedCenters: ['Danvers', 'Brockton'],
    userPreferences: {
      startDate: '2025-09-01',
      endDate: '2025-09-30'
    }
  };
  
  try {
    console.log('📡 Making API request to /api/scrape-rmv-appointments...');
    const response = await axios.post('http://localhost:3000/api/scrape-rmv-appointments', testPayload, {
      timeout: 120000 // 2 minutes timeout
    });
    
    console.log('\n✅ API Response received:');
    console.log(`Status: ${response.status}`);
    console.log(`Success: ${response.data.success}`);
    console.log(`Found appointments: ${response.data.found}`);
    console.log(`Total appointments: ${response.data.appointments.length}`);
    console.log(`Scraped centers: ${response.data.scrapedCenters}`);
    
    if (response.data.appointments.length > 0) {
      console.log('\n📅 Appointment details:');
      response.data.appointments.forEach((apt, index) => {
        console.log(`  ${index + 1}. ${apt.center} - ${apt.date} at ${apt.time}`);
        console.log(`     Method: ${apt.method || 'unknown'}`);
        console.log(`     Type: ${apt.type}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Check if server is running first
async function checkServer() {
  try {
    const response = await axios.get('http://localhost:3000/health', { timeout: 5000 });
    console.log(`✅ Server is running: ${response.data.message}`);
    return true;
  } catch (error) {
    console.error('❌ Server not responding. Please start the service with: node rmv-monitor-service-test.js');
    return false;
  }
}

// Main execution
async function main() {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await testIntegratedService();
  }
}

main().catch(error => {
  console.error('❌ Test execution failed:', error.message);
});