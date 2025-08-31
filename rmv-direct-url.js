// RMV Direct URL Construction - Advanced Implementation
// Handles proper gzip decompression and session state injection

const pako = require('pako'); // For gzip compression/decompression
const { URLSearchParams } = require('url');

class RMVDirectUrlGenerator {
  constructor() {
    this.baseUrl = 'https://rmvmassdotappt.cxmflow.com/Appointment/Index/2c052fc7-571f-4b76-9790-7e91f103c408';
    this.accessToken = 'cd490506-57d2-44f0-a546-7499978c89bb';
  }

  // Decode the compressed formJourney data
  async decodeFormJourney(encodedFormJourney) {
    try {
      console.log('🔓 Decoding compressed formJourney data...');
      
      // Remove URL encoding
      const urlDecoded = decodeURIComponent(encodedFormJourney);

      // Convert base64 to binary
      const binaryString = Buffer.from(urlDecoded, 'base64').toString('binary');
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decompress gzip
      const decompressed = pako.inflate(bytes, { to: 'string' });
      console.log(`✅ Successfully decompressed formJourney (${decompressed.length} chars)`);

      // Parse JSON
      const jsonData = JSON.parse(decompressed);
      console.log(`✅ Parsed formJourney with keys: ${Object.keys(jsonData).join(', ')}`);
      
      return jsonData;
    } catch (error) {
      console.error('❌ Failed to decode formJourney:', error.message);
      throw error;
    }
  }

  // Encode the modified formJourney data
  async encodeFormJourney(journeyData) {
    try {
      console.log('🔒 Encoding modified formJourney data...');
      
      // Convert to JSON string
      const jsonString = JSON.stringify(journeyData);

      // Compress with gzip
      const compressed = pako.deflate(jsonString);

      // Convert to base64
      const base64 = Buffer.from(compressed).toString('base64');

      // URL encode
      const encoded = encodeURIComponent(base64);
      console.log(`✅ Successfully encoded formJourney (${encoded.length} chars)`);
      
      return encoded;
    } catch (error) {
      console.error('❌ Failed to encode formJourney:', error.message);
      throw error;
    }
  }

  // Inject location selection into the journey data
  async injectLocationSelection(journeyData, locationId) {
    try {
      console.log(`🎯 Injecting location selection: ${locationId}`);
      
      // Clone the journey data to avoid mutation
      const modifiedJourney = JSON.parse(JSON.stringify(journeyData));

      // Look for step controls or location selection in the data
      if (modifiedJourney.StepControls) {
        console.log(`Found ${modifiedJourney.StepControls.length} existing step controls`);
        
        // Find the location selection step (usually step 0)
        const locationStep = modifiedJourney.StepControls.find(step =>
          step.Model && (step.Model.Value !== undefined || step.Model.value !== undefined)
        );

        if (locationStep) {
          console.log('✅ Found existing location step, updating...');
          locationStep.Model.Value = locationId.toString();
          locationStep.Model.value = locationId.toString();
        } else {
          console.log('➕ Creating new location selection step...');
          // Create location selection step if it doesn't exist
          modifiedJourney.StepControls.push({
            Model: {
              Value: locationId.toString(),
              value: locationId.toString()
            },
            StepIndex: 0
          });
        }
      } else {
        console.log('➕ Creating StepControls structure...');
        // Create StepControls if it doesn't exist
        modifiedJourney.StepControls = [{
          Model: {
            Value: locationId.toString(),
            value: locationId.toString()
          },
          StepIndex: 0
        }];
      }

      // Update current step to indicate location has been selected
      if (modifiedJourney.CurrentStep !== undefined) {
        modifiedJourney.CurrentStep = Math.max(modifiedJourney.CurrentStep, 1);
        console.log(`✅ Updated CurrentStep to: ${modifiedJourney.CurrentStep}`);
      } else {
        modifiedJourney.CurrentStep = 1;
        console.log('✅ Set CurrentStep to: 1');
      }

      // Mark location as selected in any selection flags
      if (modifiedJourney.SelectionMade !== undefined) {
        modifiedJourney.SelectionMade = true;
        console.log('✅ Set SelectionMade to: true');
      }

      console.log('✅ Successfully injected location selection');
      return modifiedJourney;
    } catch (error) {
      console.error('❌ Failed to inject location selection:', error.message);
      throw error;
    }
  }

  // Generate direct appointment URL for a specific location
  async generateLocationAppointmentUrl(locationData, originalFormJourney) {
    try {
      console.log(`🚀 Generating direct URL for ${locationData.name} (ID: ${locationData.id})`);

      // Decode the original form journey
      const decodedJourney = await this.decodeFormJourney(originalFormJourney);

      // Inject the location selection
      const modifiedJourney = await this.injectLocationSelection(decodedJourney, locationData.id);

      // Encode the modified journey
      const encodedJourney = await this.encodeFormJourney(modifiedJourney);

      // Construct the direct URL
      const params = new URLSearchParams({
        AccessToken: this.accessToken,
        formJourney: encodedJourney,
        locationId: locationData.id.toString(),
        step: '1' // Skip to appointment selection step
      });

      const directUrl = `${this.baseUrl}?${params.toString()}`;
      console.log(`✅ Generated direct URL for ${locationData.name}`);

      return {
        locationId: locationData.id,
        locationName: locationData.name,
        directUrl: directUrl,
        encodedFormJourney: encodedJourney,
        success: true
      };

    } catch (error) {
      console.error(`❌ Failed to generate URL for ${locationData.name}:`, error.message);
      return {
        locationId: locationData.id,
        locationName: locationData.name,
        directUrl: null,
        error: error.message,
        success: false
      };
    }
  }

  // Generate direct URLs for all locations
  async generateAllLocationUrls(locations, originalFormJourney) {
    console.log(`🎯 Generating direct URLs for ${locations.length} locations...`);

    const results = [];

    for (const location of locations) {
      const result = await this.generateLocationAppointmentUrl(location, originalFormJourney);
      results.push(result);

      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Successfully generated ${successful.length} direct URLs`);
    if (failed.length > 0) {
      console.log(`❌ Failed to generate ${failed.length} URLs`);
      failed.forEach(f => console.log(`   - ${f.locationName}: ${f.error}`));
    }

    return results;
  }
}

// Enhanced scraper that uses direct URLs
class DirectUrlScraper {
  constructor() {
    this.urlGenerator = new RMVDirectUrlGenerator();
  }

  // Test enhanced URL patterns with auto-location selection
  async testEnhancedPatterns(page, location) {
    const baseUrl = 'https://rmvmassdotappt.cxmflow.com/Appointment/Index/2c052fc7-571f-4b76-9790-7e91f103c408';
    const accessToken = 'cd490506-57d2-44f0-a546-7499978c89bb';
    
    // Enhanced patterns with auto-progression parameters
    const patterns = [
      // Original patterns
      `${baseUrl}?AccessToken=${accessToken}&locationId=${location.id}`,
      `${baseUrl}?AccessToken=${accessToken}&StepControls_0__Model_Value=${location.id}&step=2`,
      `${baseUrl}?AccessToken=${accessToken}&StepControls_0__Model_Value=${location.id}&CurrentStep=1`,
      
      // Advanced progression patterns
      `${baseUrl}?AccessToken=${accessToken}&StepControls_0__Model_Value=${location.id}&NextStep=true`,
      `${baseUrl}?AccessToken=${accessToken}&locationId=${location.id}&StepControls_0__Model_Value=${location.id}&step=2`,
      `${baseUrl}?AccessToken=${accessToken}&locationId=${location.id}&StepControls_0__Model_Value=${location.id}&NextStep=true&CurrentStep=1`,
      `${baseUrl}?AccessToken=${accessToken}&StepControls_0__Model_Value=${location.id}&office=${encodeURIComponent(location.name)}&step=appointment`
    ];

    for (const url of patterns) {
      console.log(`Testing enhanced pattern: ${url}`);
      try {
        const response = await page.goto(url, { timeout: 15000 });
        console.log(`Response: HTTP ${response.status()}`);

        if (response.ok()) {
          // Wait for page to settle
          await page.waitForTimeout(2000);
          
          // Check if we reached appointment page directly
          const hasAppointments = await page.$('.appointment-slot, .time-slot, [data-time]');
          if (hasAppointments) {
            console.log('✅ Simple pattern worked directly!');
            return { success: true, workingUrl: url };
          }
          
          // Check if there's a continue/submit button to proceed
          const buttons = await page.$$('button, input[type="submit"]');
          for (const button of buttons) {
            const text = await button.evaluate(el => el.textContent?.toLowerCase().trim() || '');
            if (text.includes('continue') || text.includes('next') || text.includes('submit')) {
              console.log(`🔄 Found button with text "${text}", clicking to proceed...`);
              await button.click();
              await page.waitForTimeout(3000);
              
              // Check again for appointments after clicking
              const hasAppointmentsAfterClick = await page.$('.appointment-slot, .time-slot, [data-time]');
              if (hasAppointmentsAfterClick) {
                console.log('✅ Simple pattern worked after continue click!');
                return { success: true, workingUrl: url };
              }
              break;
            }
          }
        }
      } catch (error) {
        console.log(`Pattern failed: ${error.message}`);
      }
    }

    return { success: false };
  }

  // Stealth location clicking with anti-detection measures
  async stealthLocationClick(page, location) {
    try {
      console.log(`🥷 Attempting stealth location selection for ${location.name} (ID: ${location.id})`);
      
      // Add human-like randomization
      await page.waitForTimeout(1000 + Math.random() * 2000);
      
      // PRECISE RMV LOCATION SELECTOR: Based on actual locations-page.html
      const rmvLocationSelectors = [
        // Primary: Exact RMV container selectors with data-id
        `#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb .QflowObjectItem[data-id="${location.id}"]`,
        `#539af26b-8d29-4bcc-9d48-a68591c638ce .QflowObjectItem[data-id="${location.id}"]`,
        `.ListView .QflowObjectItem[data-id="${location.id}"]`,
        
        // Secondary: Generic QflowObjectItem patterns
        `.QflowObjectItem[data-id="${location.id}"]`,
        `button.QflowObjectItem[data-id="${location.id}"]`,
        
        // Fallback: Any button with matching data-id
        `button[data-id="${location.id}"]`,
        `[data-id="${location.id}"]`
      ];
      
      let locationElement = null;
      for (const selector of rmvLocationSelectors) {
        locationElement = await page.$(selector);
        if (locationElement) {
          console.log(`✅ Found location element with RMV selector: ${selector}`);
          break;
        }
      }
      
      // Enhanced fallback: find by text content with RMV-specific containers
      if (!locationElement) {
        console.log('🔍 Searching for location by text content in RMV containers...');
        locationElement = await page.evaluateHandle((locationName, locationId) => {
          // Search in known RMV containers first
          const rmvContainers = [
            '#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb',
            '#539af26b-8d29-4bcc-9d48-a68591c638ce',
            '.ListView'
          ];
          
          for (const containerId of rmvContainers) {
            const container = document.querySelector(containerId);
            if (container) {
              const buttons = container.querySelectorAll('.QflowObjectItem, button[data-id]');
              for (const button of buttons) {
                const buttonText = button.textContent?.toLowerCase() || '';
                const buttonDataId = button.getAttribute('data-id');
                
                // Match by name or data-id
                if ((buttonText.includes(locationName.toLowerCase()) || buttonDataId === locationId.toString()) && 
                    button.classList.contains('QflowObjectItem')) {
                  return button;
                }
              }
            }
          }
          
          // Global fallback
          const allButtons = document.querySelectorAll('.QflowObjectItem, button[data-id], .location-item');
          for (const button of allButtons) {
            const buttonText = button.textContent?.toLowerCase() || '';
            const buttonDataId = button.getAttribute('data-id');
            
            if (buttonText.includes(locationName.toLowerCase()) || buttonDataId === locationId.toString()) {
              return button;
            }
          }
          
          return null;
        }, location.name, location.id);
        
        if (await locationElement.evaluate(el => el === null)) {
          locationElement = null;
        }
      }
      
      if (locationElement) {
        // Human-like mouse movement
        const box = await locationElement.boundingBox();
        if (box) {
          // Random point within the element
          const x = box.x + (box.width * (0.3 + Math.random() * 0.4));
          const y = box.y + (box.height * (0.3 + Math.random() * 0.4));
          
          // Move mouse naturally
          await page.mouse.move(x - 10, y - 10);
          await page.waitForTimeout(100 + Math.random() * 200);
          await page.mouse.move(x, y);
          await page.waitForTimeout(50 + Math.random() * 100);
        }
        
        // Click with realistic timing
        await locationElement.click();
        console.log(`🖱️ Clicked location: ${location.name}`);
        
        // Wait for page response
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        // PRECISE RMV APPOINTMENT PAGE DETECTION: Based on actual attleboro-landing-page.html
        const progressedToNextStep = await page.evaluate(() => {
          // Primary: Look for exact RMV appointment elements
          const rmvAppointmentSelectors = [
            '.ServiceAppointmentDateTime',         // Main appointment slots
            '.DateTimeGrouping-Control',           // Morning/Afternoon groups
            '.DateTimeGrouping-Container',         // Container for appointment groups
            '.AppointmentDateTime',                // Alternative appointment container class
            '[data-datetime]',                     // Elements with datetime attributes
            '[data-serviceid]',                    // Elements with service ID
            '[data-appointmenttypeid]'             // Elements with appointment type ID
          ];
          
          const hasRMVAppointments = rmvAppointmentSelectors.some(sel => 
            document.querySelector(sel) !== null
          );
          
          // Secondary: Check for appointment-related text and containers
          const appointmentContainerSelectors = [
            '#fc391d57-707b-4af3-b523-3d7305ed4eac',  // Specific appointment container ID
            '.step-control-container.AppointmentDateTime', // AppointmentDateTime step container
            '.datetime-grouping'                     // Datetime grouping container
          ];
          
          const hasAppointmentContainer = appointmentContainerSelectors.some(sel => 
            document.querySelector(sel) !== null
          );
          
          // Check for appointment-related text content
          const bodyText = document.body.textContent.toLowerCase();
          const appointmentTextIndicators = [
            'select an appointment date and time',
            'please select an appointment',
            'servicepointmentdatetime',
            'morning', 'afternoon',  // Group titles
            'available',  // Available slots indicator
            'appointment'  // General appointment reference
          ];
          
          const hasAppointmentText = appointmentTextIndicators.some(indicator => 
            bodyText.includes(indicator.toLowerCase())
          );
          
          // Check if we're still on location selection (negative indicator)
          const stillOnLocationSelection = document.querySelector('#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb .QflowObjectItem') !== null ||
                                         document.querySelector('.ListView .QflowObjectItem') !== null;
          
          // Count actual appointment elements for confidence
          const appointmentElementCount = document.querySelectorAll('.ServiceAppointmentDateTime').length;
          const groupControlCount = document.querySelectorAll('.DateTimeGrouping-Control').length;
          
          return { 
            hasAppointments: hasRMVAppointments,
            hasAppointmentContainer: hasAppointmentContainer,
            hasAppointmentText: hasAppointmentText,
            stillOnLocationSelection: stillOnLocationSelection,
            appointmentElementCount: appointmentElementCount,
            groupControlCount: groupControlCount,
            progressedStep: hasRMVAppointments || hasAppointmentContainer,
            currentUrl: window.location.href,
            pageTitle: document.title
          };
        });
        
        if (progressedToNextStep.hasAppointments || progressedToNextStep.progressedStep) {
          console.log('✅ Stealth location click successful!');
          return { success: true, method: 'stealth_click', result: progressedToNextStep };
        }
      }
      
      console.log('⚠️ Could not find or click location element');
      return { success: false, error: 'Location element not found' };
      
    } catch (error) {
      console.error(`❌ Stealth clicking failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Submit button fallback mechanism
  async submitButtonFallback(page) {
    try {
      console.log('🔘 Looking for submit/continue buttons...');
      
      // Wait for any dynamic content
      await page.waitForTimeout(1500);
      
      // Find all potential submit buttons
      const submitButtons = await page.$$('button, input[type="submit"], a');
      
      for (const button of submitButtons) {
        const buttonInfo = await button.evaluate(el => ({
          text: el.textContent?.toLowerCase().trim() || '',
          type: el.type || '',
          className: el.className || '',
          id: el.id || ''
        }));
        
        // Look for submit-related text/attributes
        const isSubmitButton = 
          buttonInfo.text.includes('continue') ||
          buttonInfo.text.includes('next') ||
          buttonInfo.text.includes('submit') ||
          buttonInfo.text.includes('proceed') ||
          buttonInfo.type === 'submit' ||
          buttonInfo.className.includes('submit') ||
          buttonInfo.id.includes('submit');
          
        if (isSubmitButton) {
          console.log(`🔘 Found potential submit button: "${buttonInfo.text}" (${buttonInfo.type})`);
          
          // Human-like click
          await page.waitForTimeout(500 + Math.random() * 500);
          await button.click();
          
          // Wait for response
          await page.waitForTimeout(3000);
          
          // Check if progressed
          const hasAppointments = await page.$('.appointment-slot, .time-slot, [data-time]');
          if (hasAppointments) {
            console.log('✅ Submit button worked!');
            return { success: true, buttonText: buttonInfo.text };
          }
          
          break; // Try only the first submit button found
        }
      }
      
      console.log('⚠️ No working submit button found');
      return { success: false };
      
    } catch (error) {
      console.error(`❌ Submit button fallback failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Test a direct URL to see if it works
  async testDirectUrl(page, directUrlData) {
    try {
      console.log(`🧪 Testing direct URL for ${directUrlData.locationName}...`);

      // Navigate directly to the appointment page
      const response = await page.goto(directUrlData.directUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
      }

      // Check if we landed on an appointment selection page
      await page.waitForTimeout(2000); // Let page settle

      const currentUrl = page.url();
      console.log(`📍 Current URL: ${currentUrl}`);

      // Look for appointment-related elements or content
      const hasAppointments = await page.evaluate(() => {
        // Look for various appointment indicators
        const appointmentSelectors = [
          '.appointment-slot', '.time-slot', '.calendar-day',
          '[data-time]', '[data-date]', '.available-time',
          '.booking-slot', '.time-option', '.date-picker'
        ];

        for (const selector of appointmentSelectors) {
          if (document.querySelector(selector)) return true;
        }

        // Check for text content
        const bodyText = document.body.textContent.toLowerCase();
        const appointmentKeywords = [
          'select a time', 'available appointment', 'choose appointment',
          'time slot', 'booking time', 'schedule appointment'
        ];

        return appointmentKeywords.some(keyword => bodyText.includes(keyword));
      });

      // Check if we're still on location selection (URL construction failed)
      const stillOnLocationSelection = await page.evaluate(() => {
        return document.querySelector('#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb .QflowObjectItem') !== null;
      });

      if (stillOnLocationSelection) {
        console.log('⚠️ Still on location selection page - URL construction failed');
        return {
          success: false,
          error: 'Still on location selection page - URL construction failed',
          currentUrl,
          hasAppointments: false
        };
      }

      if (hasAppointments) {
        console.log('✅ Successfully reached appointment selection page');
        return {
          success: true,
          message: 'Successfully reached appointment selection page',
          currentUrl,
          hasAppointments: true
        };
      } else {
        // Check if we need to click a "continue" or "resubmit" button
        const continueButton = await page.$('button:contains("Continue"), button:contains("Resubmit"), input[type="submit"]');
        if (continueButton) {
          console.log('🔄 Found continue/resubmit button, clicking...');
          await continueButton.click();
          await page.waitForTimeout(3000);

          const hasAppointmentsAfterClick = await page.evaluate(() => {
            const selectors = ['.appointment-slot', '.time-slot', '.calendar-day'];
            return selectors.some(sel => document.querySelector(sel));
          });

          return {
            success: hasAppointmentsAfterClick,
            message: hasAppointmentsAfterClick ? 'Reached appointments after clicking continue' : 'No appointments found after continue',
            currentUrl: page.url(),
            hasAppointments: hasAppointmentsAfterClick
          };
        }

        console.log('⚠️ No appointment elements found and no continue button');
        return {
          success: false,
          error: 'No appointment elements found and no continue button',
          currentUrl,
          hasAppointments: false
        };
      }

    } catch (error) {
      console.error(`❌ Direct URL test failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        currentUrl: page.url()
      };
    }
  }

  // Comprehensive location selection using three-pronged approach
  async comprehensiveLocationSelection(page, location) {
    console.log(`🎯 Starting comprehensive location selection for ${location.name} (ID: ${location.id})`);
    
    // Phase 1: Enhanced URL Parameters
    console.log('📡 Phase 1: Testing enhanced URL parameters...');
    const urlResult = await this.testEnhancedPatterns(page, location);
    if (urlResult.success) {
      console.log('✅ URL parameters worked! Auto-selected location.');
      return { success: true, method: 'enhanced_url', workingUrl: urlResult.workingUrl };
    }
    
    // Phase 2: Stealth Location Clicking
    console.log('🥷 Phase 2: Attempting stealth location clicking...');
    const clickResult = await this.stealthLocationClick(page, location);
    if (clickResult.success) {
      console.log('✅ Stealth clicking worked! Location selected.');
      return { success: true, method: 'stealth_click', result: clickResult };
    }
    
    // Phase 3: Submit Button Fallback
    console.log('🔘 Phase 3: Trying submit button fallback...');
    const submitResult = await this.submitButtonFallback(page);
    if (submitResult.success) {
      console.log('✅ Submit button fallback worked!');
      return { success: true, method: 'submit_button', buttonText: submitResult.buttonText };
    }
    
    // All methods failed
    console.log('❌ All three approaches failed for location selection');
    return { 
      success: false, 
      error: 'All location selection methods failed',
      attempts: { urlResult, clickResult, submitResult }
    };
  }

  // Scrape appointments from a location using comprehensive approach
  async scrapeFromDirectUrl(page, directUrlData) {
    // Use comprehensive location selection
    console.log(`🚀 Starting comprehensive scraping for ${directUrlData.locationName}...`);
    
    const selectionResult = await this.comprehensiveLocationSelection(page, {
      id: directUrlData.locationId,
      name: directUrlData.locationName
    });

    let testResult = selectionResult;

    if (!testResult.success) {
      return {
        locationId: directUrlData.locationId,
        locationName: directUrlData.locationName,
        scrapedAt: new Date(),
        availableSlots: [],
        totalSlots: 0,
        error: testResult.error,
        method: simpleResult.success ? 'simple_pattern' : 'direct_url'
      };
    }

    // Extract appointment slots
    const availableSlots = await page.evaluate(() => {
      const slots = [];

      // Comprehensive selectors for appointment times
      const selectors = [
        '.appointment-slot', '.time-slot', '.available-time', '.calendar-day.available',
        '[data-time]', '[data-date]', '.booking-slot', '.time-option',
        '.appointment-time', '.available-slot', '.time-button:not(.disabled)',
        // More generic selectors
        'button[data-time]', 'div[data-time]', 'span[data-time]',
        '.calendar-slot:not(.disabled)', '.time-picker-option'
      ];

      const allElements = document.querySelectorAll(selectors.join(','));

      allElements.forEach(element => {
        const timeText = element.textContent.trim();
        const dateAttr = element.getAttribute('data-date');
        const timeAttr = element.getAttribute('data-time');
        const isDisabled = element.classList.contains('disabled') || element.disabled;

        if (timeText && !isDisabled && timeText.length > 0) {
          // Extract date and time from various formats
          const dateMatch = timeText.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
          const timeMatch = timeText.match(/(\d{1,2}:\d{2}\s?(AM|PM|am|pm))/);

          slots.push({
            displayText: timeText,
            date: dateAttr || (dateMatch ? dateMatch[1] : null),
            time: timeAttr || (timeMatch ? timeMatch[1] : null),
            available: !isDisabled,
            element: element.tagName.toLowerCase(),
            classes: element.className
          });
        }
      });

      return slots;
    });

    console.log(`✅ Found ${availableSlots.length} appointment slots for ${directUrlData.locationName}`);

    return {
      locationId: directUrlData.locationId,
      locationName: directUrlData.locationName,
      scrapedAt: new Date(),
      availableSlots: availableSlots,
      totalSlots: availableSlots.length,
      method: simpleResult.success ? 'simple_pattern' : 'direct_url',
      testResult: testResult
    };
  }
}

// Enhanced integration function using comprehensive location selection
async function enhanceScraperWithDirectUrls(page, locations, originalFormJourney) {
  const scraper = new DirectUrlScraper();

  console.log('🚀 Starting comprehensive location selection and appointment scraping...');
  console.log(`📊 Processing ${locations.length} locations with three-pronged approach`);

  const results = [];

  for (const location of locations) {
    console.log(`\n📍 Processing ${location.name} (ID: ${location.id})...`);

    try {
      // Use comprehensive location selection instead of complex formJourney manipulation
      const selectionResult = await scraper.comprehensiveLocationSelection(page, location);
      
      if (selectionResult.success) {
        console.log(`✅ Location selected successfully using method: ${selectionResult.method}`);
        
        // PRECISE RMV APPOINTMENT EXTRACTION: Based on actual attleboro-landing-page.html
        const availableSlots = await page.evaluate(() => {
          const slots = [];
          
          // Primary method: Extract from ServiceAppointmentDateTime elements (from actual appointment page)
          const appointmentElements = document.querySelectorAll('.ServiceAppointmentDateTime');
          console.log(`Found ${appointmentElements.length} ServiceAppointmentDateTime elements`);
          
          appointmentElements.forEach(element => {
            // Extract all available data from the actual HTML structure
            const dateTimeAttr = element.getAttribute('data-datetime'); // "10/8/2025 9:30:00 AM"
            const serviceId = element.getAttribute('data-serviceid'); // "226"
            const appointmentTypeId = element.getAttribute('data-appointmenttypeid'); // "38"
            const ariaLabel = element.getAttribute('aria-label'); // "Wednesday October 8 9:30 AM"
            const timeText = element.textContent.trim(); // "9:30 AM"
            const tabindex = element.getAttribute('tabindex'); // "0" for visible, "-1" for collapsed
            const ariaChecked = element.getAttribute('aria-checked'); // "false"
            
            // Check if element is disabled or hidden
            const isDisabled = element.classList.contains('disabled') || element.disabled;
            const isValid = element.classList.contains('valid');
            const isInExpandedGroup = element.closest('.DateTimeGrouping-Container')?.classList.contains('expanded');
            
            if (dateTimeAttr && timeText && !isDisabled && isValid) {
              // Parse the datetime: "10/8/2025 9:30:00 AM"
              const dateTimeMatch = dateTimeAttr.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}:\d{2}\s?(AM|PM))/);
              let date = null, time = null;
              
              if (dateTimeMatch) {
                date = dateTimeMatch[1]; // "10/8/2025"
                time = dateTimeMatch[2].replace(':00', ''); // "9:30 AM" (remove seconds)
              }
              
              // Determine if slot is immediately available (expanded group) or requires click
              const parentGroup = element.closest('.DateTimeGrouping-Group');
              const groupControl = parentGroup?.querySelector('.DateTimeGrouping-Control');
              const groupTitle = groupControl?.querySelector('.group-title')?.textContent?.trim() || '';
              const groupCount = groupControl?.querySelector('.group-number')?.textContent?.trim() || '';
              
              slots.push({
                displayText: timeText, // "9:30 AM"
                fullDateTime: dateTimeAttr, // "10/8/2025 9:30:00 AM"
                date: date, // "10/8/2025"
                time: time, // "9:30 AM"
                available: true, // All visible ServiceAppointmentDateTime elements are available
                ariaLabel: ariaLabel, // "Wednesday October 8 9:30 AM"
                element: 'ServiceAppointmentDateTime',
                classes: element.className,
                serviceid: serviceId, // "226"
                appointmenttypeid: appointmentTypeId, // "38"
                tabindex: tabindex, // Indicates visibility state
                ariaChecked: ariaChecked,
                isInExpandedGroup: isInExpandedGroup,
                groupTitle: groupTitle, // "Morning" or "Afternoon"
                groupCount: groupCount, // "9 Available"
                selector: '.ServiceAppointmentDateTime[data-datetime="' + dateTimeAttr + '"]'
              });
            }
          });
          
          // Enhanced group information extraction with counts and expansion states
          const groupControls = document.querySelectorAll('.DateTimeGrouping-Control');
          const groupInfo = Array.from(groupControls).map(control => {
            const title = control.querySelector('.group-title')?.textContent?.trim() || '';
            const count = control.querySelector('.group-number')?.textContent?.trim() || '';
            const expanded = control.getAttribute('aria-pressed') === 'true';
            const ariaLabel = control.getAttribute('aria-label') || '';
            const controlsId = control.getAttribute('aria-controls') || '';
            const classes = control.className || '';
            
            return {
              title: title, // "Morning", "Afternoon"
              count: count, // "9 Available", "10 Available"
              expanded: expanded, // true/false
              ariaLabel: ariaLabel, // "Morning of Wednesday October 8 - Select to view 9 available times"
              controlsId: controlsId, // ID of container it controls
              classes: classes, // "DateTimeGrouping-Control Morning"
              selector: '.DateTimeGrouping-Control[aria-controls="' + controlsId + '"]'
            };
          });
          
          // Extract day column information
          const dayColumns = document.querySelectorAll('.DateTimeGrouping-Column');
          const dayInfo = Array.from(dayColumns).map(column => {
            const ariaLabel = column.getAttribute('aria-label') || '';
            const dayElement = column.querySelector('.DateTimeGrouping-Day');
            const dayText = dayElement ? dayElement.textContent.trim() : '';
            const groups = column.querySelectorAll('.DateTimeGrouping-Group').length;
            
            return {
              ariaLabel: ariaLabel, // "<p>Wed</p><p>Oct 8, 2025</p>"
              dayText: dayText, // "Wed\nOct 8, 2025"
              groupCount: groups // Number of Morning/Afternoon groups
            };
          });
          
          return { 
            slots, 
            groupInfo,
            dayInfo,
            totalElements: appointmentElements.length,
            totalDays: dayColumns.length,
            totalGroups: groupControls.length
          };
        });
        
        console.log(`📅 Found ${availableSlots.slots.length} appointment slots for ${location.name}`);
        
        // Log first 10 actual appointments with dates and times
        if (availableSlots.slots.length > 0) {
          console.log(`📋 Appointment Details (first 10):`);
          availableSlots.slots.slice(0, 10).forEach((slot, index) => {
            console.log(`   ${index + 1}. ${slot.date} at ${slot.time} (${slot.displayText})`);
          });
          if (availableSlots.slots.length > 10) {
            console.log(`   ... and ${availableSlots.slots.length - 10} more appointments`);
          }
        }
        
        // Log group information for debugging
        if (availableSlots.groupInfo.length > 0) {
          console.log(`📊 Appointment groups:`);
          availableSlots.groupInfo.forEach(group => {
            console.log(`   ${group.title}: ${group.count} (expanded: ${group.expanded})`);
          });
        }
        
        results.push({
          locationId: location.id,
          locationName: location.name,
          scrapedAt: new Date(),
          availableSlots: availableSlots.slots,
          totalSlots: availableSlots.slots.length,
          groupInfo: availableSlots.groupInfo,
          method: selectionResult.method,
          success: true
        });
        
      } else {
        console.log(`❌ Failed to select location ${location.name}: ${selectionResult.error}`);
        
        results.push({
          locationId: location.id,
          locationName: location.name,
          scrapedAt: new Date(),
          availableSlots: [],
          totalSlots: 0,
          error: selectionResult.error,
          method: 'comprehensive_failed',
          success: false
        });
      }
      
    } catch (error) {
      console.error(`❌ Error processing location ${location.name}:`, error.message);
      
      results.push({
        locationId: location.id,
        locationName: location.name,
        scrapedAt: new Date(),
        availableSlots: [],
        totalSlots: 0,
        error: error.message,
        method: 'error',
        success: false
      });
    }

    // Add delay between locations to be respectful
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n🎯 Comprehensive scraping completed:`);
  console.log(`   ✅ Successfully processed: ${successful.length} locations`);
  console.log(`   ❌ Failed: ${failed.length} locations`);
  
  if (failed.length > 0) {
    console.log(`   📋 Failed locations:`);
    failed.forEach(f => console.log(`      - ${f.locationName}: ${f.error}`));
  }

  return results;
}

// Export for use in main scraper
module.exports = {
  RMVDirectUrlGenerator,
  DirectUrlScraper,
  enhanceScraperWithDirectUrls
};