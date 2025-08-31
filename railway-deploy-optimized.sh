#!/bin/bash

echo "🚀 RMV Monitor - Optimized Railway Deployment"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Please run this script from the appv1 directory${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Pre-deployment optimizations...${NC}"

# Clean node_modules to avoid conflicts
if [ -d "node_modules" ]; then
    echo "🧹 Cleaning node_modules..."
    rm -rf node_modules
fi

# Clean npm cache
echo "🗑️ Cleaning npm cache..."
npm cache clean --force

echo ""
echo -e "${BLUE}🔐 Step 1: Railway login${NC}"
railway login

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Login failed. Please try again.${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🏗️ Step 2: Initialize or link Railway project${NC}"

# Check if already linked
if [ -f ".railway/project.json" ]; then
    echo "📂 Railway project already linked"
else
    echo "🔗 Linking to Railway project..."
    railway init rmv-monitor-app
fi

echo ""
echo -e "${BLUE}⚙️ Step 3: Set environment variables${NC}"

# Set critical variables for successful build
echo "Setting Puppeteer configuration..."
railway variables set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
railway variables set PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
railway variables set NODE_ENV=production

echo ""
echo -e "${YELLOW}📝 You need to set these variables manually:${NC}"
echo "   railway variables set EMAIL_USER=your-email@gmail.com"
echo "   railway variables set EMAIL_PASS=your-16-digit-app-password"
echo ""
echo -e "${YELLOW}Optional (for SMS notifications):${NC}"
echo "   railway variables set TWILIO_ACCOUNT_SID=your-sid"
echo "   railway variables set TWILIO_AUTH_TOKEN=your-token"
echo "   railway variables set TWILIO_FROM_NUMBER=+1234567890"
echo ""

read -p "Have you set EMAIL_USER and EMAIL_PASS? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⏸️ Please set your email credentials first, then run this script again.${NC}"
    echo ""
    echo "To set them now:"
    echo "railway variables set EMAIL_USER=your-email@gmail.com"
    echo "railway variables set EMAIL_PASS=your-app-password"
    exit 0
fi

echo ""
echo -e "${BLUE}🚀 Step 4: Deploy with optimized settings${NC}"

# Deploy with verbose logging
echo "Deploying to Railway..."
railway up --verbose

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo ""
    
    # Get the URL
    URL=$(railway status --json | grep -o '"url":"[^"]*' | sed 's/"url":"//')
    if [ ! -z "$URL" ]; then
        echo -e "${GREEN}🌐 Your app is live at: $URL${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}📋 Useful Railway commands:${NC}"
    echo "   railway logs           - View application logs"
    echo "   railway open           - Open app in browser"
    echo "   railway status         - Check deployment status"
    echo "   railway variables      - View environment variables"
    echo ""
    echo -e "${BLUE}🔍 Testing your deployment:${NC}"
    echo "   curl $URL/health"
    echo ""
    
else
    echo ""
    echo -e "${RED}❌ Deployment failed!${NC}"
    echo ""
    echo -e "${YELLOW}🔧 Troubleshooting steps:${NC}"
    echo "1. Check build logs: railway logs --build"
    echo "2. Verify environment variables: railway variables"
    echo "3. Try deploying again: railway up"
    echo ""
    echo -e "${YELLOW}Common issues:${NC}"
    echo "- Build timeout: Usually caused by Puppeteer downloading Chromium"
    echo "- Memory limits: Railway free tier has memory constraints"
    echo "- Missing environment variables: EMAIL_USER and EMAIL_PASS required"
    
    exit 1
fi
