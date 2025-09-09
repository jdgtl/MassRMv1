module.exports = {
  apps: [{
    name: 'rmv-monitor',
    script: 'rmv-api-server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
    // Note: Health check disabled for Railway deployment
    // Railway handles health checks via the web service itself
  }]
};
