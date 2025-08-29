# Deploy RMV Monitor v1 to Railway

## Quick Deploy (5 minutes)

1. **Run the deployment script**:
   ```bash
   cd appv1
   ./railway-deploy.sh
   ```

2. **Manual steps** (if you prefer):
   ```bash
   cd appv1
   railway login    # Opens browser for login
   railway init     # Initialize project
   railway up       # Deploy
   ```

## Set Environment Variables

After deployment, set these in Railway dashboard or CLI:

### Required (for email notifications):
```bash
railway variables set EMAIL_USER=your-email@gmail.com
railway variables set EMAIL_PASS=your-gmail-app-password
```

### Optional (for SMS notifications):
```bash
railway variables set TWILIO_ACCOUNT_SID=your-twilio-sid
railway variables set TWILIO_AUTH_TOKEN=your-twilio-token  
railway variables set TWILIO_FROM_NUMBER=+1234567890
```

## Gmail App Password Setup

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Factor Authentication
3. Go to "App passwords"
4. Generate password for "Mail"
5. Use this password for `EMAIL_PASS`

## Post-Deployment

- **View logs**: `railway logs`
- **Open in browser**: `railway open`
- **Check status**: `railway status`
- **Add custom domain**: Railway Dashboard → Settings → Domains

## Your App Will Be Live At:
`https://your-project-name.up.railway.app`

Railway automatically provides HTTPS and handles deployment!