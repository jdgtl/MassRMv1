# RMV Appointment Monitor - Development Guide

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
4. **Section 4**: Notifications + Monitoring controls
5. **Section 5**: Live appointment results
6. **Section 6**: Statistics dashboard
7. **Section 7**: Activity logs

### Backend APIs:
- `POST /api/extract-personal-data` - Extract user info from RMV URL
- `POST /api/scrape-rmv-appointments` - Check appointments for selected centers
- `POST /api/clear-sessions` - Clear monitoring sessions

### Key Files:
- `public/index.html` - Complete frontend application
- `rmv-monitor-service.js` - **PRODUCTION** server with full monitoring features
- `rmv-monitor-service-test.js` - Simplified test server (development only)
- `rmv-extractor-minimal.js` - Fast 9.3s personal data extraction (timing enhanced)
- `rmv-user-data-extractor.js` - Enhanced scraper classes

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
**Solution**: Switch `package.json` to use `rmv-monitor-service.js`
```bash
# package.json should have:
"start": "node rmv-monitor-service.js"
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
- **Production**: `rmv-monitor-service.js` (full features)
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