// rmv-user-data-extractor.js
// Module to extract user information from RMV appointment pages

class RMVUserDataExtractor {
    constructor(logger) {
        this.logger = logger || console;
    }

    /**
     * Extract user data from the RMV appointment page
     * @param {Page} page - Puppeteer page object
     * @returns {Object} User information extracted from the page
     */
    async extractUserDataFromPage(page) {
        try {
            this.logger.info('Attempting to extract user data from RMV page...');

            // Wait for the page to load completely
            await page.waitForTimeout(2000);

            // Try multiple extraction strategies
            const userData = await page.evaluate(() => {
                const data = {
                    found: false,
                    source: null,
                    firstName: null,
                    lastName: null,
                    email: null,
                    phone: null,
                    address: null,
                    dateOfBirth: null,
                    licenseNumber: null,
                    rawData: {}
                };

                // Strategy 1: Check for user data in JavaScript variables
                if (typeof window.userData !== 'undefined') {
                    data.rawData.windowUserData = window.userData;
                    data.source = 'window.userData';
                    data.found = true;
                }

                if (typeof window.customerData !== 'undefined') {
                    data.rawData.windowCustomerData = window.customerData;
                    data.source = 'window.customerData';
                    data.found = true;
                }

                if (typeof window.appointmentData !== 'undefined') {
                    data.rawData.windowAppointmentData = window.appointmentData;
                    if (window.appointmentData.customer) {
                        data.firstName = window.appointmentData.customer.firstName;
                        data.lastName = window.appointmentData.customer.lastName;
                        data.email = window.appointmentData.customer.email;
                        data.phone = window.appointmentData.customer.phone;
                        data.source = 'window.appointmentData';
                        data.found = true;
                    }
                }

                // Strategy 2: Check form fields for pre-filled data
                const formFields = {
                    firstName: [
                        'input[name*="FirstName"]',
                        'input[name*="first_name"]',
                        'input[id*="FirstName"]',
                        'input[placeholder*="First"]'
                    ],
                    lastName: [
                        'input[name*="LastName"]',
                        'input[name*="last_name"]',
                        'input[id*="LastName"]',
                        'input[placeholder*="Last"]'
                    ],
                    email: [
                        'input[type="email"]',
                        'input[name*="Email"]',
                        'input[name*="email"]',
                        'input[id*="Email"]'
                    ],
                    phone: [
                        'input[type="tel"]',
                        'input[name*="Phone"]',
                        'input[name*="phone"]',
                        'input[id*="Phone"]'
                    ],
                    dateOfBirth: [
                        'input[name*="DateOfBirth"]',
                        'input[name*="DOB"]',
                        'input[name*="dob"]',
                        'input[type="date"][name*="birth"]'
                    ],
                    licenseNumber: [
                        'input[name*="License"]',
                        'input[name*="DL"]',
                        'input[name*="license"]',
                        'input[id*="License"]'
                    ]
                };

                // Try to extract from form fields
                for (const [field, selectors] of Object.entries(formFields)) {
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element && element.value && element.value.trim()) {
                            data[field] = element.value.trim();
                            data.found = true;
                            if (!data.source) data.source = 'form_fields';
                        }
                    }
                }

                // Strategy 3: Check for display text with user info
                const textSelectors = [
                    '.customer-info',
                    '.user-details',
                    '.appointment-for',
                    '[class*="customer"]',
                    '[class*="user-info"]',
                    '.confirmation-details'
                ];

                for (const selector of textSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const text = element.textContent;
                        data.rawData.displayText = text;

                        // Try to parse name from text like "Appointment for: John Doe"
                        const nameMatch = text.match(/(?:for|name|customer):\s*([A-Za-z]+)\s+([A-Za-z]+)/i);
                        if (nameMatch) {
                            data.firstName = data.firstName || nameMatch[1];
                            data.lastName = data.lastName || nameMatch[2];
                            data.found = true;
                            data.source = data.source || 'display_text';
                        }

                        // Try to extract email
                        const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                        if (emailMatch) {
                            data.email = data.email || emailMatch[1];
                            data.found = true;
                        }

                        // Try to extract phone
                        const phoneMatch = text.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
                        if (phoneMatch) {
                            data.phone = data.phone || phoneMatch[1].replace(/[-.\s]/g, '');
                            data.found = true;
                        }
                    }
                }

                // Strategy 4: Check sessionStorage and localStorage
                try {
                    const sessionData = sessionStorage.getItem('customerData') ||
                                      sessionStorage.getItem('userData') ||
                                      sessionStorage.getItem('appointmentData');
                    if (sessionData) {
                        const parsed = JSON.parse(sessionData);
                        data.rawData.sessionStorage = parsed;
                        if (parsed.firstName) data.firstName = parsed.firstName;
                        if (parsed.lastName) data.lastName = parsed.lastName;
                        if (parsed.email) data.email = parsed.email;
                        if (parsed.phone) data.phone = parsed.phone;
                        data.found = true;
                        data.source = data.source || 'sessionStorage';
                    }
                } catch (e) {
                    // Session storage not available or parse error
                }

                // Strategy 5: Check meta tags
                const metaTags = document.querySelectorAll('meta[name*="user"], meta[name*="customer"]');
                metaTags.forEach(tag => {
                    const name = tag.getAttribute('name');
                    const content = tag.getAttribute('content');
                    if (content) {
                        data.rawData[`meta_${name}`] = content;
                        data.found = true;
                    }
                });

                // Strategy 6: Check data attributes
                const elementsWithData = document.querySelectorAll('[data-customer], [data-user], [data-appointment]');
                elementsWithData.forEach(element => {
                    const attrs = element.dataset;
                    Object.keys(attrs).forEach(key => {
                        data.rawData[`data_${key}`] = attrs[key];

                        // Try to map common data attributes
                        if (key.toLowerCase().includes('firstname')) data.firstName = attrs[key];
                        if (key.toLowerCase().includes('lastname')) data.lastName = attrs[key];
                        if (key.toLowerCase().includes('email')) data.email = attrs[key];
                        if (key.toLowerCase().includes('phone')) data.phone = attrs[key];

                        if (attrs[key]) data.found = true;
                    });
                });

                return data;
            });

            // Additional extraction using Puppeteer's capabilities
            const additionalData = await this.extractFromNetworkRequests(page);

            // Merge the data
            const mergedData = {
                ...userData,
                ...additionalData,
                extractedAt: new Date().toISOString(),
                url: page.url()
            };

            this.logger.info('User data extraction completed:', {
                found: mergedData.found,
                source: mergedData.source,
                hasFirstName: !!mergedData.firstName,
                hasLastName: !!mergedData.lastName,
                hasEmail: !!mergedData.email,
                hasPhone: !!mergedData.phone
            });

            return mergedData;

        } catch (error) {
            this.logger.error('Error extracting user data:', error);
            return {
                found: false,
                error: error.message,
                extractedAt: new Date().toISOString()
            };
        }
    }

    /**
     * Extract data from network requests
     * @param {Page} page - Puppeteer page object
     * @returns {Object} Data extracted from network requests
     */
    async extractFromNetworkRequests(page) {
        const networkData = {
            fromNetwork: false
        };

        try {
            // Get cookies that might contain user info
            const cookies = await page.cookies();
            const relevantCookies = cookies.filter(cookie =>
                cookie.name.toLowerCase().includes('user') ||
                cookie.name.toLowerCase().includes('customer') ||
                cookie.name.toLowerCase().includes('session')
            );

            if (relevantCookies.length > 0) {
                networkData.cookies = relevantCookies.map(c => ({
                    name: c.name,
                    value: c.value
                }));
                networkData.fromNetwork = true;

                // Try to decode JWT tokens if present
                relevantCookies.forEach(cookie => {
                    if (cookie.value.includes('.')) {
                        try {
                            const decoded = this.decodeJWT(cookie.value);
                            if (decoded) {
                                networkData.decodedToken = decoded;
                                if (decoded.firstName) networkData.firstName = decoded.firstName;
                                if (decoded.lastName) networkData.lastName = decoded.lastName;
                                if (decoded.email) networkData.email = decoded.email;
                                if (decoded.phone) networkData.phone = decoded.phone;
                            }
                        } catch (e) {
                            // Not a valid JWT
                        }
                    }
                });
            }

            // Check for API responses that might contain user data
            const apiData = await page.evaluate(() => {
                // Check if there were any XHR or fetch responses stored
                return window.__capturedAPIResponses || null;
            });

            if (apiData) {
                networkData.apiResponses = apiData;
                networkData.fromNetwork = true;
            }

        } catch (error) {
            this.logger.warn('Could not extract network data:', error.message);
        }

        return networkData;
    }

    /**
     * Decode JWT token to extract user information
     * @param {string} token - JWT token string
     * @returns {Object|null} Decoded token payload
     */
    decodeJWT(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            const payload = parts[1];
            const decoded = Buffer.from(payload, 'base64').toString('utf-8');
            return JSON.parse(decoded);
        } catch (error) {
            return null;
        }
    }

    /**
     * Setup page to capture API responses
     * @param {Page} page - Puppeteer page object
     */
    async setupResponseCapture(page) {
        // Inject script to capture API responses
        await page.evaluateOnNewDocument(() => {
            window.__capturedAPIResponses = [];

            // Override fetch
            const originalFetch = window.fetch;
            window.fetch = async (...args) => {
                const response = await originalFetch(...args);
                const clonedResponse = response.clone();

                try {
                    const data = await clonedResponse.json();
                    window.__capturedAPIResponses.push({
                        url: args[0],
                        data: data,
                        timestamp: Date.now()
                    });
                } catch (e) {
                    // Not JSON response
                }

                return response;
            };

            // Override XMLHttpRequest
            const originalOpen = XMLHttpRequest.prototype.open;
            const originalSend = XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open = function(method, url) {
                this.__url = url;
                return originalOpen.apply(this, arguments);
            };

            XMLHttpRequest.prototype.send = function() {
                this.addEventListener('load', function() {
                    try {
                        const data = JSON.parse(this.responseText);
                        window.__capturedAPIResponses.push({
                            url: this.__url,
                            data: data,
                            timestamp: Date.now()
                        });
                    } catch (e) {
                        // Not JSON response
                    }
                });
                return originalSend.apply(this, arguments);
            };
        });
    }

    /**
     * Extract data from URL parameters
     * @param {string} url - The RMV URL
     * @returns {Object} Extracted parameters
     */
    extractFromURLParams(url) {
        const urlObj = new URL(url);
        const params = {};

        // Get all query parameters
        urlObj.searchParams.forEach((value, key) => {
            params[key] = value;
        });

        // Get path segments that might be IDs
        const pathSegments = urlObj.pathname.split('/').filter(s => s);

        return {
            accessToken: params.AccessToken || params.access_token || params.token,
            sessionId: pathSegments[pathSegments.length - 1],
            queryParams: params,
            pathSegments: pathSegments
        };
    }

    /**
     * Validate extracted user data
     * @param {Object} data - Extracted user data
     * @returns {Object} Validated and cleaned data
     */
    validateUserData(data) {
        const validated = {
            isValid: false,
            errors: [],
            cleaned: {}
        };

        // Validate and clean first name
        if (data.firstName) {
            const cleaned = data.firstName.trim();
            if (cleaned.length >= 2 && /^[A-Za-z\s'-]+$/.test(cleaned)) {
                validated.cleaned.firstName = cleaned;
            } else {
                validated.errors.push('Invalid first name format');
            }
        }

        // Validate and clean last name
        if (data.lastName) {
            const cleaned = data.lastName.trim();
            if (cleaned.length >= 2 && /^[A-Za-z\s'-]+$/.test(cleaned)) {
                validated.cleaned.lastName = cleaned;
            } else {
                validated.errors.push('Invalid last name format');
            }
        }

        // Validate and clean email
        if (data.email) {
            const cleaned = data.email.trim().toLowerCase();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(cleaned)) {
                validated.cleaned.email = cleaned;
            } else {
                validated.errors.push('Invalid email format');
            }
        }

        // Validate and clean phone
        if (data.phone) {
            const cleaned = data.phone.replace(/\D/g, '');
            if (cleaned.length === 10) {
                validated.cleaned.phone = cleaned;
                validated.cleaned.phoneFormatted =
                    `(${cleaned.substr(0,3)}) ${cleaned.substr(3,3)}-${cleaned.substr(6)}`;
            } else {
                validated.errors.push('Invalid phone number (must be 10 digits)');
            }
        }

        // Check if we have minimum required data
        validated.isValid = validated.errors.length === 0 &&
                          (validated.cleaned.email || validated.cleaned.phone);

        return validated;
    }
}

// Integration with existing RMV scraper
class EnhancedRMVScraper {
    constructor(originalScraper, logger) {
        this.scraper = originalScraper;
        this.userDataExtractor = new RMVUserDataExtractor(logger);
        this.logger = logger || console;
    }

    /**
     * Enhanced checkRMVUrl that also extracts user data
     */
    async checkRMVUrlWithUserData(fullUrl, userPreferences) {
        const page = await this.scraper.browser.newPage();

        try {
            // Setup response capture before navigation
            await this.userDataExtractor.setupResponseCapture(page);

            // Navigate to the RMV URL
            await page.goto(fullUrl, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Extract user data
            const userData = await this.userDataExtractor.extractUserDataFromPage(page);

            // Validate the extracted data
            const validated = this.userDataExtractor.validateUserData(userData);

            // Also extract URL parameters
            const urlData = this.userDataExtractor.extractFromURLParams(fullUrl);

            // Continue with normal appointment checking
            const appointments = await this.scraper.checkRMVUrl(fullUrl, userPreferences);

            // Return combined results
            return {
                appointments: appointments,
                userData: {
                    extracted: userData,
                    validated: validated,
                    urlParams: urlData,
                    foundUserInfo: userData.found,
                    autoFillAvailable: validated.isValid
                }
            };

        } finally {
            await page.close();
        }
    }
}

module.exports = {
    RMVUserDataExtractor,
    EnhancedRMVScraper
};