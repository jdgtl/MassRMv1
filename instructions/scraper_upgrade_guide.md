# RMV Appointment Scraper - Implementation Guide for Claude Code

## Overview
This guide outlines how to enhance your web application to automatically scrape Massachusetts RMV appointment availability across all locations and track appointment openings over time.

## System Architecture

### Core Components
1. **Location Data Extractor** - Extract all available RMV locations from the initial page
2. **Session State Manager** - Handle the formJourney session data preservation
3. **Page URL Generator** - Create resubmit URLs for each location's appointment page
4. **Appointment Scheduler** - Refresh location data every 30 minutes
5. **Database Logger** - Store appointment availability data with timestamps

## Implementation Steps

### 1. Initial Location Data Extraction

```javascript
// Extract location data from the main appointment page
async function extractLocationData(page) {
  await page.goto('https://rmvmassdotappt.cxmflow.com/Appointment/Index/2c052fc7-571f-4b76-9790-7e91f103c408?AccessToken=cd490506-57d2-44f0-a546-7499978c89bb');

  // Wait for location data to load
  await page.waitForSelector('#f61577d6-d75d-41c5-a6ab-f7a261ba5cfb .QflowObjectItem');

  // Extract all location data from the displayData array
  const locations = await page.evaluate(() => {
    return window.displayData.map(location => ({
      id: location.Id,
      name: location.Name,
      address: location.Address,
      latitude: location.Latitude,
      longitude: location.Longitude,
      workingHours: location.InfoPageWorkingHours || 'Standard hours',
      extRef: location.ExtRef
    }));
  });

  return locations;
}
```

### 2. Session State Management

```javascript
// Capture and preserve the formJourney session data
async function captureSessionData(page) {
  const sessionData = await page.evaluate(() => {
    return {
      formJourney: sessionStorage.getItem('formJourney'),
      cookies: document.cookie,
      currentUrl: window.location.href
    };
  });

  return sessionData;
}

// Restore session data when needed
async function restoreSessionData(page, sessionData) {
  await page.evaluate((data) => {
    sessionStorage.setItem('formJourney', data.formJourney);
  }, sessionData);
}
```

### 3. Location-Specific URL Generation

```javascript
// Generate appointment page URL for each location
async function generateLocationUrls(page, locations, baseSessionData) {
  const locationUrls = [];

  for (const location of locations) {
    // Select the location
    await page.click(`[data-id="${location.id}"]`);

    // Wait for selection to be processed
    await page.waitForFunction((locationId) => {
      return document.querySelector('#StepControls_0__Model_Value').value === locationId.toString();
    }, location.id);

    // Submit form to get to appointment page
    await page.click('button[type="submit"]');

    // Wait for navigation or resubmit dialog
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    // Capture the URL that shows appointment times
    const appointmentUrl = page.url();
    const updatedSessionData = await captureSessionData(page);

    locationUrls.push({
      locationId: location.id,
      locationName: location.name,
      appointmentUrl: appointmentUrl,
      sessionData: updatedSessionData,
      lastChecked: new Date(),
      availableSlots: []
    });

    // Navigate back to location selection for next iteration
    await page.goto(baseUrl);
    await restoreSessionData(page, baseSessionData);
  }

  return locationUrls;
}
```

### 4. Appointment Availability Scraper

```javascript
// Scrape available appointment times for a specific location
async function scrapeLocationAppointments(page, locationData) {
  try {
    // Navigate to the location's appointment page
    await page.goto(locationData.appointmentUrl);
    await restoreSessionData(page, locationData.sessionData);

    // Handle resubmit dialog if present
    const resubmitButton = await page.$('button:contains("Resubmit"), input[type="submit"]');
    if (resubmitButton) {
      await resubmitButton.click();
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
    }

    // Wait for appointment calendar/times to load
    await page.waitForSelector('.appointment-slot, .time-slot, .available-time', { timeout: 10000 });

    // Extract available appointment slots
    const availableSlots = await page.evaluate(() => {
      const slots = [];

      // Look for various possible selectors for appointment times
      const timeElements = document.querySelectorAll([
        '.appointment-slot',
        '.time-slot',
        '.available-time',
        '[data-time]',
        '.calendar-slot.available'
      ].join(','));

      timeElements.forEach(element => {
        const timeText = element.textContent.trim();
        const dateAttr = element.getAttribute('data-date');
        const timeAttr = element.getAttribute('data-time');

        if (timeText && !element.classList.contains('disabled')) {
          slots.push({
            displayText: timeText,
            date: dateAttr || extractDateFromText(timeText),
            time: timeAttr || extractTimeFromText(timeText),
            available: !element.classList.contains('unavailable')
          });
        }
      });

      return slots;
    });

    return {
      locationId: locationData.locationId,
      locationName: locationData.locationName,
      scrapedAt: new Date(),
      availableSlots: availableSlots,
      totalSlots: availableSlots.length
    };

  } catch (error) {
    console.error(`Error scraping ${locationData.locationName}:`, error);
    return {
      locationId: locationData.locationId,
      locationName: locationData.locationName,
      scrapedAt: new Date(),
      availableSlots: [],
      totalSlots: 0,
      error: error.message
    };
  }
}
```

### 5. Database Schema

```sql
-- Locations table
CREATE TABLE rmv_locations (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  working_hours TEXT,
  appointment_url TEXT,
  session_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Appointment availability logs
CREATE TABLE appointment_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER,
  scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  available_slots JSON,
  total_slots INTEGER,
  error_message TEXT,
  FOREIGN KEY (location_id) REFERENCES rmv_locations(id)
);

-- Individual appointment slots for easier querying
CREATE TABLE appointment_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER,
  scraped_at TIMESTAMP,
  appointment_date DATE,
  appointment_time TIME,
  display_text VARCHAR(100),
  is_available BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (location_id) REFERENCES rmv_locations(id)
);
```

### 6. Scheduler Implementation

```javascript
// Main scheduler function to run every 30 minutes
class RMVAppointmentMonitor {
  constructor(database) {
    this.db = database;
    this.locations = [];
    this.isRunning = false;
  }

  async initialize() {
    // Load locations from database or scrape initial data
    this.locations = await this.db.getLocations();

    if (this.locations.length === 0) {
      await this.performInitialScrape();
    }
  }

  async performInitialScrape() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    try {
      // Extract all location data
      const locationData = await extractLocationData(page);
      const baseSessionData = await captureSessionData(page);

      // Generate appointment URLs for each location
      const locationUrls = await generateLocationUrls(page, locationData, baseSessionData);

      // Store in database
      for (const location of locationUrls) {
        await this.db.insertLocation(location);
      }

      this.locations = locationUrls;

    } finally {
      await browser.close();
    }
  }

  async startMonitoring() {
    this.isRunning = true;
    console.log('Starting RMV appointment monitoring...');

    // Run immediately, then every 30 minutes
    await this.scrapeAllLocations();

    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.scrapeAllLocations();
      }
    }, 30 * 60 * 1000); // 30 minutes
  }

  async scrapeAllLocations() {
    const browser = await puppeteer.launch({ headless: true });
    const promises = [];

    // Process locations in batches to avoid overwhelming the server
    const batchSize = 3;
    for (let i = 0; i < this.locations.length; i += batchSize) {
      const batch = this.locations.slice(i, i + batchSize);

      for (const location of batch) {
        promises.push(this.scrapeLocationWithRetry(browser, location));
      }

      // Wait for batch to complete before starting next batch
      await Promise.allSettled(promises);
      promises.length = 0;

      // Add delay between batches
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    await browser.close();
    console.log(`Completed scraping ${this.locations.length} locations at ${new Date()}`);
  }

  async scrapeLocationWithRetry(browser, locationData, maxRetries = 3) {
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const page = await browser.newPage();
        const result = await scrapeLocationAppointments(page, locationData);
        await page.close();

        // Store results in database
        await this.db.logAppointmentAvailability(result);

        return result;

      } catch (error) {
        attempt++;
        console.error(`Attempt ${attempt} failed for ${locationData.locationName}:`, error);

        if (attempt >= maxRetries) {
          // Log the failure
          await this.db.logAppointmentAvailability({
            locationId: locationData.locationId,
            locationName: locationData.locationName,
            scrapedAt: new Date(),
            availableSlots: [],
            totalSlots: 0,
            error: error.message
          });
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }
  }

  stopMonitoring() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}
```

### 7. Database Interface

```javascript
class RMVDatabase {
  constructor(dbPath) {
    this.db = new Database(dbPath);
  }

  async insertLocation(locationData) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO rmv_locations
      (id, name, address, latitude, longitude, working_hours, appointment_url, session_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      locationData.locationId,
      locationData.locationName,
      locationData.address || '',
      locationData.latitude || null,
      locationData.longitude || null,
      locationData.workingHours || '',
      locationData.appointmentUrl,
      JSON.stringify(locationData.sessionData)
    );
  }

  async logAppointmentAvailability(scraperResult) {
    // Insert main availability record
    const stmt = this.db.prepare(`
      INSERT INTO appointment_availability
      (location_id, scraped_at, available_slots, total_slots, error_message)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      scraperResult.locationId,
      scraperResult.scrapedAt.toISOString(),
      JSON.stringify(scraperResult.availableSlots),
      scraperResult.totalSlots,
      scraperResult.error || null
    );

    // Insert individual slots for easier querying
    if (scraperResult.availableSlots && scraperResult.availableSlots.length > 0) {
      const slotStmt = this.db.prepare(`
        INSERT INTO appointment_slots
        (location_id, scraped_at, appointment_date, appointment_time, display_text, is_available)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const slot of scraperResult.availableSlots) {
        slotStmt.run(
          scraperResult.locationId,
          scraperResult.scrapedAt.toISOString(),
          slot.date,
          slot.time,
          slot.displayText,
          slot.available
        );
      }
    }
  }

  async getLocations() {
    const stmt = this.db.prepare('SELECT * FROM rmv_locations');
    return stmt.all();
  }

  async getRecentAvailability(locationId, hours = 24) {
    const stmt = this.db.prepare(`
      SELECT * FROM appointment_availability
      WHERE location_id = ? AND scraped_at > datetime('now', '-${hours} hours')
      ORDER BY scraped_at DESC
    `);
    return stmt.all(locationId);
  }
}
```

### 8. Usage Example

```javascript
// Initialize and start monitoring
async function startRMVMonitoring() {
  const db = new RMVDatabase('./rmv_appointments.db');
  const monitor = new RMVAppointmentMonitor(db);

  await monitor.initialize();
  await monitor.startMonitoring();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down RMV monitoring...');
    monitor.stopMonitoring();
    process.exit(0);
  });
}

startRMVMonitoring();
```

## Key Considerations

### Rate Limiting & Ethics
- **Respect Server Load**: Use delays between requests (5+ seconds)
- **Batch Processing**: Process locations in small batches
- **User Agent**: Use realistic browser headers
- **Error Handling**: Implement proper retry logic with exponential backoff

### Session Management
- **formJourney Preservation**: Critical for maintaining appointment flow state
- **Cookie Handling**: Store and restore session cookies appropriately
- **URL Generation**: Each location needs its own resubmit URL with proper session data

### Data Analysis Opportunities
Once you have this data flowing, you can:
- **Trend Analysis**: Track appointment availability patterns by location and time
- **Alert System**: Notify when appointments become available at preferred locations
- **Optimization**: Identify best times to check for new appointments
- **Reporting**: Generate availability reports for different RMV services

### Deployment
- **Containerization**: Use Docker for consistent deployment
- **Cloud Scheduling**: Deploy on cloud platforms with cron-like scheduling
- **Monitoring**: Add health checks and alerting for the scraper itself
- **Scaling**: Consider running multiple instances for different geographic regions

This implementation provides a robust foundation for tracking RMV appointment availability across all Massachusetts locations, with proper error handling, data persistence, and scheduling capabilities.