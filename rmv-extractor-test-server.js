// RMV Personal Data Extractor Test Server
// Simple web interface to test the RMV data extraction

const express = require('express');
const path = require('path');
const RMVPersonalDataExtractor = require('./rmv-personal-data-extractor');

const app = express();
const PORT = 9876;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Serve the test page
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RMV Data Extractor Test</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            background: #f8f9fa;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1a73e8;
            text-align: center;
            margin-bottom: 30px;
        }
        .instructions {
            background: #e8f4fd;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
            border-left: 4px solid #1a73e8;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
            color: #333;
        }
        input[type="url"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 6px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input[type="url"]:focus {
            outline: none;
            border-color: #1a73e8;
        }
        button {
            background: #1a73e8;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.3s;
            width: 100%;
        }
        button:hover {
            background: #1557b0;
        }
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .loading {
            text-align: center;
            margin: 20px 0;
            color: #666;
        }
        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid #ccc;
            border-top: 2px solid #1a73e8;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 10px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .results {
            margin-top: 30px;
            padding: 20px;
            border-radius: 8px;
            background: #f0f9ff;
            border: 1px solid #bfdbfe;
        }
        .success {
            background: #f0fdf4;
            border-color: #bbf7d0;
        }
        .error {
            background: #fef2f2;
            border-color: #fecaca;
            color: #dc2626;
        }
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        .data-table th,
        .data-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        .data-table th {
            background: #f9fafb;
            font-weight: 600;
        }
        .extraction-details {
            margin-top: 20px;
            font-size: 14px;
            color: #666;
        }
        .highlight {
            background: #fff3cd;
            padding: 2px 4px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚗 RMV Data Extractor Test</h1>
        
        <div class="instructions">
            <h3>📋 Instructions</h3>
            <ol>
                <li>Go to the <strong>Massachusetts RMV appointment booking system</strong></li>
                <li>Navigate through the booking flow until you reach a page with an <span class="highlight">AccessToken</span> in the URL</li>
                <li>Copy the entire URL (should look like: <code>https://rmvmassdotappt.cxmflow.com/Appointment/Index/...</code>)</li>
                <li>Paste the URL below and click "Extract Data"</li>
                <li>The system will automatically navigate through the appointment flow and extract your personal information</li>
            </ol>
            <p><strong>⚠️ Note:</strong> This process takes about 30-45 seconds as it navigates through multiple pages.</p>
        </div>

        <form id="extractForm">
            <div class="form-group">
                <label for="rmvUrl">RMV Appointment URL:</label>
                <input 
                    type="url" 
                    id="rmvUrl" 
                    name="rmvUrl" 
                    placeholder="https://rmvmassdotappt.cxmflow.com/Appointment/Index/..." 
                    required
                >
            </div>
            <button type="submit">🔍 Extract Personal Data</button>
        </form>

        <div id="loading" class="loading" style="display: none;">
            <div class="spinner"></div>
            Extracting personal data from RMV system... This may take 30-45 seconds.
        </div>

        <div id="results" class="results" style="display: none;"></div>
    </div>

    <script>
        document.getElementById('extractForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const url = document.getElementById('rmvUrl').value;
            const loadingDiv = document.getElementById('loading');
            const resultsDiv = document.getElementById('results');
            const submitBtn = document.querySelector('button[type="submit"]');
            
            // Show loading state
            loadingDiv.style.display = 'block';
            resultsDiv.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Extracting...';
            
            try {
                const response = await fetch('/extract', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ url: url })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showResults(result, true);
                } else {
                    showResults(result, false);
                }
            } catch (error) {
                showResults({ error: 'Network error: ' + error.message }, false);
            } finally {
                loadingDiv.style.display = 'none';
                submitBtn.disabled = false;
                submitBtn.textContent = '🔍 Extract Personal Data';
            }
        });
        
        function showResults(data, success) {
            const resultsDiv = document.getElementById('results');
            resultsDiv.className = 'results ' + (success ? 'success' : 'error');
            
            if (success && data.personalData) {
                const personalData = data.personalData;
                resultsDiv.innerHTML = \`
                    <h3>✅ Extraction Successful!</h3>
                    <p><strong>Duration:</strong> \${data.duration}s | <strong>Final Page:</strong> \${personalData.pageTitle}</p>
                    
                    <table class="data-table">
                        <thead>
                            <tr><th>Field</th><th>Value</th></tr>
                        </thead>
                        <tbody>
                            <tr><td><strong>First Name</strong></td><td>\${personalData.firstName || '❌ Not found'}</td></tr>
                            <tr><td><strong>Last Name</strong></td><td>\${personalData.lastName || '❌ Not found'}</td></tr>
                            <tr><td><strong>Email</strong></td><td>\${personalData.email || '❌ Not found'}</td></tr>
                            <tr><td><strong>Phone</strong></td><td>\${personalData.phone || '❌ Not found'}</td></tr>
                        </tbody>
                    </table>
                    
                    \${personalData.foundElements && personalData.foundElements.length > 0 ? \`
                    <div class="extraction-details">
                        <h4>🔍 Extraction Details:</h4>
                        <ul>
                            \${personalData.foundElements.map(element => 
                                \`<li><strong>\${element.field}:</strong> "\${element.value}" <em>(via \${element.method})</em></li>\`
                            ).join('')}
                        </ul>
                    </div>
                    \` : ''}
                    
                    <div class="extraction-details">
                        <p><strong>Source URL:</strong> <code>\${personalData.sourceUrl}</code></p>
                        <p><strong>Extraction Method:</strong> \${personalData.extractionMethod}</p>
                        <p><strong>Timestamp:</strong> \${new Date(personalData.extractionTimestamp).toLocaleString()}</p>
                    </div>
                \`;
            } else {
                resultsDiv.innerHTML = \`
                    <h3>❌ Extraction Failed</h3>
                    <p><strong>Error:</strong> \${data.error || 'Unknown error occurred'}</p>
                    \${data.duration ? \`<p><strong>Duration:</strong> \${data.duration}s</p>\` : ''}
                    <p>Please check that you're using a valid RMV appointment URL with an AccessToken parameter.</p>
                \`;
            }
            
            resultsDiv.style.display = 'block';
        }
    </script>
</body>
</html>
    `);
});

// API endpoint to handle extraction
app.post('/extract', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    // Validate URL format
    if (!url.includes('rmvmassdotappt.cxmflow.com')) {
        return res.status(400).json({ error: 'Invalid RMV URL format. Please use a URL from rmvmassdotappt.cxmflow.com' });
    }
    
    console.log(`🔍 Starting extraction for URL: ${url}`);
    const startTime = Date.now();
    
    try {
        const extractor = new RMVPersonalDataExtractor();
        const personalData = await extractor.extractPersonalData(url);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log(`✅ Extraction completed in ${duration}s`);
        console.log('Extracted data:', {
            firstName: personalData.firstName,
            lastName: personalData.lastName,
            email: personalData.email,
            phone: personalData.phone
        });
        
        res.json({
            success: true,
            personalData: personalData,
            duration: duration
        });
        
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.error(`❌ Extraction failed after ${duration}s:`, error.message);
        
        res.status(500).json({
            error: error.message,
            duration: duration
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log('🚗 RMV Data Extractor Test Server');
    console.log('=' .repeat(50));
    console.log(`🌐 Server running at: http://localhost:${PORT}`);
    console.log(`📱 Open in browser: http://localhost:${PORT}`);
    console.log('=' .repeat(50));
    console.log('');
    console.log('📋 Instructions:');
    console.log('1. Open the URL above in your browser');
    console.log('2. Paste an RMV appointment URL with AccessToken');
    console.log('3. Click "Extract Personal Data" to test');
    console.log('');
    console.log('⏹️  Press Ctrl+C to stop the server');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Server shutting down...');
    process.exit(0);
});