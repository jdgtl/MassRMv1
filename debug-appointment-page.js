// Debug what's on the appointment page after stealth clicking
const puppeteer = require('puppeteer');
const { DirectUrlScraper } = require('./rmv-direct-url');

async function debugAppointmentPage() {
  console.log('🔍 Debugging appointment page content after stealth clicking...');
  
  const browser = await puppeteer.launch({ 
    headless: true, // Run headless to avoid connection issues
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
  });
  
  try {
    const page = await browser.newPage();
    const scraper = new DirectUrlScraper();
    
    // Test location: Haverhill (ID: 27)
    const testLocation = { id: 27, name: 'Haverhill' };
    
    // Navigate to the base page first
    await page.goto('https://rmvmassdotappt.cxmflow.com/Appointment/Index/2c052fc7-571f-4b76-9790-7e91f103c408?AccessToken=cd490506-57d2-44f0-a546-7499978c89bb', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    console.log(`\n🎯 Using stealth clicking for ${testLocation.name}...`);
    const clickResult = await scraper.stealthLocationClick(page, testLocation);
    
    if (clickResult.success) {
      console.log('✅ Stealth clicking worked! Now analyzing page content...');
      
      // Wait for page to fully load
      await page.waitForTimeout(5000);
      
      // Comprehensive page analysis
      const pageAnalysis = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          
          // Check for various appointment-related elements
          appointmentElements: {
            timeSlots: document.querySelectorAll('.time-slot').length,
            appointmentSlots: document.querySelectorAll('.appointment-slot').length,
            dataTimeElements: document.querySelectorAll('[data-time]').length,
            calendarDays: document.querySelectorAll('.calendar-day').length,
            availableTime: document.querySelectorAll('.available-time').length,
            bookingSlots: document.querySelectorAll('.booking-slot').length,
            timeOptions: document.querySelectorAll('.time-option').length,
            buttons: document.querySelectorAll('button').length,
            clickableElements: document.querySelectorAll('a, button, input').length
          },
          
          // Get all text content to see what's actually on the page
          bodyText: document.body.textContent.substring(0, 2000),
          
          // Get all button texts
          buttonTexts: Array.from(document.querySelectorAll('button')).map(btn => ({
            text: btn.textContent?.trim() || '',
            classes: btn.className || '',
            disabled: btn.disabled,
            visible: btn.offsetParent !== null
          })).filter(btn => btn.text.length > 0),
          
          // Get all clickable elements with time-related text
          timeRelatedElements: Array.from(document.querySelectorAll('*')).filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            return (text.includes('am') || text.includes('pm') || text.includes(':')) && 
                   text.length < 100 && 
                   el.offsetParent !== null;
          }).map(el => ({
            tagName: el.tagName,
            text: el.textContent?.trim() || '',
            classes: el.className || '',
            id: el.id || ''
          })),
          
          // Check if we're still on appointment selection or moved to next step
          stepIndicators: Array.from(document.querySelectorAll('*')).filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            return text.includes('step') || text.includes('appointment') || text.includes('time') || text.includes('date');
          }).map(el => ({
            text: el.textContent?.trim() || '',
            classes: el.className || ''
          })).slice(0, 10), // First 10 relevant elements
          
          // Look for calendar or date picker elements
          calendarElements: {
            calendar: document.querySelector('.calendar') !== null,
            datePicker: document.querySelector('.date-picker, .datepicker') !== null,
            monthView: document.querySelector('.month-view, .calendar-month') !== null,
            timeGrid: document.querySelector('.time-grid, .appointment-grid') !== null
          }
        };
      });
      
      console.log('\n📊 Page Analysis Results:');
      console.log(`Title: ${pageAnalysis.title}`);
      console.log(`URL: ${pageAnalysis.url}`);
      console.log('\n🔍 Appointment Elements Found:');
      Object.entries(pageAnalysis.appointmentElements).forEach(([key, count]) => {
        console.log(`  ${key}: ${count}`);
      });
      
      console.log('\n📝 Content Preview:');
      console.log(pageAnalysis.bodyText);
      
      console.log('\n🔘 Button Analysis:');
      pageAnalysis.buttonTexts.slice(0, 10).forEach(btn => {
        console.log(`  "${btn.text}" (disabled: ${btn.disabled}, visible: ${btn.visible})`);
      });
      
      console.log('\n⏰ Time-related Elements:');
      pageAnalysis.timeRelatedElements.slice(0, 10).forEach(el => {
        console.log(`  ${el.tagName}: "${el.text}"`);
      });
      
      console.log('\n🗓️ Calendar Elements:');
      Object.entries(pageAnalysis.calendarElements).forEach(([key, found]) => {
        console.log(`  ${key}: ${found ? '✅' : '❌'}`);
      });
      
      // Save page screenshot for inspection
      console.log('\n📸 Taking screenshot for inspection...');
      await page.screenshot({ path: 'appointment-page-debug.png', fullPage: true });
      console.log('Screenshot saved as appointment-page-debug.png');
      
    } else {
      console.log('❌ Stealth clicking failed:', clickResult.error);
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await browser.close();
  }
}

debugAppointmentPage().catch(console.error);