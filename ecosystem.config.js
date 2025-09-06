module.exports = {
  apps: [{
    name: 'rmv-monitor',
    script: 'rmv-monitor-service.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    // Health check configuration
    health_check_url: 'http://localhost:3000/api/health',
    health_check_interval: 60000, // 1 minute
    health_check_timeout: 10000,  // 10 seconds
    // Restart on unhealthy responses
    restart_on_health_check_fail: true
  }]
};