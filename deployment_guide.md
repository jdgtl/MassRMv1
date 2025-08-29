# RMV Appointment Monitor - Complete Deployment Guide

## 🚀 Overview

This comprehensive system monitors Massachusetts RMV service center appointment availability and provides automated notifications and booking capabilities. The system includes:

- **Web Interface**: User-friendly dashboard for configuration and monitoring
- **Backend Service**: Node.js service for scraping and automation
- **Multi-Channel Notifications**: Email, SMS, Push, and Webhook support
- **Auto-Booking**: Automated appointment booking based on user preferences
- **PWA Support**: Progressive Web App for mobile notifications

## 📋 Prerequisites

### Required Software
- Node.js 18+ and npm
- Git
- Chrome/Chromium (for Puppeteer)
- PM2 (for production deployment)
- Nginx (optional, for reverse proxy)

### Required Accounts
- Gmail account with App Password (for email notifications)
- Twilio account (optional, for SMS notifications)
- VPS or Cloud hosting (AWS, DigitalOcean, Heroku, etc.)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/rmv-monitor.git
cd rmv-monitor
```

### 2. Install Dependencies

```bash
npm install
```

Create a `package.json` file:

```json
{
  "name": "rmv-monitor",
  "version": "1.0.0",
  "description": "RMV Appointment Monitoring Service",
  "main": "rmv-monitor-service.js",
  "scripts": {
    "start": "node rmv-monitor-service.js",
    "dev": "nodemon rmv-monitor-service.js",
    "pm2:start": "pm2 start ecosystem.config.js",
    "pm2:stop": "pm2 stop rmv-monitor",
    "pm2:restart": "pm2 restart rmv-monitor",
    "pm2:logs": "pm2 logs rmv-monitor"
  },
  "dependencies": {
    "puppeteer": "^21.0.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "nodemailer": "^6.9.7",
    "twilio": "^4.19.0",
    "node-cron": "^3.0.3",
    "winston": "^3.11.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

### 3. Environment Configuration

Create a `.env` file:

```env
# Server Configuration
PORT=3000
CHECK_INTERVAL=5

# RMV Configuration
RMV_BASE_URL=https://atlas-myrmv.massdot.state.ma.us/myrmv

# Email Configuration (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-specific-password

# Twilio Configuration (Optional)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+1234567890

# Database
DB_PATH=./rmv-monitor-db.json
```

### 4. PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'rmv-monitor',
    script: './rmv-monitor-service.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

## 🚀 Deployment Options

### Option 1: VPS Deployment (Recommended)

#### A. Using DigitalOcean/AWS/Linode

1. **Create a VPS instance** (Ubuntu 22.04 recommended)

2. **SSH into your server**:
```bash
ssh root@your-server-ip
```

3. **Install Node.js**:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

4. **Install Chrome dependencies**:
```bash
sudo apt-get update
sudo apt-get install -y wget gnupg
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
sudo apt-get update
sudo apt-get install -y google-chrome-stable
```

5. **Install PM2 globally**:
```bash
sudo npm install -g pm2
```

6. **Clone and setup the project**:
```bash
cd /opt
git clone https://github.com/yourusername/rmv-monitor.git
cd rmv-monitor
npm install
```

7. **Start with PM2**:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### B. Nginx Configuration (Optional)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option 2: Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:18-slim

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "rmv-monitor-service.js"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  rmv-monitor:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
```

Deploy with Docker:
```bash
docker-compose up -d
```

### Option 3: Heroku Deployment

1. **Install Heroku CLI**
2. **Create `Procfile`**:
```
web: node rmv-monitor-service.js
```

3. **Deploy**:
```bash
heroku create your-app-name
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add https://github.com/jontewks/puppeteer-heroku-buildpack
git push heroku main
```

## 📱 PWA Setup

Create `public/manifest.json`:

```json
{
  "name": "RMV Appointment Monitor",
  "short_name": "RMV Monitor",
  "description": "Automated RMV appointment monitoring and booking",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#667eea",
  "background_color": "#ffffff",
  "icons": [
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Create `public/sw.js` (Service Worker):

```javascript
const CACHE_NAME = 'rmv-monitor-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('push', event => {
  const options = {
    body: event.data.text(),
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('RMV Appointment Available!', options)
  );
});
```

## 🔧 Configuration Guide

### Email Setup (Gmail)

1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
3. Use this password in the `EMAIL_PASS` environment variable

### SMS Setup (Twilio)

1. Sign up for a Twilio account
2. Get your Account SID and Auth Token from the Twilio Console
3. Purchase a phone number
4. Add credentials to environment variables

### Webhook Setup

For custom integrations, the webhook payload format:

```json
{
  "user": "user-id",
  "appointments": [
    {
      "center": "Boston",
      "date": "2025-09-15",
      "time": "10:00 AM",
      "url": "https://..."
    }
  ],
  "timestamp": "2025-08-28T10:00:00Z"
}
```

## 📊 Monitoring & Maintenance

### View Logs

```bash
# PM2 logs
pm2 logs rmv-monitor

# Application logs
tail -f logs/combined.log

# Error logs only
tail -f logs/error.log
```

### Monitor Performance

```bash
# PM2 monitoring
pm2 monit

# System status
pm2 status
```

### Database Backup

```bash
# Backup database
cp rmv-monitor-db.json backups/rmv-monitor-db-$(date +%Y%m%d).json

# Automated daily backup (add to crontab)
0 2 * * * cp /opt/rmv-monitor/rmv-monitor-db.json /opt/rmv-monitor/backups/rmv-monitor-db-$(date +\%Y\%m\%d).json
```

## 🔐 Security Considerations

1. **Use HTTPS**: Always use SSL certificates (Let's Encrypt)
2. **Rate Limiting**: Implement rate limiting to avoid being blocked
3. **User Agent Rotation**: Rotate user agents to avoid detection
4. **Proxy Support**: Consider using rotating proxies for large-scale monitoring
5. **Data Encryption**: Encrypt sensitive user data in the database
6. **Access Control**: Implement proper authentication for the API

## 🐛 Troubleshooting

### Common Issues

1. **Puppeteer Chrome errors**:
```bash
# Install missing dependencies
sudo apt-get install -y libgbm-dev
```

2. **Permission errors**:
```bash
# Fix permissions
sudo chown -R $USER:$USER /opt/rmv-monitor
```

3. **Memory issues**:
```bash
# Increase Node memory limit
NODE_OPTIONS="--max-old-space-size=2048" node rmv-monitor-service.js
```

## 📈 Scaling Considerations

For high-volume monitoring:

1. **Database Migration**: Move from JSON to PostgreSQL/MongoDB
2. **Queue System**: Implement Redis/RabbitMQ for job queuing
3. **Load Balancing**: Use multiple instances with a load balancer
4. **Caching**: Implement Redis caching for frequent checks
5. **Microservices**: Split into separate services (scraper, notifier, API)

### Example Redis Implementation

```javascript
const Redis = require('ioredis');
const Bull = require('bull');

const redis = new Redis();
const appointmentQueue = new Bull('appointments', {
  redis: {
    port: 6379,
    host: 'localhost'
  }
});

// Add job to queue
appointmentQueue.add('check', {
  userId: 'user-123',
  centers: ['Boston', 'Cambridge']
}, {
  repeat: {
    cron: '0 */5 9-16 * * 1-5'
  }
});

// Process jobs
appointmentQueue.process('check', async (job) => {
  const { userId, centers } = job.data;
  // Check appointments
  return await checkAppointments(userId, centers);
});
```

## 🎯 Advanced Features

### 1. Captcha Handling

For sites with captcha protection:

```javascript
const solver = require('2captcha');

async function solveCaptcha(page) {
  const captchaImage = await page.$eval('#captcha-img', el => el.src);
  const solution = await solver.imageCaptcha(captchaImage);
  await page.type('#captcha-input', solution.text);
}
```

### 2. Smart Scheduling

Implement intelligent scheduling based on historical data:

```javascript
class SmartScheduler {
  async getOptimalCheckTimes(serviceCenter) {
    // Analyze historical appointment release patterns
    const history = await db.getAppointmentHistory(serviceCenter);
    const patterns = this.analyzePatterns(history);

    // Return optimal check times
    return patterns.map(p => ({
      time: p.peakTime,
      probability: p.successRate
    }));
  }

  analyzePatterns(history) {
    // Group by hour and day
    const patterns = {};
    history.forEach(apt => {
      const hour = new Date(apt.foundAt).getHours();
      patterns[hour] = (patterns[hour] || 0) + 1;
    });

    return Object.entries(patterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }
}
```

### 3. Multi-Account Support

Handle multiple RMV accounts:

```javascript
class MultiAccountManager {
  constructor() {
    this.accounts = new Map();
  }

  async addAccount(userId, credentials) {
    const session = await this.createSession(credentials);
    this.accounts.set(userId, session);
  }

  async checkWithAccount(userId, preferences) {
    const session = this.accounts.get(userId);
    if (!session) throw new Error('No session found');

    return await this.scraper.checkWithSession(session, preferences);
  }
}
```

## 📱 Mobile App Integration

### React Native App

Create a companion mobile app:

```javascript
// App.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Button,
  FlatList,
  Alert
} from 'react-native';
import PushNotification from 'react-native-push-notification';

const API_URL = 'https://your-server.com/api';

export default function App() {
  const [appointments, setAppointments] = useState([]);
  const [monitoring, setMonitoring] = useState(false);

  useEffect(() => {
    // Configure push notifications
    PushNotification.configure({
      onNotification: function(notification) {
        Alert.alert('New Appointment!', notification.message);
      }
    });

    // Load user data
    loadUserData();
  }, []);

  const startMonitoring = async () => {
    const response = await fetch(`${API_URL}/monitor/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: getUserId(),
        preferences: getPreferences()
      })
    });

    if (response.ok) {
      setMonitoring(true);
      Alert.alert('Success', 'Monitoring started!');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RMV Monitor</Text>
      <Button
        title={monitoring ? 'Stop Monitoring' : 'Start Monitoring'}
        onPress={monitoring ? stopMonitoring : startMonitoring}
      />
      <FlatList
        data={appointments}
        renderItem={renderAppointment}
        keyExtractor={item => item.id}
      />
    </View>
  );
}
```

## 🔄 API Documentation

### Endpoints

#### POST /api/users
Create or update a user profile

```bash
curl -X POST https://your-server.com/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "phone": "+1234567890",
    "firstName": "John",
    "lastName": "Doe",
    "serviceCenters": ["Boston", "Cambridge"],
    "preferences": {
      "startDate": "2025-09-01",
      "endDate": "2025-09-30",
      "timeSlots": ["9:00 AM", "10:00 AM"]
    },
    "notifications": {
      "email": true,
      "sms": true,
      "webhook": false
    },
    "autoBook": true,
    "active": true
  }'
```

#### GET /api/users/:email
Get user profile by email

```bash
curl https://your-server.com/api/users/user@example.com
```

#### PUT /api/users/:id/toggle
Toggle monitoring for a user

```bash
curl -X PUT https://your-server.com/api/users/123/toggle
```

#### GET /api/appointments/:userId
Get appointments found for a user

```bash
curl https://your-server.com/api/appointments/123
```

#### POST /api/check-now/:userId
Trigger immediate check for a user

```bash
curl -X POST https://your-server.com/api/check-now/123
```

#### GET /api/logs
Get system logs

```bash
curl https://your-server.com/api/logs
```

#### GET /health
Health check endpoint

```bash
curl https://your-server.com/health
```

### Response Formats

Success Response:
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

Error Response:
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## 🧪 Testing

### Unit Tests

Create `test/scraper.test.js`:

```javascript
const { RMVScraper } = require('../rmv-monitor-service');
const assert = require('assert');

describe('RMV Scraper', () => {
  let scraper;

  beforeEach(async () => {
    scraper = new RMVScraper();
    await scraper.initialize();
  });

  afterEach(async () => {
    await scraper.close();
  });

  it('should check service center', async () => {
    const appointments = await scraper.checkServiceCenter(
      '/boston',
      {
        startDate: '2025-09-01',
        endDate: '2025-09-30',
        timeSlots: []
      }
    );

    assert(Array.isArray(appointments));
  });

  it('should match preferences correctly', () => {
    const slot = {
      date: '2025-09-15',
      time: '10:00 AM'
    };

    const preferences = {
      startDate: '2025-09-01',
      endDate: '2025-09-30',
      timeSlots: ['10:00 AM']
    };

    const matches = scraper.matchesPreferences(slot, preferences);
    assert(matches === true);
  });
});
```

### Integration Tests

```javascript
describe('API Integration', () => {
  it('should create user', async () => {
    const response = await fetch('http://localhost:3000/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        phone: '+1234567890',
        firstName: 'Test',
        lastName: 'User'
      })
    });

    const data = await response.json();
    assert(data.success === true);
  });
});
```

## 📊 Monitoring Dashboard

### Grafana Integration

Create `docker-compose.monitoring.yml`:

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  prometheus_data:
  grafana_data:
```

### Metrics Collection

```javascript
const promClient = require('prom-client');

// Create metrics
const checkCounter = new promClient.Counter({
  name: 'rmv_checks_total',
  help: 'Total number of appointment checks'
});

const appointmentsFound = new promClient.Counter({
  name: 'rmv_appointments_found_total',
  help: 'Total appointments found'
});

const notificationsSent = new promClient.Counter({
  name: 'rmv_notifications_sent_total',
  help: 'Total notifications sent',
  labelNames: ['type']
});

// Expose metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});
```

## 🚨 Alerts & Monitoring

### Uptime Monitoring

Use UptimeRobot or Pingdom:

1. Monitor `/health` endpoint every 5 minutes
2. Alert if service is down for > 10 minutes
3. Check response time > 5 seconds

### Error Alerting

```javascript
// Sentry integration
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'your-sentry-dsn',
  environment: process.env.NODE_ENV
});

// Capture errors
process.on('unhandledRejection', (err) => {
  Sentry.captureException(err);
  logger.error('Unhandled rejection:', err);
});
```

## 💰 Cost Optimization

### Estimated Monthly Costs

- **VPS Hosting**: $5-20/month (DigitalOcean/Linode)
- **Email**: Free (Gmail)
- **SMS**: $0.0075/message (Twilio)
- **Domain**: $12/year
- **SSL**: Free (Let's Encrypt)

### Cost Reduction Tips

1. Use free tier services where possible
2. Implement caching to reduce API calls
3. Batch notifications to reduce SMS costs
4. Use webhooks instead of polling where supported

## 📝 Legal Considerations

### Terms of Service

Ensure compliance with:
1. RMV website terms of service
2. Anti-bot measures and rate limits
3. Data protection regulations (GDPR/CCPA)
4. User consent for data storage

### Disclaimer Template

```html
<div class="disclaimer">
  <h3>Disclaimer</h3>
  <p>This service is not affiliated with the Massachusetts RMV.
  Use at your own risk. We are not responsible for any missed
  appointments or booking errors. Always verify appointments
  directly with the RMV.</p>
</div>
```

## 🎉 Conclusion

This comprehensive RMV monitoring system provides:

✅ Automated appointment checking
✅ Multi-channel notifications
✅ Auto-booking capabilities
✅ User-friendly interface
✅ Scalable architecture
✅ Production-ready deployment

The system will run continuously until September 3, 2025, checking for appointments based on user preferences and sending real-time notifications when matches are found.

For support or contributions, please visit the GitHub repository or contact the development team.

---

**Remember**: Always respect rate limits and terms of service when scraping websites. Consider reaching out to the RMV for official API access if planning large-scale deployment.