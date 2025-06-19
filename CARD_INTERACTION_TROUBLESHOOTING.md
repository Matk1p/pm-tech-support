# Card Interaction Troubleshooting - Error 200340

## 🚨 Error Analysis

Error code **200340** in Lark typically indicates:
- Webhook URL not properly configured for card interactions
- Missing or incorrect permissions for interactive cards
- Card format or structure issues
- Webhook response problems

## 🔧 **Fix Steps**

### **Step 1: Check Lark App Configuration**

In your Lark Developer Console:

1. **Go to your app's Event Subscriptions**
2. **Add Card Action Event**:
   - Event Type: `card.action.trigger`
   - Or legacy: `interactive_card`

3. **Configure Request URL**:
   ```
   https://your-domain.com/lark/events
   ```
   OR if using ngrok for testing:
   ```
   https://your-ngrok-url.ngrok.io/lark/events
   ```

4. **Enable Required Permissions**:
   - `im:message`
   - `im:message:send_as_bot`
   - `interactive:card` (if available)

### **Step 2: Verify Webhook Setup**

Test your webhook endpoint:

```bash
# Test that your webhook is accessible
curl -X POST https://your-domain.com/lark/events \
  -H "Content-Type: application/json" \
  -d '{"test": "webhook"}'
```

### **Step 3: Debug Card Interactions**

Run the debug server to see what data Lark is sending:

```bash
# In a separate terminal
node debug-card-interactions.js
```

Then update your Lark app's webhook URL temporarily to:
```
https://your-ngrok-url.ngrok.io/debug-webhook
```

Click a button and check the console output.

### **Step 4: Test Card Format**

Try sending a simpler card format first:

```bash
# Test simple card
curl -X POST http://localhost:3001/test-simple-card \
  -H "Content-Type: application/json" \
  -d '{"chatId": "your_chat_id"}'
```

## 🔍 **Common Issues & Solutions**

### **Issue 1: Wrong Event Type**
- **Problem**: Webhook not receiving card events
- **Solution**: Ensure `card.action.trigger` is configured in Lark Console

### **Issue 2: Missing Permissions**
- **Problem**: App can't handle interactive elements
- **Solution**: Add interactive card permissions in app settings

### **Issue 3: Wrong Response Format**
- **Problem**: Webhook returns wrong response to Lark
- **Solution**: Always return `{"success": true}` or similar JSON

### **Issue 4: HTTPS Required**
- **Problem**: Card interactions only work with HTTPS
- **Solution**: Use ngrok for local testing or deploy to HTTPS endpoint

### **Issue 5: Card JSON Format**
- **Problem**: Invalid card structure
- **Solution**: Validate card JSON against Lark specifications

## 🧪 **Debug Commands**

### Test Page Buttons:
```bash
curl -X POST http://localhost:3001/test-page-buttons \
  -H "Content-Type: application/json" \
  -d '{"chatId": "oc_your_chat_id"}'
```

### Check Webhook Status:
```bash
curl http://localhost:3001/health
```

### Monitor Logs:
```bash
# Watch server logs for card interaction attempts
tail -f your-app-logs.log | grep "card interaction"
```

## 📋 **Lark App Configuration Checklist**

- [ ] **Event Subscriptions** configured
- [ ] **card.action.trigger** event enabled
- [ ] **Webhook URL** points to your `/lark/events` endpoint
- [ ] **HTTPS** enabled (required for production)
- [ ] **Bot permissions** include messaging and interactive features
- [ ] **URL verification** completed successfully

## 🔄 **Alternative Approaches**

If card interactions still don't work, try:

### **Option 1: Text-based Menu**
Fall back to numbered text responses:
```
1. 📊 Dashboard
2. 💼 Jobs  
3. 👥 Candidates
...
Please reply with a number (1-6)
```

### **Option 2: Simple Buttons**
Use basic button format instead of complex cards:
```javascript
{
  "tag": "action",
  "actions": [{
    "tag": "button",
    "text": {"tag": "plain_text", "content": "Dashboard"},
    "value": "dashboard",
    "type": "primary"
  }]
}
```

### **Option 3: Rich Text with Links**
Use rich text messages with clickable links if supported.

## 🚀 **Quick Test**

1. **Restart your server**
2. **Send a greeting** to the bot: `hi`
3. **Check server logs** for any errors
4. **If buttons appear but don't work**, check Lark app configuration
5. **If no buttons appear**, check card sending logic

## 📞 **Need Help?**

If the issue persists:
1. Check Lark developer documentation for latest card interaction format
2. Verify your app has the latest API version enabled
3. Contact Lark support with error code 200340 and your app ID

## 🎯 **Expected Flow**

```
User clicks button → Lark sends webhook → Server processes → Response sent → Action completed
```

If any step fails, the error 200340 can occur. 