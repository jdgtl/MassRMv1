// RMV Direct URL Construction - Bypass Anti-Bot Protection
// This approach constructs appointment URLs directly without UI interaction

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
      // Remove URL encoding
      const urlDecoded = decodeURIComponent(encodedFormJourney);

      // Convert base64 to binary
      const binaryString = atob(urlDecoded);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decompress gzip
      const decompressed = pako.inflate(bytes, { to: 'string' });

      // Parse JSON
      return JSON.parse(decompressed);
    } catch (error) {
      console.error('Failed to decode formJourney:', error);
      throw error;
    }
  }

  // Encode the modified formJourney data
  async encodeFormJourney(journeyData) {
    try {
      // Convert to JSON string
      const jsonString = JSON.stringify(journeyData);

      // Compress with gzip
      const compressed = pako.deflate(jsonString);

      // Convert to base64
      const base64 = btoa(String.fromCharCode.apply(null, compressed));

      // URL encode
      return encodeURIComponent(base64);
    } catch (error) {
      console.error('Failed to encode formJourney:', error);
      throw error;
    }
  }

  // Inject location selection into the journey data
  async injectLocationSelection(journeyData, locationId) {
    try {
      // Clone the journey data to avoid mutation
      const modifiedJourney = JSON.parse(JSON.stringify(journeyData));

      // Look for step controls or location selection in the data
      if (modifiedJourney.StepControls) {
        // Find the location selection step (usually step 0)
        const locationStep = modifiedJourney.StepControls.find(step =>
          step.Model && (step.Model.Value !== undefined || step.Model.value !== undefined)
        );

        if (locationStep) {
          locationStep.Model.Value = locationId.toString();
          locationStep.Model.value = locationId.toString();
        } else {
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
      } else {
        modifiedJourney.CurrentStep = 1;
      }

      // Mark location as selected in any selection flags
      if (modifiedJourney.SelectionMade !== undefined) {
        modifiedJourney.SelectionMade = true;
      }

      return modifiedJourney;
    } catch (error) {
      console.error('Failed to inject location selection:', error);
      throw error;
    }
  }

  // Generate direct appointment URL for a specific location
  async generateLocationAppointmentUrl(locationData, originalFormJourney) {
    try {
      console.log(`Generating direct URL for ${locationData.name} (ID: ${locationData.id})`);

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

      return {
        locationId: locationData.id,
        locationName: locationData.name,
        directUrl: directUrl,
        encodedFormJourney: encodedJourney,
        success: true
      };

    } catch (error) {
      console.error(`Failed to generate URL for ${locationData.name}:`, error);
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
    console.log(`Generating direct URLs for ${locations.length} locations...`);

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

  // Test a direct URL to see if it works
  async testDirectUrl(page, directUrlData) {
    try {
      console.log(`Testing direct URL for ${directUrlData.locationName}...`);

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

      const pageContent = await page.content();
      const currentUrl = page.url();

      // Look for appointment-related elements or content
      const hasAppointments = await page.evaluate(() => {
        // Look for various appointment indicators
        const appointmentSelectors = [
          '.appointment-slot', '.time-slot', '.calendar-day',
          '[data-time]', '[data-date]', '.available-time',
          '.booking-slot', '.time-option', '.date-picker',
          // Text-based indicators
          'div:contains("Select a time")',
          'div:contains("Available appointments")',
          'div:contains("Choose appointment")'
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
        return {
          success: false,
          error: 'Still on location selection page - URL construction failed',
          currentUrl,
          hasAppointments: false
        };
      }

      if (hasAppointments) {
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
          console.log('Found continue/resubmit button, clicking...');
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

        return {
          success: false,
          error: 'No appointment elements found and no continue button',
          currentUrl,
          hasAppointments: false
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error.message,
        currentUrl: page.url()
      };
    }
  }

  // Scrape appointments from a direct URL
  async scrapeFromDirectUrl(page, directUrlData) {
    const testResult = await this.testDirectUrl(page, directUrlData);

    if (!testResult.success) {
      return {
        locationId: directUrlData.locationId,
        locationName: directUrlData.locationName,
        scrapedAt: new Date(),
        availableSlots: [],
        totalSlots: 0,
        error: testResult.error,
        method: 'direct_url'
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
      method: 'direct_url',
      testResult: testResult
    };
  }
}

// Integration with your existing system
async function enhanceScraperWithDirectUrls(page, locations, originalFormJourney) {
  const urlGenerator = new RMVDirectUrlGenerator();
  const scraper = new DirectUrlScraper();

  console.log('🚀 Starting direct URL generation and testing...');

  // Generate direct URLs for all locations
  const directUrls = await urlGenerator.generateAllLocationUrls(locations, originalFormJourney);

  // Test and scrape from direct URLs
  const results = [];

  for (const directUrlData of directUrls.filter(u => u.success)) {
    console.log(`\n📍 Testing ${directUrlData.locationName}...`);

    const scrapeResult = await scraper.scrapeFromDirectUrl(page, directUrlData);
    results.push(scrapeResult);

    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return results;
}

// Export for use in your main scraper
module.exports = {
  RMVDirectUrlGenerator,
  DirectUrlScraper,
  enhanceScraperWithDirectUrls
};

// Usage example:
/*
// In your main scraper file:
const { enhanceScraperWithDirectUrls } = require('./rmv-direct-url');

async function runDirectUrlScraper() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Get initial data (your existing code)
  const { locations, formJourney } = await extractInitialData(page);

  // Use direct URL approach
  const results = await enhanceScraperWithDirectUrls(page, locations, formJourney);

  console.log('Scraping results:', results);

  await browser.close();
}
*/