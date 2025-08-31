// RMV Personal Data Extractor Test Server - Standalone
// Simple web interface to test the RMV data extraction

const express = require('express');
const MinimalRMVExtractor = require('./rmv-extractor-minimal');

const app = express();
const PORT = 9877;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the test page
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RMV Data Extractor Test - Standalone</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 900px;
            width: 90%;
            margin: 20px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        h1 {
            color: #1a73e8;
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            font-size: 1.1rem;
        }
        .instructions {
            background: linear-gradient(135deg, #e8f4fd 0%, #f0f9ff 100%);
            padding: 25px;
            border-radius: 12px;
            margin-bottom: 30px;
            border-left: 5px solid #1a73e8;
        }
        .instructions h3 {
            color: #1a73e8;
            margin-bottom: 15px;
            font-size: 1.3rem;
        }
        .instructions ol {
            margin-left: 20px;
            line-height: 1.6;
        }
        .instructions li {
            margin-bottom: 8px;
        }
        .highlight {
            background: #fff3cd;
            padding: 3px 6px;
            border-radius: 4px;
            font-weight: 600;
        }
        .form-group {
            margin-bottom: 25px;
        }
        label {
            display: block;
            font-weight: 600;
            margin-bottom: 10px;
            color: #333;
            font-size: 1.1rem;
        }
        input[type="url"] {
            width: 100%;
            padding: 15px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            font-size: 16px;
            transition: all 0.3s ease;
        }
        input[type="url"]:focus {
            outline: none;
            border-color: #1a73e8;
            box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.1);
        }
        .btn {
            background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            width: 100%;
            position: relative;
            overflow: hidden;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(26, 115, 232, 0.3);
        }
        .btn:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        .loading {
            text-align: center;
            margin: 30px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #e9ecef;
        }
        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid #e9ecef;
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
            padding: 25px;
            border-radius: 12px;
            background: #f0f9ff;
            border: 1px solid #bfdbfe;
        }
        .results.success {
            background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
            border-color: #bbf7d0;
        }
        .results.error {
            background: linear-gradient(135deg, #fef2f2 0%, #fef7f7 100%);
            border-color: #fecaca;
        }
        .results h3 {
            margin-bottom: 15px;
            font-size: 1.3rem;
        }
        .results.success h3 {
            color: #059669;
        }
        .results.error h3 {
            color: #dc2626;
        }
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        }
        .data-table th,
        .data-table td {
            padding: 15px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        .data-table th {
            background: #f8fafc;
            font-weight: 600;
            color: #374151;
        }
        .data-table tr:last-child td {
            border-bottom: none;
        }
        .extraction-details {
            margin-top: 25px;
            padding: 20px;
            background: #f8fafc;
            border-radius: 8px;
            font-size: 14px;
            color: #6b7280;
        }
        .extraction-details h4 {
            color: #374151;
            margin-bottom: 10px;
        }
        .extraction-details ul {
            margin-left: 20px;
        }
        .extraction-details li {
            margin-bottom: 5px;
        }
        .alert {
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-weight: 500;
        }
        .alert-warning {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            color: #92400e;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚗 RMV Data Extractor - FAST</h1>
            <p class="subtitle">Speed-Optimized RMV Personal Information Extraction</p>
        </div>
        
        <div class="instructions">
            <h3>📋 How to Use This Test Tool</h3>
            <ol>
                <li>Go to the <strong>Massachusetts RMV appointment booking system</strong></li>
                <li>Navigate through the booking flow until you reach a page with an <span class="highlight">AccessToken</span> in the URL</li>
                <li>Copy the entire URL (should look like: <code>https://rmvmassdotappt.cxmflow.com/Appointment/Index/...</code>)</li>
                <li>Paste the URL below and click "Extract Personal Data"</li>
                <li>The system will automatically navigate through the appointment flow and extract your personal information</li>
            </ol>
        </div>

        <div class="alert alert-warning">
            <strong>⚠️ Processing Time:</strong> This process takes approximately 30-45 seconds as it navigates through multiple RMV pages to extract your information.
        </div>

        <form id="extractForm">
            <div class="form-group">
                <label for="rmvUrl">🔗 RMV Appointment URL:</label>
                <input 
                    type="url" 
                    id="rmvUrl" 
                    name="rmvUrl" 
                    placeholder="https://rmvmassdotappt.cxmflow.com/Appointment/Index/..." 
                    required
                >
            </div>
            <button type="submit" class="btn">🔍 Extract Personal Data</button>
        </form>

        <div id="loading" class="loading" style="display: none;">
            <div class="spinner"></div>
            <strong>Extracting personal data from RMV system...</strong>
            <br><br>
            <p>Please wait while we navigate through the appointment pages. This process typically takes 30-45 seconds.</p>
        </div>

        <div id="results" class="results" style="display: none;"></div>
    </div>

    <script>
        document.getElementById('extractForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const url = document.getElementById('rmvUrl').value;
            const loadingDiv = document.getElementById('loading');
            const resultsDiv = document.getElementById('results');
            const submitBtn = document.querySelector('.btn');
            
            // Show loading state
            loadingDiv.style.display = 'block';
            resultsDiv.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Extracting Data...';
            
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
                    <h3>✅ Personal Data Successfully Extracted!</h3>
                    <p><strong>Duration:</strong> \${data.duration}s | <strong>Final Page:</strong> \${personalData.pageTitle}</p>
                    
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>📋 Personal Information Field</th>
                                <th>📝 Extracted Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td><strong>First Name</strong></td><td>\${personalData.firstName || '❌ Not found'}</td></tr>
                            <tr><td><strong>Last Name</strong></td><td>\${personalData.lastName || '❌ Not found'}</td></tr>
                            <tr><td><strong>Email Address</strong></td><td>\${personalData.email || '❌ Not found'}</td></tr>
                            <tr><td><strong>Phone Number</strong></td><td>\${personalData.phone || '❌ Not found'}</td></tr>
                        </tbody>
                    </table>
                    
                    \${personalData.foundElements && personalData.foundElements.length > 0 ? \`
                    <div class="extraction-details">
                        <h4>🔍 Technical Extraction Details:</h4>
                        <ul>
                            \${personalData.foundElements.map(element => 
                                \`<li><strong>\${element.field}:</strong> "\${element.value}" <em>(extracted via \${element.method})</em></li>\`
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
                    <h3>❌ Personal Data Extraction Failed</h3>
                    <p><strong>Error:</strong> \${data.error || 'Unknown error occurred'}</p>
                    \${data.duration ? \`<p><strong>Duration:</strong> \${data.duration}s</p>\` : ''}
                    <p>Please verify that you're using a valid RMV appointment URL with an AccessToken parameter.</p>
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
    
    console.log(`\\n🔍 STARTING RMV DATA EXTRACTION`);
    console.log(`📍 URL: ${url}`);
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);
    console.log('=' .repeat(60));
    
    const startTime = Date.now();
    
    try {
        const extractor = new MinimalRMVExtractor();
        const personalData = await extractor.extractPersonalData(url);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('\\n✅ EXTRACTION SUCCESSFUL!');
        console.log('=' .repeat(60));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`📄 Page: ${personalData.pageTitle}`);
        console.log('\\n📊 Extracted Personal Data:');
        console.log(`   First Name: "${personalData.firstName || 'Not found'}"`);
        console.log(`   Last Name:  "${personalData.lastName || 'Not found'}"`);
        console.log(`   Email:      "${personalData.email || 'Not found'}"`);
        console.log(`   Phone:      "${personalData.phone || 'Not found'}"`);
        console.log('=' .repeat(60));
        
        res.json({
            success: true,
            personalData: personalData,
            duration: duration
        });
        
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('\\n❌ EXTRACTION FAILED!');
        console.log('=' .repeat(60));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`💥 Error: ${error.message}`);
        console.log('=' .repeat(60));
        
        res.status(500).json({
            error: error.message,
            duration: duration
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'RMV Extractor Test Server Online',
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// Start server
app.listen(PORT, () => {
    console.log('\\n🚗 RMV DATA EXTRACTOR TEST SERVER');
    console.log('=' .repeat(50));
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📱 Open in Browser: http://localhost:${PORT}`);
    console.log('=' .repeat(50));
    console.log('');
    console.log('📋 Ready to test RMV data extraction!');
    console.log('   1. Open the URL above');
    console.log('   2. Paste an RMV appointment URL');
    console.log('   3. Watch the extraction process');
    console.log('');
    console.log('⏹️  Press Ctrl+C to stop');
    console.log('');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\\n\\n🛑 Shutting down RMV Test Server...');
    console.log('✅ Server stopped successfully');
    process.exit(0);
});