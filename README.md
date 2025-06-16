# PM-Next Lark Bot

A smart Lark bot that helps users navigate and understand the PM-Next Recruitment Management System using OpenAI.

## Features

- 🤖 **AI-Powered Responses**: Uses OpenAI GPT-4 to provide intelligent answers about PM-Next
- 💬 **Multiple Interaction Modes**: Supports both direct messages and @ mentions
- 📚 **Comprehensive Knowledge Base**: Pre-loaded with PM-Next application knowledge
- 🔄 **Real-time Responses**: Instant replies to user queries
- 🛡️ **Secure**: Proper authentication and error handling

## 🚀 Key Features

- 🤖 **Intelligent Support Bot**: AI-powered responses using GPT-4
- 🎫 **Automated Ticket Creation**: Seamless support request handling
- 📚 **Comprehensive Knowledge Base**: Pre-loaded with PM-Next application knowledge
- 📈 **Performance Analytics**: Request tracking and response optimization
- 🔄 **Context-Aware Conversations**: Maintains conversation history
- ⚡ **Response Caching**: Optimized performance for common questions
- 🎯 **Smart Escalation**: Automatic ticket creation when AI can't help
- 🧠 **Self-Improving Knowledge Base**: Automatically updates from resolved tickets

### 🔄 Auto-Updating Knowledge Base

The system now automatically learns from support interactions:

**How it works:**
1. When support team members reply to tickets with solutions, the system detects solution keywords
2. AI extracts a clean Q&A pair from the original ticket and solution
3. The knowledge base is automatically updated with the new information
4. Future similar questions will be answered automatically without creating tickets

**Triggering automatic updates:**
Reply to support tickets using phrases like:
- "Solution: [your solution]"
- "Fix: [steps to resolve]" 
- "To resolve this: [solution]"
- "Here's how to fix: [steps]"
- Include "add to kb" or "for future reference" in your reply

**Manual knowledge base updates:**
- `POST /update-knowledge-base` - Manually add solutions to knowledge base
- `POST /test-knowledge-update` - Test the update functionality
- `GET /knowledge-stats` - View knowledge base statistics

## Quick Start

### 1. Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Lark app credentials
- OpenAI API key

### 2. Installation

```bash
# Clone or create the lark-bot directory
cd lark-bot

# Install dependencies
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
# Lark Bot Configuration
LARK_APP_ID=your_lark_app_id
LARK_APP_SECRET=your_lark_app_secret
LARK_VERIFICATION_TOKEN=your_verification_token
LARK_ENCRYPT_KEY=your_encrypt_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4

# Server Configuration
PORT=3001
NODE_ENV=development

# Application Information
APP_NAME=PM-Next Recruitment Management System
APP_URL=https://your-app-url.com
```

### 4. Lark App Setup

#### Step 1: Create a Lark App
1. Go to [Lark Developer Console](https://open.larksuite.com/)
2. Click "Create App" and choose "Custom App"
3. Fill in your app details:
   - App Name: PM-Next Assistant
   - Description: AI assistant for PM-Next recruitment system
   - Icon: Upload your app icon

#### Step 2: Configure App Permissions
Navigate to **Features** → **Bot** and enable the following permissions:
- `im:message` (Send and receive messages)
- `im:message.group_at_msg` (Receive group @ messages)
- `im:message.p2p_msg` (Receive private messages)

#### Step 3: Set Event Subscriptions
1. Go to **Features** → **Event Subscriptions**
2. Set Request URL: `https://your-domain.com/lark/events`
3. Subscribe to these events:
   - `im.message.receive_v1` (Receive messages)
   - `im.message.message_read_v1` (Message read status)

#### Step 4: Get App Credentials
From the **App Info** page, copy:
- App ID
- App Secret
- Verification Token
- Encrypt Key (if encryption is enabled)

### 5. Running the Bot

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The bot will be available at `http://localhost:3001` (or your configured port).

## Usage

### Direct Messages
Users can send direct messages to the bot:
```
"How do I add a new candidate?"
"Where can I find the analytics dashboard?"
"How do I create a job posting?"
```

### Group Mentions
In group chats, users can mention the bot:
```
"@PM-Next Assistant How do I access the pipeline view?"
"@PM-Next Assistant What are the main features of the system?"
```

## Sample Conversations

**User**: "How do I add a new candidate?"

**Bot**: "To add a new candidate in PM-Next:

1. Navigate to **Dashboard → Candidates**
2. Click the **Add New** button
3. Fill in the candidate information form
4. Upload their resume (optional - the system supports AI resume parsing)
5. Click **Save** to add the candidate to your database

The candidate will now appear in your candidates list and can be associated with job applications."

**User**: "Where is the analytics dashboard?"

**Bot**: "You can access the Analytics Dashboard by:

**Navigation**: Dashboard → Analytics

The Analytics Dashboard provides:
• Real-time KPIs and performance metrics
• Revenue tracking and forecasting
• Performance indicators for your recruitment activities
• Custom reports and data visualization

This is your central hub for monitoring recruitment performance and making data-driven decisions."

## Customization

### Adding More Knowledge
Edit the `PM_NEXT_KNOWLEDGE` constant in `server.js` to add more information about your application:

```javascript
const PM_NEXT_KNOWLEDGE = `
// Add your custom knowledge here
## New Feature:
- Description and navigation instructions
`;
```

### Modifying AI Behavior
Adjust the OpenAI system prompt in the `generateAIResponse` function to change how the bot responds:

```javascript
{
  role: 'system',
  content: `Your custom system prompt here...`
}
```

## Deployment

### Option 1: Railway
1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically

### Option 2: Heroku
1. Create a new Heroku app
2. Set environment variables
3. Deploy using Git or GitHub integration

### Option 3: Digital Ocean/AWS/GCP
1. Set up your server
2. Install Node.js and dependencies
3. Configure environment variables
4. Use PM2 or similar for process management

## Troubleshooting

### Common Issues

**Bot not responding to messages**
- Check if the webhook URL is correctly configured in Lark
- Verify that event subscriptions are properly set up
- Check server logs for error messages

**OpenAI API errors**
- Verify your OpenAI API key is correct
- Check your OpenAI usage limits
- Ensure the model (gpt-4) is available in your plan

**Lark authentication errors**
- Double-check your App ID and App Secret
- Verify the verification token matches

### Debugging

Enable debug mode by setting:
```env
NODE_ENV=development
```

Check logs:
```bash
# View real-time logs
npm run dev

# Check health endpoint
curl http://localhost:3001/health
```

## Security Considerations

- Store all secrets in environment variables
- Use HTTPS in production
- Implement rate limiting if needed
- Monitor API usage and costs
- Regular security updates for dependencies

## Support

For issues related to:
- **PM-Next Application**: Contact your development team
- **Lark Bot Setup**: Check Lark Developer Documentation
- **OpenAI Integration**: Review OpenAI API documentation

## License

MIT License - see LICENSE file for details. 