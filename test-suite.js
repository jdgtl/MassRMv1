// Comprehensive test suite for RMV Monitor
const http = require('http');
const assert = require('assert');

class RMVTestSuite {
    constructor(baseUrl = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
        this.tests = [];
        this.results = [];
    }

    // Helper method to make HTTP requests
    async request(path, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                    } catch (e) {
                        resolve({ status: res.statusCode, data: body, headers: res.headers });
                    }
                });
            });

            req.on('error', reject);
            
            if (data) {
                req.write(JSON.stringify(data));
            }
            
            req.end();
        });
    }

    // Test runner
    async runTest(name, testFn) {
        console.log(`🧪 Running: ${name}`);
        try {
            await testFn();
            console.log(`✅ PASS: ${name}`);
            this.results.push({ name, status: 'PASS' });
        } catch (error) {
            console.log(`❌ FAIL: ${name} - ${error.message}`);
            this.results.push({ name, status: 'FAIL', error: error.message });
        }
    }

    // Individual tests
    async testHealthEndpoint() {
        await this.runTest('Health Endpoint', async () => {
            const response = await this.request('/health');
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.data.status, 'ok');
            assert.strictEqual(response.data.running, true);
            assert(response.data.timestamp);
        });
    }

    async testApiEndpoint() {
        await this.runTest('API Test Endpoint', async () => {
            const response = await this.request('/api/test');
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.data.success, true);
            assert(response.data.message);
        });
    }

    async testAppointmentCheck() {
        await this.runTest('Mock Appointment Check', async () => {
            const response = await this.request('/api/check-appointments', 'POST');
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.data.success, true);
            assert(typeof response.data.found === 'boolean');
            assert(Array.isArray(response.data.appointments));
        });
    }

    async testStaticFiles() {
        await this.runTest('Static Files Serving', async () => {
            const response = await this.request('/');
            assert.strictEqual(response.status, 200);
            assert(response.data.includes('RMV Monitor Test'));
        });
    }

    async testManifestFile() {
        await this.runTest('PWA Manifest', async () => {
            const response = await this.request('/manifest.json');
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.data.name, 'RMV Appointment Monitor');
        });
    }

    async testCORS() {
        await this.runTest('CORS Headers', async () => {
            const response = await this.request('/health');
            assert(response.headers['access-control-allow-origin']);
        });
    }

    // Performance tests
    async testResponseTime() {
        await this.runTest('Response Time < 100ms', async () => {
            const start = Date.now();
            await this.request('/health');
            const duration = Date.now() - start;
            assert(duration < 100, `Response time ${duration}ms exceeds 100ms threshold`);
        });
    }

    async testConcurrentRequests() {
        await this.runTest('Concurrent Requests (10x)', async () => {
            const requests = Array(10).fill().map(() => this.request('/health'));
            const responses = await Promise.all(requests);
            
            responses.forEach((response, i) => {
                assert.strictEqual(response.status, 200, `Request ${i+1} failed`);
                assert.strictEqual(response.data.status, 'ok', `Request ${i+1} invalid response`);
            });
        });
    }

    // Stress test
    async testStressLoad() {
        await this.runTest('Stress Test (50 concurrent)', async () => {
            const requests = Array(50).fill().map(() => this.request('/api/check-appointments', 'POST'));
            const responses = await Promise.all(requests);
            
            const successCount = responses.filter(r => r.status === 200).length;
            assert(successCount >= 45, `Only ${successCount}/50 requests succeeded`);
        });
    }

    // Run all tests
    async runAllTests() {
        console.log('🚀 Starting RMV Monitor Test Suite\n');
        
        // Basic functionality tests
        await this.testHealthEndpoint();
        await this.testApiEndpoint();
        await this.testAppointmentCheck();
        await this.testStaticFiles();
        await this.testManifestFile();
        await this.testCORS();
        
        // Performance tests
        await this.testResponseTime();
        await this.testConcurrentRequests();
        
        // Stress test (optional)
        console.log('\n🔥 Running stress tests...');
        await this.testStressLoad();
        
        // Summary
        this.printSummary();
    }

    printSummary() {
        console.log('\n📊 TEST SUMMARY');
        console.log('═══════════════════════════════════════');
        
        const passed = this.results.filter(r => r.status === 'PASS').length;
        const failed = this.results.filter(r => r.status === 'FAIL').length;
        
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📈 Success Rate: ${((passed / this.results.length) * 100).toFixed(1)}%`);
        
        if (failed > 0) {
            console.log('\n❌ FAILED TESTS:');
            this.results
                .filter(r => r.status === 'FAIL')
                .forEach(r => console.log(`   • ${r.name}: ${r.error}`));
        }
        
        console.log('\n🎉 Test suite completed!');
        
        if (failed === 0) {
            console.log('🚗 RMV Monitor is ready for action! 🎯');
        } else {
            console.log('⚠️  Some tests failed. Please review and fix issues.');
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const testSuite = new RMVTestSuite();
    testSuite.runAllTests().catch(console.error);
}

module.exports = RMVTestSuite;