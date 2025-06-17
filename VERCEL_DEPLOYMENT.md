# Vercel Deployment Guide

## ✅ **Vercel Compatibility Fixes Applied**

Your bot is now fully compatible with Vercel! Here are the changes made:

### **1. Removed `app.listen()`**
- ✅ `app.listen()` now only runs in local development
- ✅ Added `module.exports = app` for Vercel
- ✅ Created `/api/index.js` entry point

### **2. Fixed `setInterval` Issues**
- ✅ Session cleanup `setInterval` disabled in serverless
- ✅ Cleanup now happens per request in Vercel

### **3. Updated `vercel.json`**
- ✅ Points to `/api/index.js` entry point
- ✅ Added 30-second timeout for webhook responses
- ✅ Set production environment

## 🚀 **Deployment Steps**

### **1. Environment Variables**
Set these in your Vercel dashboard:

```bash
LARK_APP_ID=your_app_id
LARK_APP_SECRET=your_app_secret
LARK_VERIFICATION_TOKEN=your_verification_token
LARK_ENCRYPT_KEY=your_encrypt_key
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
OPENAI_API_KEY=your_openai_key
LARK_SUPPORT_GROUP_ID=your_support_group_id
```

### **2. Deploy to Vercel**

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Deploy
vercel --prod
```

### **3. Update Lark Webhook URL**
After deployment, update your Lark app webhook URL to:
```
https://your-vercel-domain.vercel.app/webhook
```

### **4. Test Deployment**

Test these endpoints after deployment:

```bash
# Health check
curl https://your-domain.vercel.app/health

# Environment check
curl https://your-domain.vercel.app/env-check

# Analytics
curl https://your-domain.vercel.app/api/analytics/dashboard
```

## 🔧 **File Structure for Vercel**

```
your-project/
├── api/
│   └── index.js          # Vercel entry point
├── server.js             # Main Express app
├── message-logger.js     # Message tracking (Vercel compatible)
├── analytics-api.js      # Analytics endpoints
├── vercel.json          # Vercel configuration
└── package.json         # Dependencies
```

## 📊 **What Works in Vercel**

✅ **Message Handling**: All Lark webhook processing  
✅ **Message Logging**: Complete analytics tracking  
✅ **Bot Responses**: AI-generated responses sent to Lark  
✅ **Ticket Creation**: Support ticket workflow  
✅ **Analytics API**: All `/api/analytics/*` endpoints  
✅ **Database Operations**: Supabase integration  
✅ **User Info Fetching**: Lark API calls for user details  

## 🚫 **Vercel Limitations**

- **No persistent intervals**: Session cleanup happens per request
- **30-second timeout**: Functions must complete within 30 seconds
- **Stateless**: No shared memory between function calls

## 🛠️ **Troubleshooting**

### **Bot Not Responding**
1. Check environment variables in Vercel dashboard
2. Verify Lark webhook URL points to your Vercel domain
3. Check Vercel function logs for errors

### **User Names Not Showing**
1. Verify `LARK_APP_ID` and `LARK_APP_SECRET` are set
2. Check Lark app permissions in Lark Developer Console
3. Ensure bot has `contact:user.base:read` permission

### **Message Logging Not Working**
1. Verify Supabase credentials are set
2. Check that `message_logs` table exists
3. Run the permission fix SQL in Supabase

## 📞 **Quick Test Commands**

```bash
# Test production after deployment
node test-production-endpoints.js https://your-domain.vercel.app

# Check if message logging works
curl "https://your-domain.vercel.app/api/analytics/dashboard"
```

## 🎉 **You're Ready!**

Your bot should now work perfectly in Vercel with:
- ✅ Messages being logged to database
- ✅ Bot responses appearing in chat
- ✅ User names properly fetched
- ✅ Full analytics available via API

Deploy and test! 🚀 