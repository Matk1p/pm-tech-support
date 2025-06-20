# 🔄 Lark Bot Relay Service Deployment

This relay service solves Vercel's timeout issues by handling heavy processing in a separate always-on service.

## 🏗️ Architecture

```
Lark Webhooks → Vercel (instant response) → Relay Service → Heavy Processing → Direct to Lark
```

## 🚀 Deployment Options

### Option 1: Railway (Recommended)
1. Go to [Railway.app](https://railway.app)
2. Connect your GitHub repository
3. Deploy the relay service
4. Set environment variables
5. Get your Railway URL (e.g., `https://your-service.railway.app`)

### Option 2: Render
1. Go to [Render.com](https://render.com)
2. Create new Web Service
3. Connect repository
4. Set build command: `npm install`
5. Set start command: `npm start`

### Option 3: DigitalOcean App Platform
1. Create new app
2. Connect GitHub repo
3. Set build/run commands
4. Deploy

## 🔧 Environment Variables

Set these in your relay service:

```env
LARK_APP_ID=your_lark_app_id
LARK_APP_SECRET=your_lark_app_secret
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
PORT=3001
```

## 📝 Vercel Configuration

Update your Vercel environment variables:

```env
RELAY_SERVICE_URL=https://your-relay-service.railway.app
```

## 🔄 How to Switch to Relay Architecture

### Step 1: Deploy Relay Service
1. Copy `relay-service.js` to new repository
2. Deploy to Railway/Render/etc.
3. Set environment variables
4. Test with `/health` endpoint

### Step 2: Update Lark Webhook URL
1. Go to Lark Developer Console
2. Change webhook URL from Vercel to your relay service:
   - Old: `https://your-app.vercel.app/lark/events`
   - New: `https://your-relay-service.railway.app/lark/events`

### Step 3: Test the Flow
1. Send message to bot
2. Check relay service logs
3. Verify responses work without timeouts

## 🎯 Benefits

✅ **No timeout limits** - Relay service can run indefinitely  
✅ **Better reliability** - Always-on service, not serverless  
✅ **Faster responses** - Immediate webhook acknowledgment  
✅ **Full processing** - Complete AI + card interactions  
✅ **Cost effective** - Railway/Render free tiers available  

## 🔧 Alternative: Queue-Based Solution

If you want to keep Vercel active, you can use a queue:

```javascript
// Vercel handler - add to queue
export default async function handler(req, res) {
  await addToQueue(req.body);
  res.json({ success: true });
}

// Relay service - process queue
setInterval(async () => {
  const items = await getFromQueue();
  for (const item of items) {
    await processLarkEvent(item);
  }
}, 1000);
```

## 📊 Monitoring

Your relay service includes a health check:

```bash
curl https://your-relay-service.com/health
```

Response:
```json
{
  "status": "healthy",
  "queue": 0,
  "processing": false,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🚨 Troubleshooting

**Issue**: Relay service not receiving webhooks  
**Solution**: Check Lark webhook URL configuration

**Issue**: Still getting timeouts  
**Solution**: Ensure Lark webhook points to relay service, not Vercel

**Issue**: Messages not sending  
**Solution**: Check Lark credentials in relay service environment

## 💡 Pro Tips

1. **Use Railway** - Best for Node.js apps, automatic deployments
2. **Monitor logs** - Both Vercel and relay service logs
3. **Test locally** - Run relay service locally first: `npm run dev`
4. **Gradual migration** - Test with one chat first before full switch 