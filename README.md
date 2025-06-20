# PM-Next Support Bot 🤖

A comprehensive AI-powered support bot for the PM-Next Recruitment Management System, providing intelligent assistance, FAQ responses, and support ticket management to help users navigate and use the PM-Next platform effectively.

## 🌟 Features

- **AI-Powered Support**: Smart responses using OpenAI's GPT models
- **FAQ System**: Pre-built answers for common questions
- **Support Ticket Creation**: Automatic escalation for complex issues
- **Knowledge Base Integration**: Supabase-backed information storage
- **Multi-platform Support**: Works with Lark/Feishu messaging platforms
- **Real-time Processing**: Immediate webhook responses with background processing

## 🏗️ Architecture

### Core Components

- **Next.js API Routes**: Serverless webhook endpoints optimized for Vercel
- **Lark SDK Integration**: Official Lark/Feishu SDK for reliable messaging
- **OpenAI Integration**: GPT-4 for intelligent response generation
- **Supabase Backend**: Knowledge base and ticket storage
- **Event Deduplication**: Prevents duplicate message processing
- **Caching System**: Improves response times for common queries

## 📋 Requirements

### Environment Variables

```bash
# Lark App Configuration
LARK_APP_ID=cli_your_app_id
LARK_APP_SECRET=your_app_secret

# OpenAI Configuration  
OPENAI_API_KEY=sk-your_openai_key
OPENAI_MODEL=gpt-4  # Optional, defaults to gpt-4

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Lark App Permissions

Ensure your Lark app has these permissions:
- `im:message` - Read messages
- `im:message:send_as_bot` - Send messages as bot
- `im:chat` - Access chat information

### Database Schema

The bot requires these Supabase tables:

```sql
-- Knowledge Base
CREATE TABLE knowledge_base (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100),
  question TEXT,
  answer TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Support Tickets  
CREATE TABLE support_tickets (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100),
  category VARCHAR(100),
  subject VARCHAR(500),
  description TEXT,
  status VARCHAR(50) DEFAULT 'open',
  priority VARCHAR(50) DEFAULT 'medium',
  chat_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone <repository-url>
cd pm-tech-support
npm install
```

### 2. Environment Setup

```bash
# Copy example environment file
cp .env.example .env.local

# Edit with your credentials
nano .env.local
```

### 3. Database Setup

```bash
# Run the SQL schema in your Supabase dashboard
# Or use the provided schema file
psql -f supabase-schema.sql
```

### 4. Development

```bash
# Start development server
npm run dev

# Server runs on http://localhost:3000
```

### 5. Webhook Configuration

In your Lark Developer Console:

1. **Event Subscriptions**:
   - `im.message.receive_v1` - For receiving messages

2. **Webhook URL**:
   ```
   https://your-domain.com/api/lark/events
   ```

## 💬 How It Works

### Message Processing Flow

1. **Webhook Receipt**: Lark sends message events to `/api/lark/events`
2. **Immediate Response**: Bot responds to Lark immediately to prevent timeouts
3. **Background Processing**: Message analysis happens asynchronously
4. **AI Response**: OpenAI generates contextual responses
5. **Response Delivery**: Bot sends reply back to the user

### Response Types

- **Greeting Response**: Welcome message with feature overview
- **AI-Generated**: OpenAI responses for complex queries
- **Cached Responses**: Pre-stored answers for common questions
- **Support Tickets**: Escalation for technical issues

## 📖 Bot Capabilities

### PM-Next Knowledge Areas

The bot provides expert guidance on:

- **📊 Dashboard**: Overview of activities, statistics, and key metrics
- **💼 Jobs**: Create, manage, and track job postings and requirements
- **👥 Candidates**: Manage candidate profiles, resumes, and application stages
- **🏢 Clients**: Handle client companies and contact information
- **📅 Calendar**: Schedule interviews and manage appointments
- **💰 Claims**: Track billing, invoices, and commission payments

### User Experience Flow

1. **Welcome Message**: Friendly greeting with available help topics
2. **Natural Conversation**: Users ask questions in natural language
3. **Intelligent Responses**: AI provides specific, actionable guidance
4. **Support Escalation**: Complex issues become support tickets automatically

### Example Interaction

```
User: Hi
Bot: 👋 Welcome to PM-Next Support Bot! 🤖

     I can help you with:
     📊 Dashboard - Overview and analytics
     💼 Jobs - Job posting and management
     👥 Candidates - Candidate profiles and management
     🏢 Clients - Client and company management
     📅 Calendar - Interview scheduling and calendar management
     💰 Claims - Billing and financial tracking

     Please tell me what you need help with, and I'll provide detailed guidance!

User: How do I create a new job posting?
Bot: **Creating a New Job Posting:**
     
     1. Navigate: Dashboard → Jobs → "Create New Job"
     2. Basic Information: Job Title, Client/Company, Location...
     
     [Detailed step-by-step instructions follow]
```

## 🛡️ Security

- Environment variable validation
- API route-level security
- Event deduplication
- Secure webhook verification
- Input sanitization
- CORS configuration for API routes

## 🔄 Migration from Express

This version has been migrated from Express.js to Next.js with the following improvements:

### ✅ **What's New:**
- **Immediate Webhook Response**: Prevents Lark timeouts
- **Background Processing**: Uses `setImmediate()` for non-blocking operations
- **Better Error Handling**: Comprehensive error recovery
- **Serverless Optimized**: Perfect for Vercel deployment
- **Enhanced Logging**: Detailed request/response tracking
- **Automatic Retries**: Built-in retry logic for API calls

### 🔧 **Key Changes:**
- `/lark/events` → `/api/lark/events`
- Express middleware → Next.js API route handlers
- Manual timeout handling → Built-in serverless optimization
- Complex routing → Single endpoint with event switching

## 📊 Monitoring & Debugging

### Health Check

```bash
# Check if bot is running
curl https://your-domain.com/api/lark/events

# Response:
{
  "status": "ok",
  "message": "Lark webhook endpoint is active",
  "timestamp": "2024-01-20T10:30:00.000Z",
  "larkClient": "initialized"
}
```

### Debug Mode

Enable detailed logging:

```bash
# Development
npm run dev

# Check logs for:
# 🔗 Webhook requests
# 🤖 AI processing
# 📤 Message sending
# ❌ Error handling
```

### Common Issues

1. **Messages not received**: Check Lark webhook configuration
2. **Bot not responding**: Verify environment variables
3. **AI responses slow**: Check OpenAI API key and quotas
4. **Database errors**: Verify Supabase connection and schema

## 🚢 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Configure environment variables in Vercel dashboard
```

### Environment Variables in Production

Set these in your deployment platform:

```bash
LARK_APP_ID=cli_your_production_app_id
LARK_APP_SECRET=your_production_secret
OPENAI_API_KEY=sk-your_production_key
SUPABASE_URL=https://your-prod-project.supabase.co
SUPABASE_ANON_KEY=your_production_supabase_key
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Guidelines

- Use TypeScript for new features
- Add comprehensive error handling
- Include logging for debugging
- Test with actual Lark webhooks
- Update documentation

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **GitHub Issues**: For bugs and feature requests
- **Documentation**: Check README and inline comments
- **Lark Integration**: Consult Lark Developer Documentation

---

**Built with ❤️ for the PM-Next platform** 