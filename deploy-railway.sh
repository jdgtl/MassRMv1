#!/bin/bash

echo "🚀 Starting fresh Railway deployment for MassRMV..."

# 1. Initialize Railway project
echo "1. Initializing Railway project..."
railway login
railway init

# 2. Set critical environment variables
echo "2. Setting environment variables..."
railway variables set NODE_ENV=production
railway variables set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
railway variables set PUPPETEER_EXECUTABLE_PATH=""
railway variables set CHECK_INTERVAL=5
railway variables set RMV_BASE_URL=https://atlas-myrmv.massdot.state.ma.us/myrmv

# 3. Deploy
echo "3. Deploying to Railway..."
railway up

echo "✅ Deployment complete!"
echo ""
echo "🔧 Remember to set these environment variables in Railway dashboard:"
echo "   - EMAIL_USER (your Gmail address)"
echo "   - EMAIL_PASS (your 16-digit app password)"
echo "   - TWILIO_ACCOUNT_SID (if using SMS)"
echo "   - TWILIO_AUTH_TOKEN (if using SMS)"
echo "   - TWILIO_FROM_NUMBER (if using SMS)"
echo ""
echo "📱 Check your deployment at: railway dashboard"
