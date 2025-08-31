// RMV Auto-Location Selection - Complete the Simple URL Approach
// We've solved HTTP 400, now we need to auto-progress past location selection

class RMVLocationAutoSelector {
  constructor() {
    this.baseUrl = 'https://rmvmassdotappt.cxmflow.com/Appointment/Index/2c052fc7-571f-4b76-9790-7e91f103c408';
    this.accessToken = 'cd490506-57d2-44f0-a546-7499978c89bb';
  }

  // Method 1: Enhanced URL parameters to trigger auto-selection
  async generateAutoSelectUrls(locationData) {
    const baseParams = `AccessToken=${this.accessToken}`;

    // Try different parameter combinations that might trigger auto-selection
    const urlPatterns = [
      // Pattern 1: Add submit parameter
      `${this.baseUrl}?${baseParams}&locationId=${locationData.id}&submit=true`,

      // Pattern 2: Add step progression
      `${this.baseUrl}?${baseParams}&StepControls_0__Model_Value=${locationData.id}&step=2`,

      // Pattern 3: Add form submission indicators
      `${this.baseUrl}?${baseParams}&locationId=${locationData.id}&StepControls_0__Model_Value=${locationData.id}&CurrentStep=1`,

      // Pattern 4: Add action parameter
      `${this.baseUrl}?${baseParams}&locationId=${locationData.id}&action=selectLocation`,

      // Pattern 5: Add progression flag
      `${this.baseUrl}?${baseParams}&StepControls_0__Model_Value=${locationData.id}&progressStep=true`,

      // Pattern 6: Multiple step indicators
      `${this.baseUrl}?${baseParams}&locationId=${locationData.id}&StepControls_0__Model_Value=${locationData.id}&NextStep=true&CurrentStep=1`,

      // Pattern 7: POST-style parameters
      `${this.baseUrl}?${baseParams}&StepControls%5B0%5D%5BModel%5D%5BValue%5D=${locationData.id}&submit=Continue`,
    ];

    return urlPatterns.map((url, index) => ({
      patternId: index + 1,
      url: url,
      locationId: locationData.id,
      locationName: locationData.name
    }));
  }

  // Method 2: Programmatic location selection with stealth techniques
  async performStealthLocationSelection(page, locationData) {
    console.log(`🥷 Attempting stealth location selection for ${locationData.name} (ID: ${locationData.id})`);

    try {
      // Step 1: Load page with our working URL
      const workingUrl = `${this.baseUrl}?AccessToken=${this.accessToken}&locationId=${locationData.id}`;
      await page.goto(workingUrl, { waitUntil: 'networkidle0' });

      // Step 2: Wait for location selection to be fully loaded
      await page.waitForSelector('#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb .QflowObjectItem', { timeout: 10000 });

      // Step 3: Enhanced stealth measures
      await this.applyStealthMeasures(page);

      // Step 4: Pre-populate the hidden form field
      await page.evaluate((locationId) => {
        const hiddenField = document.querySelector('#StepControls_0__Model_Value');
        if (hiddenField) {
          hiddenField.value = locationId;
          hiddenField.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, locationData.id.toString());

      // Step 5: Find and click the specific location with human-like behavior
      const locationSelector = `[data-id="${locationData.id}"]`;

      // Check if the location element exists
      const locationElement = await page.$(locationSelector);
      if (!locationElement) {
        throw new Error(`Location element not found for ID ${locationData.id}`);
      }

      // Step 6: Human-like mouse movement and click
      await this.humanLikeClick(page, locationSelector);

      // Step 7: Wait for form submission or page change
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
        page.waitForSelector('.appointment-slot, .time-slot, [data-time]', { timeout: 15000 }),
        new Promise(resolve => setTimeout(resolve, 10000)) // Fallback timeout
      ]);

      // Step 8: Verify we've moved past location selection
      const currentUrl = page.url();
      const stillOnLocationSelection = await page.$('#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb .QflowObjectItem');

      if (!stillOnLocationSelection) {
        console.log(`✅ Successfully progressed past location selection!`);
        return { success: true, currentUrl, method: 'stealth_click' };
      } else {
        // Try clicking submit button if location click didn't work
        console.log(`🔄 Location click didn't progress, trying submit button...`);
        return await this.trySubmitButton(page);
      }

    } catch (error) {
      console.error(`❌ Stealth location selection failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Enhanced stealth measures
  async applyStealthMeasures(page) {
    // Remove webdriver indicators
    await page.evaluateOnNewDocument(() => {
      delete navigator.webdriver;
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Add random mouse movements
    await page.mouse.move(Math.random() * 100 + 100, Math.random() * 100 + 100);
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    // Simulate human-like page interaction
    await page.evaluate(() => {
      // Scroll slightly to simulate reading
      window.scrollBy(0, Math.random() * 100);

      // Add some random page interaction
      const randomElement = document.querySelector('body');
      if (randomElement) {
        randomElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      }
    });
  }

  // Human-like clicking with randomization
  async humanLikeClick(page, selector) {
    const element = await page.$(selector);
    const boundingBox = await element.boundingBox();

    // Calculate click position with slight randomization
    const x = boundingBox.x + boundingBox.width / 2 + (Math.random() - 0.5) * 10;
    const y = boundingBox.y + boundingBox.height / 2 + (Math.random() - 0.5) * 10;

    // Move mouse to element with multiple steps
    await page.mouse.move(x - 50, y - 50, { steps: 5 });
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));

    await page.mouse.move(x, y, { steps: 3 });
    await new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 200));

    // Click with slight delay
    await page.mouse.click(x, y);
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 300));
  }

  // Try submit button as fallback
  async trySubmitButton(page) {
    console.log(`🔘 Trying to find and click submit button...`);

    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '.btn-primary',
      '.submit-btn',
      'button:contains("Continue")',
      'button:contains("Next")'
    ];

    for (const selector of submitSelectors) {
      try {
        const submitButton = await page.$(selector);
        if (submitButton) {
          console.log(`   Found submit button: ${selector}`);
          await submitButton.click();

          await Promise.race([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }),
            new Promise(resolve => setTimeout(resolve, 5000))
          ]);

          const stillOnLocationSelection = await page.$('#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb .QflowObjectItem');
          if (!stillOnLocationSelection) {
            console.log(`   ✅ Submit button worked!`);
            return { success: true, currentUrl: page.url(), method: 'submit_button' };
          }
        }
      } catch (error) {
        console.log(`   Submit button ${selector} failed: ${error.message}`);
      }
    }

    return { success: false, error: 'No working submit button found' };
  }

  // Method 3: Complete auto-selection workflow
  async completeLocationSelection(page, locationData) {
    console.log(`🎯 Starting complete location selection for ${locationData.name}`);

    // Try Method 1: Enhanced URL parameters
    console.log(`\n1️⃣ Testing enhanced URL parameters...`);
    const urlPatterns = await this.generateAutoSelectUrls(locationData);

    for (const pattern of urlPatterns) {
      console.log(`   Testing pattern ${pattern.patternId}...`);

      try {
        await page.goto(pattern.url, { waitUntil: 'networkidle0', timeout: 15000 });

        // Check if we bypassed location selection
        const stillOnLocationSelection = await page.$('#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb .QflowObjectItem');
        const hasAppointments = await page.$('.appointment-slot, .time-slot, [data-time]');

        if (!stillOnLocationSelection || hasAppointments) {
          console.log(`   ✅ Pattern ${pattern.patternId} worked - bypassed location selection!`);
          return {
            success: true,
            method: 'url_parameter',
            workingPattern: pattern.patternId,
            workingUrl: pattern.url,
            currentUrl: page.url()
          };
        }

      } catch (error) {
        console.log(`   Pattern ${pattern.patternId} failed: ${error.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Try Method 2: Stealth location selection
    console.log(`\n2️⃣ URL parameters didn't work, trying stealth selection...`);
    const stealthResult = await this.performStealthLocationSelection(page, locationData);

    if (stealthResult.success) {
      return stealthResult;
    }

    return {
      success: false,
      error: 'All location selection methods failed',
      lastUrl: page.url()
    };
  }

  // Method 4: Analyze the page to understand what's preventing progression
  async analyzePage(page) {
    return await page.evaluate(() => {
      const analysis = {
        currentUrl: window.location.href,
        title: document.title,
        hasLocationSelection: !!document.querySelector('#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb .QflowObjectItem'),
        hasAppointments: !!document.querySelector('.appointment-slot, .time-slot, [data-time]'),
        hiddenFieldValue: '',
        submitButtons: [],
        formData: {},
        errors: []
      };

      // Check hidden field value
      const hiddenField = document.querySelector('#StepControls_0__Model_Value');
      if (hiddenField) {
        analysis.hiddenFieldValue = hiddenField.value;
      }

      // Find all submit buttons
      const buttons = document.querySelectorAll('button, input[type="submit"]');
      buttons.forEach((btn, index) => {
        analysis.submitButtons.push({
          index,
          text: btn.textContent?.trim() || btn.value || '',
          type: btn.type || 'button',
          disabled: btn.disabled,
          visible: btn.offsetParent !== null
        });
      });

      // Check for form data
      const forms = document.querySelectorAll('form');
      forms.forEach((form, index) => {
        const formData = new FormData(form);
        analysis.formData[`form_${index}`] = {};
        for (let [key, value] of formData.entries()) {
          analysis.formData[`form_${index}`][key] = value;
        }
      });

      // Look for error messages
      const errorElements = document.querySelectorAll('.error, .alert-danger, .validation-error');
      errorElements.forEach(el => {
        if (el.textContent.trim()) {
          analysis.errors.push(el.textContent.trim());
        }
      });

      return analysis;
    });
  }
}

// INTEGRATION: Enhanced location selection for your existing scraper
async function enhancedLocationSelection(page, locations) {
  console.log('🚀 Starting Enhanced Location Selection...');

  const selector = new RMVLocationAutoSelector();
  const results = [];

  // Test first location to find working method
  const testLocation = locations[0];
  console.log(`🧪 Testing selection methods on: ${testLocation.name}`);

  const testResult = await selector.completeLocationSelection(page, testLocation);

  if (testResult.success) {
    console.log(`🎉 Found working method: ${testResult.method}`);

    // Apply successful method to all locations
    for (const location of locations.slice(0, 5)) { // Test first 5 locations
      console.log(`\n📍 Processing ${location.name}...`);

      let locationResult;

      if (testResult.method === 'url_parameter') {
        // Use the working URL pattern
        const workingUrl = testResult.workingUrl.replace(testLocation.id, location.id);
        await page.goto(workingUrl, { waitUntil: 'networkidle0' });

        // Verify success
        const hasAppointments = await page.$('.appointment-slot, .time-slot, [data-time]');
        locationResult = {
          locationId: location.id,
          locationName: location.name,
          success: !!hasAppointments,
          method: 'url_parameter',
          workingUrl: workingUrl
        };

      } else if (testResult.method === 'stealth_click' || testResult.method === 'submit_button') {
        // Use stealth selection for each location
        locationResult = await selector.completeLocationSelection(page, location);
      }

      if (locationResult.success) {
        // Scrape appointments
        const appointments = await page.evaluate(() => {
          const slots = [];
          const elements = document.querySelectorAll('.appointment-slot, .time-slot, [data-time]');
          elements.forEach(el => {
            if (el.textContent.trim() && !el.classList.contains('disabled')) {
              slots.push({
                text: el.textContent.trim(),
                date: el.getAttribute('data-date'),
                time: el.getAttribute('data-time')
              });
            }
          });
          return slots;
        });

        locationResult.appointments = appointments;
        locationResult.appointmentCount = appointments.length;

        console.log(`   ✅ Found ${appointments.length} appointments`);
      }

      results.push(locationResult);

      // Delay between locations
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

  } else {
    console.log('❌ No working selection method found');

    // Analyze the page to understand the issue
    const pageAnalysis = await selector.analyzePage(page);
    console.log('Page Analysis:', pageAnalysis);

    return { success: false, analysis: pageAnalysis };
  }

  const successful = results.filter(r => r.success);
  const withAppointments = successful.filter(r => r.appointmentCount > 0);

  console.log(`\n📊 RESULTS SUMMARY:`);
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`📅 With appointments: ${withAppointments.length}/${successful.length}`);

  if (withAppointments.length > 0) {
    console.log(`\n🎯 LOCATIONS WITH APPOINTMENTS:`);
    withAppointments.forEach(loc => {
      console.log(`   📍 ${loc.locationName}: ${loc.appointmentCount} slots`);
    });
  }

  return { success: true, results, workingMethod: testResult.method };
}

module.exports = { RMVLocationAutoSelector, enhancedLocationSelection };