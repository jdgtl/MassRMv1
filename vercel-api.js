// Vercel-compatible API endpoints (without Puppeteer)
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.static(__dirname));

// Serve the main interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index-improved.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        platform: 'vercel',
        features: 'limited - no browser automation',
        timestamp: new Date().toISOString()
    });
});

// Mock API endpoints for Vercel (no actual scraping)
app.post('/api/check-appointments', (req, res) => {
    res.json({
        success: false,
        message: 'Browser automation not available on Vercel. Please use the Railway deployment for full functionality.',
        platform: 'vercel'
    });
});

app.post('/api/users', (req, res) => {
    res.json({
        success: false,
        message: 'Database operations not available on Vercel static deployment.',
        platform: 'vercel'
    });
});

module.exports = app;