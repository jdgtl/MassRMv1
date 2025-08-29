// rmv-monitor-service.js
// Complete backend service for monitoring RMV appointments

const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');

// Configuration
const config = {
    // Service configuration
    port: process.env.PORT || 3000,
    checkInterval: process.env.CHECK_INTERVAL || 5, // minutes

    // RMV URLs - Replace with actual URLs
    baseUrl: process.env.RMV_BASE_URL || 'https://rmv-appointment-site.mass.gov',

    // Email configuration (using Gmail as example)
    email: {
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS // Use app-specific password
        }
    },

    // Twilio configuration for SMS
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.TWILIO_FROM_NUMBER
    },

    // Database file (simple JSON for this implementation)
    dbPath: './rmv-monitor-db.json',

    // Expire date for monitoring
    expireDate: new Date('2025-09-03T23:59:59')
};

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Database helper functions
class Database {
    constructor(filepath) {
        this.filepath = filepath;
    }

    async load() {
        try {
            const data = await fs.readFile(this.filepath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // If file doesn't exist, return default structure
            return {
                users: [],
                appointments: [],
                logs: []
            };
        }
    }

    async save(data) {
        await fs.writeFile(this.filepath, JSON.stringify(data, null, 2));
    }

    async addUser(user) {
        const data = await this.load();
        const existingUser = data.users.find(u => u.email === user.email);

        if (existingUser) {
            Object.assign(existingUser, user);
        } else {
            data.users.push({
                ...user,
                id: Date.now().toString(),
                createdAt: new Date().toISOString()
            });
        }

        await this.save(data);
        return existingUser || data.users[data.users.length - 1];
    }

    async getActiveUsers() {
        const data = await this.load();
        return data.users.filter(u => u.active);
    }

    async logAppointment(appointment) {
        const data = await this.load();
        data.appointments.push({
            ...appointment,
            foundAt: new Date().toISOString()
        });
        await this.save(data);
    }

    async addLog(entry) {
        const data = await this.load();
        data.logs.push({
            ...entry,
            timestamp: new Date().toISOString()
        });

        // Keep only last 1000 logs
        if (data.logs.length > 1000) {
            data.logs = data.logs.slice(-1000);
        }

        await this.save(data);
    }
}

// RMV Scraper Class
class RMVScraper {
    constructor() {
        this.browser = null;
        this.serviceCenters = [
            { name: 'Boston', url: '/boston' },
            { name: 'Worcester', url: '/worcester' },
            { name: 'Springfield', url: '/springfield' },
            { name: 'Lowell', url: '/lowell' },
            { name: 'Cambridge', url: '/cambridge' },
            // Add all service centers here
        ];
    }

    async initialize() {
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async checkServiceCenter(centerUrl, userPreferences) {
        const page = await this.browser.newPage();
        const appointments = [];

        try {
            // Set user agent to avoid detection
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

            // Navigate to service center page
            await page.goto(`${config.baseUrl}${centerUrl}`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait for appointment slots to load
            await page.waitForSelector('.appointment-slot', { timeout: 10000 });

            // Extract appointment data
            const slots = await page.evaluate(() => {
                const elements = document.querySelectorAll('.appointment-slot');
                return Array.from(elements).map(el => ({
                    date: el.querySelector('.date')?.textContent?.trim(),
                    time: el.querySelector('.time')?.textContent?.trim(),
                    available: !el.classList.contains('unavailable')
                }));
            });

            // Filter based on user preferences
            for (const slot of slots) {
                if (slot.available && this.matchesPreferences(slot, userPreferences)) {
                    appointments.push({
                        center: centerUrl.replace('/', ''),
                        date: slot.date,
                        time: slot.time,
                        url: page.url()
                    });
                }
            }

        } catch (error) {
            logger.error(`Error checking ${centerUrl}:`, error);
        } finally {
            await page.close();
        }

        return appointments;
    }

    matchesPreferences(slot, preferences) {
        // Check date range
        const slotDate = new Date(slot.date);
        const startDate = new Date(preferences.startDate);
        const endDate = new Date(preferences.endDate);

        if (slotDate < startDate || slotDate > endDate) {
            return false;
        }

        // Check time preferences
        if (preferences.timeSlots && preferences.timeSlots.length > 0) {
            if (!preferences.timeSlots.includes(slot.time)) {
                return false;
            }
        }

        return true;
    }

    async autoBook(appointment, userInfo) {
        const page = await this.browser.newPage();

        try {
            await page.goto(appointment.url, {
                waitUntil: 'networkidle2'
            });

            // Click on the appointment slot
            await page.click(`[data-date="${appointment.date}"][data-time="${appointment.time}"]`);

            // Wait for booking form
            await page.waitForSelector('#booking-form', { timeout: 5000 });

            // Fill in user information
            await page.type('#firstName', userInfo.firstName);
            await page.type('#lastName', userInfo.lastName);
            await page.type('#email', userInfo.email);
            await page.type('#phone', userInfo.phone);

            // Additional fields as needed
            if (userInfo.licenseNumber) {
                await page.type('#licenseNumber', userInfo.licenseNumber);
            }

            // Submit the form
            await page.click('#submit-booking');

            // Wait for confirmation
            await page.waitForSelector('.confirmation-message', { timeout: 10000 });

            // Extract confirmation number
            const confirmationNumber = await page.$eval('.confirmation-number', el => el.textContent);

            return {
                success: true,
                confirmationNumber,
                appointment
            };

        } catch (error) {
            logger.error('Auto-booking failed:', error);
            return {
                success: false,
                error: error.message,
                appointment
            };
        } finally {
            await page.close();
        }
    }
}

// Notification Service
class NotificationService {
    constructor() {
        // Email transporter
        this.emailTransporter = nodemailer.createTransport(config.email);

        // Twilio client
        if (config.twilio.accountSid && config.twilio.authToken) {
            this.twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
        }
    }

    async sendEmail(to, subject, html) {
        try {
            const info = await this.emailTransporter.sendMail({
                from: config.email.auth.user,
                to,
                subject,
                html
            });

            logger.info(`Email sent: ${info.messageId}`);
            return true;
        } catch (error) {
            logger.error('Email sending failed:', error);
            return false;
        }
    }

    async sendSMS(to, message) {
        if (!this.twilioClient) {
            logger.warn('Twilio not configured');
            return false;
        }

        try {
            const result = await this.twilioClient.messages.create({
                body: message,
                from: config.twilio.fromNumber,
                to
            });

            logger.info(`SMS sent: ${result.sid}`);
            return true;
        } catch (error) {
            logger.error('SMS sending failed:', error);
            return false;
        }
    }

    async sendWebhook(url, data) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                logger.info(`Webhook sent to ${url}`);
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Webhook sending failed:', error);
            return false;
        }
    }

    async notifyUser(user, appointments) {
        const notifications = [];

        // Prepare message content
        const subject = `🎉 RMV Appointments Available!`;
        const message = this.formatMessage(appointments);
        const htmlMessage = this.formatHTMLMessage(appointments);

        // Send notifications based on user preferences
        if (user.notifications.email) {
            notifications.push(this.sendEmail(user.email, subject, htmlMessage));
        }

        if (user.notifications.sms) {
            notifications.push(this.sendSMS(user.phone, message));
        }

        if (user.notifications.webhook) {
            notifications.push(this.sendWebhook(user.webhookUrl, {
                user: user.id,
                appointments,
                timestamp: new Date().toISOString()
            }));
        }

        await Promise.all(notifications);
    }

    formatMessage(appointments) {
        let message = `Found ${appointments.length} RMV appointment(s):\n\n`;

        for (const apt of appointments) {
            message += `📍 ${apt.center}\n`;
            message += `📅 ${apt.date} at ${apt.time}\n\n`;
        }

        return message;
    }

    formatHTMLMessage(appointments) {
        let html = `
            <h2>🎉 RMV Appointments Available!</h2>
            <p>We found ${appointments.length} appointment(s) matching your preferences:</p>
            <ul>
        `;

        for (const apt of appointments) {
            html += `
                <li>
                    <strong>${apt.center}</strong><br>
                    📅 ${apt.date} at ${apt.time}<br>
                    <a href="${apt.url}">Book Now</a>
                </li>
            `;
        }

        html += `</ul>`;
        return html;
    }
}

// Main Monitor Service
class RMVMonitorService {
    constructor() {
        this.db = new Database(config.dbPath);
        this.scraper = new RMVScraper();
        this.notifier = new NotificationService();
        this.isRunning = false;
    }

    async start() {
        logger.info('Starting RMV Monitor Service...');

        // Check if we haven't passed the expiration date
        if (new Date() > config.expireDate) {
            logger.error('Service has expired. Expiration date: Sept 3, 2025');
            return;
        }

        // Initialize scraper
        await this.scraper.initialize();

        // Start monitoring loop
        this.isRunning = true;
        await this.monitorLoop();

        // Schedule checks based on business hours
        this.scheduleChecks();

        logger.info('RMV Monitor Service started successfully');
    }

    async stop() {
        logger.info('Stopping RMV Monitor Service...');
        this.isRunning = false;
        await this.scraper.close();
        logger.info('RMV Monitor Service stopped');
    }

    scheduleChecks() {
        // Check every hour from 9 AM to 4 PM on weekdays
        cron.schedule('0 9-16 * * 1-5', async () => {
            if (this.isRunning && new Date() < config.expireDate) {
                await this.checkAllUsers();
            }
        });

        // Additional check every 5 minutes during peak hours (9-11 AM)
        cron.schedule('*/5 9-11 * * 1-5', async () => {
            if (this.isRunning && new Date() < config.expireDate) {
                await this.checkAllUsers();
            }
        });
    }

    async monitorLoop() {
        while (this.isRunning && new Date() < config.expireDate) {
            await this.checkAllUsers();

            // Wait for the configured interval
            await new Promise(resolve => setTimeout(resolve, config.checkInterval * 60 * 1000));
        }
    }

    async checkAllUsers() {
        logger.info('Starting appointment check cycle...');

        const users = await this.db.getActiveUsers();
        logger.info(`Checking for ${users.length} active users`);

        for (const user of users) {
            await this.checkUserAppointments(user);
        }

        await this.db.addLog({
            type: 'check_complete',
            usersChecked: users.length
        });
    }

    async checkUserAppointments(user) {
        const allAppointments = [];

        // Check each selected service center
        for (const center of user.serviceCenters) {
            const centerInfo = this.scraper.serviceCenters.find(sc => sc.name === center);
            if (centerInfo) {
                const appointments = await this.scraper.checkServiceCenter(
                    centerInfo.url,
                    user.preferences
                );
                allAppointments.push(...appointments);
            }
        }

        if (allAppointments.length > 0) {
            logger.info(`Found ${allAppointments.length} appointments for ${user.email}`);

            // Log appointments to database
            for (const apt of allAppointments) {
                await this.db.logAppointment({
                    userId: user.id,
                    ...apt
                });
            }

            // Send notifications
            await this.notifier.notifyUser(user, allAppointments);

            // Auto-book if enabled
            if (user.autoBook && allAppointments.length > 0) {
                const bookingResult = await this.scraper.autoBook(
                    allAppointments[0],
                    user
                );

                if (bookingResult.success) {
                    logger.info(`Auto-booked appointment for ${user.email}: ${bookingResult.confirmationNumber}`);

                    // Send confirmation
                    await this.notifier.sendEmail(
                        user.email,
                        '✅ RMV Appointment Booked!',
                        `<h2>Your appointment has been automatically booked!</h2>
                        <p>Confirmation Number: <strong>${bookingResult.confirmationNumber}</strong></p>
                        <p>Location: ${bookingResult.appointment.center}</p>
                        <p>Date: ${bookingResult.appointment.date}</p>
                        <p>Time: ${bookingResult.appointment.time}</p>`
                    );

                    // Disable auto-booking for this user to avoid duplicates
                    user.autoBook = false;
                    await this.db.addUser(user);
                }
            }
        }
    }
}

// Express API Server
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const service = new RMVMonitorService();
const db = new Database(config.dbPath);

// API Routes
app.post('/api/users', async (req, res) => {
    try {
        const user = await db.addUser(req.body);
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/users/:email', async (req, res) => {
    try {
        const data = await db.load();
        const user = data.users.find(u => u.email === req.params.email);

        if (user) {
            res.json({ success: true, user });
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/users/:id/toggle', async (req, res) => {
    try {
        const data = await db.load();
        const user = data.users.find(u => u.id === req.params.id);

        if (user) {
            user.active = !user.active;
            await db.save(data);
            res.json({ success: true, active: user.active });
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/appointments/:userId', async (req, res) => {
    try {
        const data = await db.load();
        const appointments = data.appointments.filter(a => a.userId === req.params.userId);
        res.json({ success: true, appointments });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/logs', async (req, res) => {
    try {
        const data = await db.load();
        res.json({ success: true, logs: data.logs.slice(-100) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/check-now/:userId', async (req, res) => {
    try {
        const data = await db.load();
        const user = data.users.find(u => u.id === req.params.userId);

        if (user) {
            // Run check immediately for this user
            await service.checkUserAppointments(user);
            res.json({ success: true, message: 'Check initiated' });
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        running: service.isRunning,
        expiresAt: config.expireDate,
        timestamp: new Date().toISOString()
    });
});

// Start the server
async function startServer() {
    try {
        await service.start();

        app.listen(config.port, () => {
            logger.info(`API Server running on port ${config.port}`);
            logger.info(`Service will expire on ${config.expireDate.toLocaleDateString()}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await service.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await service.stop();
    process.exit(0);
});

// Start the service
startServer();