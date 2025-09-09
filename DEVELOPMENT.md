# RMV Appointment Monitor - Development Guide

## 🆕 Latest Updates (September 6, 2025)

### Dynamic Location Discovery System
- **New API**: `/api/discover-locations` - Extracts locations from RMV URLs
- **Frontend Integration**: `discoverLocationsFromUrl()` with event listeners on RMV URL field
- **Regional Mapping**: `updateRegionalMappings()` with coordinate-based + name-based assignment
- **Smart UI Updates**: Real-time regional button updates with discovered location sets

### Regional Button Improvements  
- **Region Replacement Logic**: Prevents 8+ location errors with clean selection switching
- **Islands Fix**: Priority-based assignment ensures Martha's Vineyard & Nantucket → Islands region
- **Geographic Intelligence**: Coordinate boundaries for all 6 Massachusetts regions

### Codebase Cleanup
- **71% File Reduction**: Removed 35+ unnecessary files (test files, deployment configs, backups)
- **Essential Files Only**: 14 core files remain for production functionality
- **Git Safety**: All cleanup committed with rollback capability

## 🔄 Git Workflow (CRITICAL)

**ALWAYS commit changes after significant modifications to prevent loss of working code!**

### Required Git Practices:

1. **After every major feature/fix:**
   ```bash
   git add .
   git commit -m "descriptive message with Claude Code signature"
   ```

2. **Before major refactoring:**
   ```bash
   git commit -m "backup before [description]"
   ```

3. **When code is working:**
   ```bash
   git commit -m "working state - [feature description]"
   ```

## 🎨 Technical Implementation: Progressive Disclosure UI

### Section 5 Smart Overlay System
```javascript
// State management for overlay behavior
let hasEverStartedMonitoring = false; // Track if monitoring has ever been started

// Initial state - absolute positioned overlay
<div class="main-content-area" id="mainContentArea" style="position: relative; min-height: 300px;">
    <div class="start-monitoring-section" id="startMonitoringSection" 
         style="position: absolute; top: 0; left: 0; right: 0; z-index: 10; ...">
        <div style="font-size: 3rem; margin-bottom: 15px;">🚀</div>
        <h3>Ready to Start Monitoring</h3>
        <p>Once appointments are found, you can switch between calendar and list view using the buttons above</p>
        <button onclick="startMonitoring()">Start Monitoring</button>
    </div>
</div>
```

### Smart Positioning Logic
```javascript
// On start monitoring - remove overlay permanently
async function startMonitoring() {
    hasEverStartedMonitoring = true;
    
    if (startMonitoringSection) {
        startMonitoringSection.style.position = 'static'; // Remove overlay
        startMonitoringSection.style.display = 'none';   // Hide for loading
    }
    // ... rest of monitoring logic
}

// On stop monitoring - keep normal flow (no overlay restoration)
async function stopMonitoring() {
    if (startMonitoringSection) {
        startMonitoringSection.style.position = 'static'; // Keep normal flow
        startMonitoringSection.style.display = 'block';   // Show in normal position
    }
    
    // Keep tabs enabled since monitoring has been used
    if (viewToggleContainer) {
        viewToggleContainer.style.opacity = '1';
        viewToggleContainer.style.pointerEvents = 'auto';
    }
}
```

### UX Flow States
1. **Virgin State** (page load): Absolute overlay blocks everything
2. **First Monitoring**: Overlay removed → loading → results → stop (normal flow)
3. **Subsequent Cycles**: Always normal flow positioning
4. **Page Refresh**: Back to virgin state with overlay

## 🗺️ Technical Implementation: Dynamic Location Discovery

### Backend API (`/api/discover-locations`)
```javascript
// Extract location data from RMV page
const locationData = await page.evaluate(() => {
    const data = { locations: [], offices: [] };
    
    // Primary: Extract from window.displayData
    if (window.displayData && Array.isArray(window.displayData)) {
        data.locations = window.displayData.map(location => ({
            id: location.Id,
            name: location.Name,
            address: location.Address,
            latitude: location.Latitude,
            longitude: location.Longitude
        }));
    }
    
    // Secondary: Extract from DOM buttons
    const qflowButtons = document.querySelectorAll('.QflowObjectItem[data-id]');
    // ... DOM extraction logic
    
    return data;
});
```

### Frontend Integration (`public/index.html`)
```javascript
// Dynamic location discovery with smart regional mapping
async function discoverLocationsFromUrl() {
    const response = await fetch('/api/discover-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rmvUrl })
    });
    
    // Update serviceCenters array with discovered locations
    serviceCenters = discoveredServiceCenters;
    isUsingDynamicLocations = true;
    
    // Update regional mappings with new locations
    updateRegionalMappings();
}
```

### Regional Mapping Algorithm
```javascript
function updateRegionalMappings() {
    // Priority-based assignment (Islands first!)
    if (locationName.match(/Martha.*Vineyard|Nantucket/i)) {
        regions.islands.push(locationName);
    }
    // Geographic bounds for other regions
    else if (lat >= 42.1 && lat <= 42.6 && lng >= -71.3 && lng <= -70.8) {
        regions.boston.push(locationName);
    }
    // ... additional region logic with coordinate boundaries
}
```

### Recovery Commands:
```bash
# View recent commits
git log --oneline -10

# Restore specific file from previous commit
git show HEAD~1:filename.js > filename.js

# View changes in previous commit
git show HEAD~1:filename.js
```

## 🏗️ System Architecture

### Frontend Flow:
1. **Section 1**: RMV URL + ZIP → Personal data extraction
2. **Section 2**: Service center selection (max 8)
3. **Section 3**: Time preferences (date/time sliders)
4. **Section 4**: Notifications settings
5. **Section 5**: Progressive Disclosure Monitoring Interface
   - **Initial State**: Absolute positioned overlay with Start Monitoring button
   - **Loading State**: Spinner with "Searching for Appointments" message
   - **Active State**: Normal flow with tabs enabled and results displayed
   - **Stopped State**: Smart positioning (overlay for first-time, normal flow after)
6. **Section 6**: Statistics dashboard
7. **Section 7**: Activity logs

### Backend APIs:
- `POST /api/extract-personal-data` - Extract user info from RMV URL
- `POST /api/scrape-rmv-appointments` - Check appointments for selected centers
- `POST /api/clear-sessions` - Clear monitoring sessions

### Key Files:
- `public/index.html` - Complete frontend application
- `rmv-api-server.js` - **PRODUCTION** server with full monitoring features (renamed from rmv-monitor-service.js)
- `rmv-monitor-service-test.js` - Simplified test server (development only)
- `rmv-personal-data-extractor.js` - Fast 9.3s personal data extraction (renamed from rmv-extractor-minimal.js)
- `rmv-appointment-scraper.js` - Enhanced scraper classes (renamed from rmv-user-data-extractor.js)

## 🔧 Development Commands

```bash
# Start development server
npm start

# View server logs
tail -f combined.log

# Test API endpoints
curl -X POST http://localhost:3000/api/extract-personal-data \
  -H "Content-Type: application/json" \
  -d '{"url":"RMV_URL_HERE"}'
```

## 🚨 Common Issues & Solutions

### 1. Connection/API Errors (SOLVED ✅)
**Issue**: 404 errors for `/api/clear-sessions`, intermittent 500 errors  
**Root Cause**: Running test server instead of production server  
**Solution**: Switch `package.json` to use `rmv-api-server.js`
```bash
# package.json should have:
"start": "node rmv-api-server.js"
# NOT: "node rmv-monitor-service-test.js"
```

### 2. Monitoring Not Starting
- Check browser console for JavaScript errors
- Verify all form validation passes
- Ensure `checkRMVUrl` method exists in service
- Check parameter names match between frontend/backend

### 3. Personal Data Extraction Fails
- Verify RMV URL format (must contain 'rmvmassdotappt.cxmflow.com')
- Check if RMV site structure changed
- Monitor server logs for Puppeteer errors
- **New**: Browser initialization timing improved with 500ms delay

### 4. Missing Methods/Functions
- Check git history: `git log --oneline`
- Look for backup files: `*.backup`
- Use git show to restore: `git show HEAD~1:file.js`

### 5. Test vs Production Server Confusion
- **Production**: `rmv-api-server.js` (full features, renamed from rmv-monitor-service.js)
- **Test**: `rmv-monitor-service-test.js` (debugging only)
- Always use production server for actual monitoring

## 📝 Code Standards

### Git Commit Messages:
```
Brief description of changes

- Bullet point details of what changed
- Include any breaking changes
- Note any new features added

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### JavaScript Conventions:
- Use `const`/`let` instead of `var`
- Add null checks before DOM manipulation
- Include console.log debugging for complex functions
- Comment complex business logic

### File Organization:
- Keep backup files (`.backup` extension)
- Document all API endpoint changes
- Update markdown files after major changes