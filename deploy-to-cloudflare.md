# Deploy RMV Monitor v1 to Cloudflare

## Quick Cloudflare Deployment (5 minutes)

### 1. Deploy Frontend to Cloudflare Pages
```bash
cd appv1
# Create a simple build for Pages
npm run build:pages
npx wrangler pages deploy public --project-name rmv-monitor-v1
```

### 2. Deploy Backend as Cloudflare Worker
```bash
# Create worker version of the backend
npm run build:worker
npx wrangler deploy --name rmv-monitor-api-v1
```

### 3. Update Frontend API Endpoint
Update `public/index.html` to point to your worker:
```javascript
const API_BASE = 'https://rmv-monitor-api-v1.your-subdomain.workers.dev';
```

## Alternative: Railway (1-Click Deploy)

Railway offers the simplest Node.js deployment:

1. **Connect GitHub** (if repo is public)
2. **One-click deploy**: Railway auto-detects Node.js
3. **Custom domain**: Add your domain in Railway dashboard

```bash
# If no GitHub repo, deploy directly:
npm install -g @railway/cli
railway login
railway init
railway up
```

## Alternative: DigitalOcean App Platform

```bash
# Create app.yaml
cat > app.yaml << EOF
name: rmv-monitor-v1
services:
- name: api
  source_dir: /
  github:
    repo: your-username/rmv-monitor
    branch: main
  run_command: npm start
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  http_port: 3000
  routes:
  - path: /
EOF

# Deploy
doctl apps create --spec app.yaml
```

## Environment Variables Needed

For any deployment, set these environment variables:
```
PORT=3000
NODE_ENV=production
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
```

## Custom Domain Setup

Once deployed, you can add a custom domain:
- **Cloudflare**: Built-in custom domains
- **Railway**: Custom domains in dashboard  
- **DigitalOcean**: Custom domains with automatic SSL

## Quick Start Recommendation: Railway

For fastest public deployment:
```bash
npm install -g @railway/cli
cd appv1
railway login
railway init
railway up
```

Railway will:
- ✅ Auto-detect Node.js app
- ✅ Provide HTTPS domain immediately  
- ✅ Handle environment variables
- ✅ Auto-deploy on git push
- ✅ Free tier available