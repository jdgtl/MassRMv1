#!/bin/zsh

# Quick Railway deployment fix for timeouts

echo "🔧 Railway Timeout Fix - Quick Deploy"
echo "===================================="

# Set Puppeteer to use system Chrome (prevents download timeout)
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Clean install without dev dependencies
echo "📦 Installing production dependencies only..."
npm ci --production --no-optional

# Set Railway variables to prevent Chromium download
echo "⚙️ Setting Railway environment variables..."
railway variables set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
railway variables set NODE_ENV=production

# Quick deploy
echo "🚀 Deploying..."
railway up

echo "✅ Done! Check 'railway logs' if there are issues."
