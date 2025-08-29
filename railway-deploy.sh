#!/bin/bash

echo "🚀 RMV Monitor v1 - Railway Deployment Script"
echo "============================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the appv1 directory"
    exit 1
fi

echo "📋 Deployment Steps:"
echo "1. Railway login (opens browser)"
echo "2. Initialize Railway project"
echo "3. Set environment variables"
echo "4. Deploy application"
echo ""

# Step 1: Login
echo "🔐 Step 1: Logging in to Railway..."
railway login

# Check if login was successful
if [ $? -ne 0 ]; then
    echo "❌ Login failed. Please try again."
    exit 1
fi

# Step 2: Initialize project
echo "🏗️ Step 2: Initializing Railway project..."
railway init

# Step 3: Set environment variables
echo "⚙️ Step 3: Setting environment variables..."
echo ""
echo "🔧 You'll need to set these environment variables in Railway:"
echo "   - EMAIL_USER (your Gmail address)"
echo "   - EMAIL_PASS (Gmail App Password)"
echo "   - TWILIO_ACCOUNT_SID (optional, for SMS)"
echo "   - TWILIO_AUTH_TOKEN (optional, for SMS)"
echo "   - TWILIO_FROM_NUMBER (optional, for SMS)"
echo ""
echo "Setting NODE_ENV to production..."
railway variables set NODE_ENV=production

echo "📝 To set other variables, use:"
echo "   railway variables set EMAIL_USER=your-email@gmail.com"
echo "   railway variables set EMAIL_PASS=your-app-password"
echo ""

# Step 4: Deploy
echo "🚀 Step 4: Deploying to Railway..."
railway up

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo "🌐 Your app should be live at the Railway URL shown above"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Set your environment variables: railway variables set KEY=VALUE"
    echo "   2. Check logs: railway logs"
    echo "   3. Open in browser: railway open"
    echo ""
    echo "🔧 To add a custom domain:"
    echo "   1. Go to Railway dashboard"
    echo "   2. Click on your project"
    echo "   3. Go to Settings > Domains"
    echo "   4. Add your custom domain"
else
    echo "❌ Deployment failed. Check the error messages above."
fi