#!/bin/bash

# RMV Monitor Demo Script
echo "🚗 RMV Appointment Monitor - Demo Script"
echo "========================================"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if server is running
echo -e "${BLUE}🔍 Checking if server is running...${NC}"
if curl -s http://localhost:3000/health > /dev/null; then
    echo -e "${GREEN}✅ Server is running on port 3000${NC}"
else
    echo -e "${YELLOW}⚠️  Starting server...${NC}"
    node rmv-monitor-service-test.js &
    SERVER_PID=$!
    echo "Server PID: $SERVER_PID"
    sleep 3
fi

echo
echo -e "${BLUE}🧪 Running system tests...${NC}"
node test-suite.js

echo
echo -e "${BLUE}🌐 Demo endpoints:${NC}"
echo -e "  • Web Interface:    ${GREEN}http://localhost:3000${NC}"
echo -e "  • Original UI:      ${GREEN}http://localhost:3000/original${NC}"
echo -e "  • Health Check:     ${GREEN}http://localhost:3000/health${NC}"
echo -e "  • Test API:         ${GREEN}http://localhost:3000/api/test${NC}"

echo
echo -e "${BLUE}📊 Quick API Tests:${NC}"

echo -n "  • Health endpoint: "
if curl -s http://localhost:3000/health | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
fi

echo -n "  • Appointment check: "
if curl -s -X POST http://localhost:3000/api/check-appointments | grep -q '"success":true'; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
fi

echo
echo -e "${YELLOW}🎯 Demo Commands:${NC}"
echo "  curl http://localhost:3000/health"
echo "  curl -X POST http://localhost:3000/api/check-appointments"
echo "  open http://localhost:3000"

echo
echo -e "${GREEN}🚀 RMV Monitor is ready for testing!${NC}"
echo -e "${BLUE}Press Ctrl+C to stop the demo${NC}"