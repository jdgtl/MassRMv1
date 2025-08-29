// Capture actual network requests made by successful v1 scraping
const puppeteer = require('puppeteer');
const { DirectUrlScraper } = require('./rmv-direct-url');

async function captureNetworkRequests() {
  console.log('🔍 Capturing network requests from successful RMV scraping...');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
  });
  
  try {
    const page = await browser.newPage();
    
    // Capture all network requests
    const requests = [];
    const responses = [];
    
    page.on('request', request => {
      requests.push({
        method: request.method(),
        url: request.url(),
        headers: request.headers(),
        postData: request.postData(),
        timestamp: Date.now()
      });
      
      console.log(`📤 REQUEST: ${request.method()} ${request.url()}`);
      if (request.postData()) {
        console.log(`   POST DATA: ${request.postData()}`);
      }
    });
    
    page.on('response', response => {
      responses.push({
        status: response.status(),
        url: response.url(),
        headers: response.headers(),
        timestamp: Date.now()
      });
      
      console.log(`📥 RESPONSE: ${response.status()} ${response.url()}`);
    });
    
    const scraper = new DirectUrlScraper();
    
    // Test location: Haverhill (ID: 27) - known to work
    const testLocation = { id: 27, name: 'Haverhill' };
    
    console.log(`\n🎯 Testing ${testLocation.name} with network capture...`);
    
    const result = await scraper.comprehensiveLocationSelection(page, testLocation);
    
    if (result.success && result.appointments && result.appointments.length > 0) {
      console.log(`\n✅ SUCCESS! Found ${result.appointments.length} appointments`);
      console.log(`Method used: ${result.method}`);
      
      // Save captured network data
      const networkCapture = {
        success: true,
        location: testLocation,
        method: result.method,
        appointments: result.appointments,
        captureTime: new Date().toISOString(),
        requests: requests,
        responses: responses.map(r => ({
          ...r,
          // Don't capture full response body to keep file manageable
          hasBody: true
        }))
      };
      
      // Write to file for analysis
      const fs = require('fs').promises;
      await fs.writeFile(
        'network-capture.json', 
        JSON.stringify(networkCapture, null, 2)
      );
      
      console.log('\n📊 Network Analysis:');
      console.log(`Total requests: ${requests.length}`);
      console.log(`Total responses: ${responses.length}`);
      
      // Find the critical requests (likely POST requests to RMV)
      const postRequests = requests.filter(r => r.method === 'POST');
      console.log(`\n🎯 POST Requests (${postRequests.length}):`);
      postRequests.forEach((req, index) => {
        console.log(`${index + 1}. ${req.url}`);
        if (req.postData) {
          console.log(`   Data: ${req.postData.substring(0, 200)}${req.postData.length > 200 ? '...' : ''}`);
        }
      });
      
      // Find requests to RMV domain
      const rmvRequests = requests.filter(r => r.url.includes('rmvmassdotappt.cxmflow.com'));
      console.log(`\n🏛️ RMV Requests (${rmvRequests.length}):`);
      rmvRequests.forEach((req, index) => {
        console.log(`${index + 1}. ${req.method} ${req.url}`);
        if (req.postData) {
          console.log(`   Headers: ${JSON.stringify(req.headers, null, 2)}`);
          console.log(`   Data: ${req.postData}`);
        }
      });
      
      console.log('\n📁 Network capture saved to: network-capture.json');
      console.log('🔍 Ready for HTTP-only implementation!');
      
    } else {
      console.log('❌ Scraping failed - cannot capture successful network requests');
    }
    
  } catch (error) {
    console.error('❌ Network capture failed:', error.message);
  } finally {
    await browser.close();
  }
}

captureNetworkRequests().catch(console.error);