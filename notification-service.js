// Ultra-low-cost multi-provider notification service
// Leverages multiple free tiers for maximum cost efficiency

class NotificationService {
  constructor() {
    // Free tier limits per provider (daily/monthly reset)
    this.providers = {
      email: {
        resend: { limit: 100, resetType: 'daily', used: 0, apiKey: null },
        mailchannels: { limit: 100, resetType: 'daily', used: 0, apiKey: null },
        sendgrid: { limit: 100, resetType: 'daily', used: 0, apiKey: null },
        postmark: { limit: 100, resetType: 'monthly', used: 0, apiKey: null },
        mailgun: { limit: 49, resetType: 'daily', used: 0, apiKey: null }, // Conservative limit
        elasticemail: { limit: 100, resetType: 'daily', used: 0, apiKey: null }
      },
      sms: {
        twilio: { limit: 2000, resetType: 'trial', used: 0, apiKey: null },
        vonage: { limit: 200, resetType: 'trial', used: 0, apiKey: null },
        textbelt: { limit: 1, resetType: 'daily', used: 0, apiKey: 'textbelt' }
      }
    };
    
    this.cfKvNamespace = null; // Will be set by Cloudflare Worker
    this.lastResetCheck = new Date();
  }

  // Initialize with API keys and Cloudflare KV
  async initialize(apiKeys, kvNamespace) {
    this.cfKvNamespace = kvNamespace;
    
    // Set API keys
    Object.keys(apiKeys.email || {}).forEach(provider => {
      if (this.providers.email[provider]) {
        this.providers.email[provider].apiKey = apiKeys.email[provider];
      }
    });
    
    Object.keys(apiKeys.sms || {}).forEach(provider => {
      if (this.providers.sms[provider]) {
        this.providers.sms[provider].apiKey = apiKeys.sms[provider];
      }
    });
    
    // Load usage data from KV
    await this.loadUsageData();
  }

  // Load current usage data from Cloudflare KV
  async loadUsageData() {
    try {
      const usageData = await this.cfKvNamespace.get('provider_usage');
      if (usageData) {
        const parsed = JSON.parse(usageData);
        
        // Update usage counts
        Object.keys(this.providers.email).forEach(provider => {
          if (parsed.email && parsed.email[provider]) {
            this.providers.email[provider].used = parsed.email[provider].used || 0;
          }
        });
        
        Object.keys(this.providers.sms).forEach(provider => {
          if (parsed.sms && parsed.sms[provider]) {
            this.providers.sms[provider].used = parsed.sms[provider].used || 0;
          }
        });
      }
      
      // Check if reset is needed
      await this.checkAndResetUsage();
    } catch (error) {
      console.error('Failed to load usage data:', error);
    }
  }

  // Save usage data to Cloudflare KV
  async saveUsageData() {
    try {
      const usageData = {
        email: {},
        sms: {},
        lastUpdated: new Date().toISOString()
      };
      
      Object.keys(this.providers.email).forEach(provider => {
        usageData.email[provider] = { used: this.providers.email[provider].used };
      });
      
      Object.keys(this.providers.sms).forEach(provider => {
        usageData.sms[provider] = { used: this.providers.sms[provider].used };
      });
      
      await this.cfKvNamespace.put('provider_usage', JSON.stringify(usageData));
    } catch (error) {
      console.error('Failed to save usage data:', error);
    }
  }

  // Check and reset usage based on provider reset schedules
  async checkAndResetUsage() {
    const now = new Date();
    const today = now.toDateString();
    const lastCheck = this.lastResetCheck.toDateString();
    
    // Daily reset check
    if (today !== lastCheck) {
      Object.keys(this.providers.email).forEach(provider => {
        if (this.providers.email[provider].resetType === 'daily') {
          this.providers.email[provider].used = 0;
        }
      });
      
      Object.keys(this.providers.sms).forEach(provider => {
        if (this.providers.sms[provider].resetType === 'daily') {
          this.providers.sms[provider].used = 0;
        }
      });
      
      this.lastResetCheck = now;
    }
    
    // Monthly reset check (first day of month)
    if (now.getDate() === 1 && now.getMonth() !== this.lastResetCheck.getMonth()) {
      Object.keys(this.providers.email).forEach(provider => {
        if (this.providers.email[provider].resetType === 'monthly') {
          this.providers.email[provider].used = 0;
        }
      });
    }
  }

  // Get best available email provider
  getBestEmailProvider() {
    const availableProviders = Object.entries(this.providers.email)
      .filter(([name, config]) => {
        return config.apiKey && config.used < config.limit;
      })
      .sort((a, b) => {
        // Prioritize providers with more remaining capacity
        const aRemaining = a[1].limit - a[1].used;
        const bRemaining = b[1].limit - b[1].used;
        return bRemaining - aRemaining;
      });
    
    return availableProviders.length > 0 ? availableProviders[0][0] : null;
  }

  // Get best available SMS provider
  getBestSMSProvider() {
    const availableProviders = Object.entries(this.providers.sms)
      .filter(([name, config]) => {
        return config.apiKey && config.used < config.limit;
      })
      .sort((a, b) => {
        // Prioritize trial credits (more capacity) over daily limits
        if (a[1].resetType === 'trial' && b[1].resetType !== 'trial') return -1;
        if (b[1].resetType === 'trial' && a[1].resetType !== 'trial') return 1;
        
        const aRemaining = a[1].limit - a[1].used;
        const bRemaining = b[1].limit - b[1].used;
        return bRemaining - aRemaining;
      });
    
    return availableProviders.length > 0 ? availableProviders[0][0] : null;
  }

  // Send email notification
  async sendEmail(to, subject, htmlContent, textContent) {
    const provider = this.getBestEmailProvider();
    if (!provider) {
      throw new Error('No email providers available - all limits exceeded');
    }

    try {
      let success = false;
      
      switch (provider) {
        case 'resend':
          success = await this.sendResendEmail(to, subject, htmlContent, textContent);
          break;
        case 'mailchannels':
          success = await this.sendMailChannelsEmail(to, subject, htmlContent, textContent);
          break;
        case 'sendgrid':
          success = await this.sendSendGridEmail(to, subject, htmlContent, textContent);
          break;
        case 'postmark':
          success = await this.sendPostmarkEmail(to, subject, htmlContent, textContent);
          break;
        case 'mailgun':
          success = await this.sendMailgunEmail(to, subject, htmlContent, textContent);
          break;
        case 'elasticemail':
          success = await this.sendElasticEmail(to, subject, htmlContent, textContent);
          break;
      }
      
      if (success) {
        this.providers.email[provider].used++;
        await this.saveUsageData();
        return { success: true, provider };
      }
      
      throw new Error(`Failed to send email via ${provider}`);
    } catch (error) {
      console.error(`Email send failed with ${provider}:`, error);
      throw error;
    }
  }

  // Send SMS notification
  async sendSMS(to, message) {
    const provider = this.getBestSMSProvider();
    if (!provider) {
      throw new Error('No SMS providers available - all limits exceeded');
    }

    try {
      let success = false;
      
      switch (provider) {
        case 'twilio':
          success = await this.sendTwilioSMS(to, message);
          break;
        case 'vonage':
          success = await this.sendVonageSMS(to, message);
          break;
        case 'textbelt':
          success = await this.sendTextBeltSMS(to, message);
          break;
      }
      
      if (success) {
        this.providers.sms[provider].used++;
        await this.saveUsageData();
        return { success: true, provider };
      }
      
      throw new Error(`Failed to send SMS via ${provider}`);
    } catch (error) {
      console.error(`SMS send failed with ${provider}:`, error);
      throw error;
    }
  }

  // Individual provider implementations
  async sendResendEmail(to, subject, html, text) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.providers.email.resend.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'RMV Monitor <noreply@yourdomain.com>',
        to: [to],
        subject,
        html,
        text
      })
    });
    
    return response.ok;
  }

  async sendMailChannelsEmail(to, subject, html, text) {
    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: to }]
        }],
        from: { email: 'noreply@yourdomain.com', name: 'RMV Monitor' },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html }
        ]
      })
    });
    
    return response.ok;
  }

  async sendTwilioSMS(to, message) {
    const accountSid = this.providers.sms.twilio.accountSid;
    const authToken = this.providers.sms.twilio.apiKey;
    const from = this.providers.sms.twilio.from;
    
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: to,
        From: from,
        Body: message
      })
    });
    
    return response.ok;
  }

  async sendTextBeltSMS(to, message) {
    const response = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone: to,
        message,
        key: 'textbelt'
      })
    });
    
    const result = await response.json();
    return result.success;
  }

  // Generate mobile-optimized email template
  generateEmailTemplate(appointments, rmvUrl) {
    const appointmentList = appointments.map(apt => 
      `<li style="padding: 8px 0; border-bottom: 1px solid #eee;">
        <strong>${apt.date}</strong> at <strong>${apt.time}</strong><br>
        <small style="color: #666;">${apt.locationName}</small>
      </li>`
    ).join('');

    return {
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d73502; margin: 0 0 20px 0;">🚗 New RMV Appointments Available!</h2>
          
          <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 12px 0; font-size: 16px;">Found <strong>${appointments.length}</strong> new appointment${appointments.length > 1 ? 's' : ''}:</p>
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${appointmentList}
            </ul>
          </div>
          
          <div style="text-align: center; margin: 24px 0;">
            <a href="${rmvUrl}" style="background: #d73502; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              📅 BOOK NOW
            </a>
          </div>
          
          <p style="font-size: 12px; color: #666; text-align: center; margin-top: 24px;">
            ⚡ Act fast! RMV appointments fill up quickly.<br>
            This link expires in 5 days or after booking.
          </p>
        </div>
      `,
      text: `🚗 New RMV Appointments Available!

Found ${appointments.length} new appointment${appointments.length > 1 ? 's' : ''}:

${appointments.map(apt => `• ${apt.date} at ${apt.time} (${apt.locationName})`).join('\n')}

📅 BOOK NOW: ${rmvUrl}

⚡ Act fast! RMV appointments fill up quickly.
This link expires in 5 days or after booking.`
    };
  }

  // Generate SMS message
  generateSMSMessage(appointments, rmvUrl) {
    if (appointments.length === 1) {
      return `🚗 RMV Alert: New appointment ${appointments[0].date} at ${appointments[0].time} (${appointments[0].locationName}). Book now: ${rmvUrl}`;
    }
    
    return `🚗 RMV Alert: ${appointments.length} new appointments available! Earliest: ${appointments[0].date} at ${appointments[0].time}. Book now: ${rmvUrl}`;
  }

  // Get usage statistics
  getUsageStats() {
    const emailStats = Object.entries(this.providers.email).map(([name, config]) => ({
      provider: name,
      used: config.used,
      limit: config.limit,
      remaining: config.limit - config.used,
      resetType: config.resetType
    }));

    const smsStats = Object.entries(this.providers.sms).map(([name, config]) => ({
      provider: name,
      used: config.used,
      limit: config.limit,
      remaining: config.limit - config.used,
      resetType: config.resetType
    }));

    return { email: emailStats, sms: smsStats };
  }
}

module.exports = { NotificationService };