# PM-Next Lark Bot - Next.js Version

Intelligent Lark chatbot for the PM-Next Recruitment Management System, now powered by Next.js! This bot provides AI-powered assistance, FAQ responses, interactive cards, and support ticket management to help users navigate and use the PM-Next platform effectively.

## 🚀 Features

- **AI-Powered Responses**: Advanced natural language understanding using OpenAI GPT models
- **Interactive Cards**: Rich UI elements for better user engagement
- **FAQ System**: Quick answers for common questions across all PM-Next modules
- **Support Ticketing**: Automated ticket creation and escalation
- **Knowledge Base**: Dynamic learning from support interactions
- **Multi-Page Support**: Covers Dashboard, Jobs, Candidates, Clients, Calendar, and Claims
- **Performance Optimized**: Immediate webhook responses with background processing
- **Serverless Ready**: Optimized for Vercel and other serverless platforms

## 🏗️ Architecture

The bot is built with:
- **Next.js 14** with API routes for webhook handling
- **Lark OpenSDK** for Feishu/Lark integration
- **OpenAI API** for intelligent responses
- **Supabase** for data storage and knowledge base
- **React 18** for the admin dashboard
- **Serverless-optimized** architecture

## 🛠️ Installation

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Lark/Feishu app credentials
- OpenAI API key
- Supabase project

### Environment Variables

Create a `.env.local` file with the following variables:

```env
# Lark App Configuration
LARK_APP_ID=your_lark_app_id
LARK_APP_SECRET=your_lark_app_secret

# OpenAI Configuration  
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4  # Optional: defaults to gpt-4

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Next.js Configuration (optional)
NODE_ENV=production  # Set to production for deployment
```

### Installation Steps

1. **Clone the repository**
```bash
git clone <repository-url>
cd pm-tech-support
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env.local
# Edit .env.local with your actual values
```

4. **Initialize the database**
```bash
npm run setup
```

5. **Start the development server**
```bash
npm run dev
```

6. **Build for production**
```bash
npm run build
npm start
```

## 🔧 Configuration

### Lark App Setup

1. Create a Lark app in the [Lark Developer Console](https://open.feishu.cn/)
2. Configure webhook URL: `https://your-domain.com/api/lark/events`
3. Enable required permissions:
   - `im:message`
   - `im:message.group_at_msg`
   - `im:chat`
   - User information access

### Supabase Database Schema

The bot requires the following tables in your Supabase database:

```sql
-- Knowledge base for FAQ responses
CREATE TABLE knowledge_base (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100),
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Support tickets
CREATE TABLE support_tickets (
  id SERIAL PRIMARY KEY,
  chat_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100),
  issue_title TEXT NOT NULL,
  issue_description TEXT,
  issue_category VARCHAR(50),
  status VARCHAR(20) DEFAULT 'open',
  priority VARCHAR(20) DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Message logs for analytics
CREATE TABLE message_logs (
  id SERIAL PRIMARY KEY,
  chat_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100),
  user_name VARCHAR(255),
  message_type VARCHAR(50) NOT NULL,
  message_content TEXT,
  message_intent VARCHAR(100),
  sentiment VARCHAR(20),
  urgency_detected VARCHAR(20),
  session_id VARCHAR(100),
  conversation_turn INTEGER,
  response_type VARCHAR(50),
  processing_time_ms INTEGER,
  knowledge_base_hit BOOLEAN DEFAULT FALSE,
  cache_hit BOOLEAN DEFAULT FALSE,
  escalated_to_human BOOLEAN DEFAULT FALSE,
  ticket_number INTEGER REFERENCES support_tickets(id),
  user_metadata JSONB,
  message_metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🚀 Deployment

### Vercel Deployment (Recommended)

1. **Connect to Vercel**
```bash
npm install -g vercel
vercel
```

2. **Configure environment variables in Vercel dashboard**
   - Add all environment variables from `.env.local`
   - Make sure to use `VERCEL_URL` for webhook configuration

3. **Deploy**
```bash
vercel --prod
```

### Other Platforms

The Next.js app can be deployed to any platform that supports Node.js:
- **Netlify**: Use `@netlify/plugin-nextjs`
- **Railway**: Direct deployment with `railway up`
- **DigitalOcean App Platform**: Connect your GitHub repo
- **AWS Amplify**: Use the Amplify CLI

## 📊 Usage

### API Endpoints

- **Webhook**: `POST /api/lark/events` - Handles all Lark events
- **Health Check**: `GET /api/health` - System status monitoring
- **Legacy Webhook**: `POST /webhook` - Redirects to `/api/lark/events`

### Bot Commands

Users can interact with the bot using:
- Natural language questions
- Page-specific help requests
- Interactive card selections  
- Support ticket creation

### Admin Dashboard

Visit the root URL (`/`) to see:
- System status and health checks
- Service configuration status
- API endpoint documentation
- Real-time monitoring dashboard

## 🎯 Interactive Features

### Page Categories
- **📊 Dashboard**: Overview of activities, statistics, and key metrics
- **💼 Jobs**: Create, manage, and track job postings and requirements
- **👥 Candidates**: Manage candidate profiles, resumes, and application stages
- **🏢 Clients**: Handle client companies and contact information
- **📅 Calendar**: Schedule interviews and manage appointments
- **💰 Claims**: Track billing, invoices, and commission payments

### User Experience Flow

1. **Welcome Message**: Interactive card with page selection buttons
2. **Page Selection**: Click buttons for Dashboard, Jobs, Candidates, etc.
3. **FAQ Selection**: Interactive card with relevant FAQ buttons  
4. **Instant Answers**: Pre-built responses with formatting
5. **Follow-up Actions**: Navigation cards for continued interaction

### Example Interaction

```
User: Hi
Bot: [Interactive Card] Welcome to PM-Next Support Bot
     [📊 Dashboard] [💼 Jobs] [👥 Candidates] ...

User: [Clicks "Jobs"]  
Bot: [Interactive Card] Jobs - FAQs
     [How do I create a new job posting?]
     [How to edit an existing job?] ...

User: [Clicks FAQ]
Bot: **How do I create a new job posting?**
     
     **Creating a New Job Posting:**
     1. Navigate: Dashboard → Jobs → "Create New Job"
     2. Basic Information: Job Title, Client/Company...
     
     [🔙 Back to FAQs] [🏠 Main Menu] [💬 Ask Question]
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
- **Built-in Admin Dashboard**: React-based monitoring interface
- **HTTP Optimizations**: Connection pooling and retry logic

### 🗑️ **Removed:**
- Express.js server (`server.js`)
- Analytics API (can be re-implemented as Next.js API routes if needed)
- Shell scripts and legacy deployment files
- Relay service files

### 🔄 **Updated:**
- Package.json for Next.js dependencies
- Vercel configuration for serverless functions
- Environment variable handling
- Webhook endpoint structure (`/api/lark/events`)

## 🛠️ Technical Implementation

### Key Next.js Features

#### 1. API Routes
```javascript
// pages/api/lark/events.js
export default async function handler(req, res) {
  // Respond immediately to prevent timeouts
  res.status(200).json({ success: true });
  
  // Process in background
  setImmediate(() => processMessage(event));
}
```

#### 2. Immediate Response Pattern
```javascript
// Prevent Lark webhook timeouts
res.status(200).json({ 
  success: true, 
  message: 'Webhook received, processing in background' 
});

// Then process asynchronously
setImmediate(() => processMessage(event));
```

#### 3. Serverless Optimization
```javascript
// Optimized for Vercel Functions
export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' }
  }
};
```

### Performance Benefits

| Feature | Express Version | Next.js Version |
|---------|----------------|-----------------|
| Webhook Response | Synchronous (timeout risk) | Immediate + Background |
| Deployment | Traditional server | Serverless functions |
| Scaling | Manual PM2/Docker | Automatic serverless |
| Cold Starts | Always warm | Optimized for serverless |
| Error Recovery | Basic try/catch | Comprehensive with fallbacks |

## 🔧 Customization

### Adding New FAQs
```javascript
// Update MAIN_PAGES in pages/api/lark/events.js
'new_page': {
  name: '🆕 New Feature',
  description: 'Description of new feature',
  faqs: [
    'How to use new feature?',
    'Where to find new settings?'
  ]
}
```

### Adding New API Routes
```javascript
// Create pages/api/your-endpoint.js
export default function handler(req, res) {
  res.status(200).json({ message: 'Your endpoint' });
}
```

### Environment-Specific Configuration
```javascript
// next.config.js
const nextConfig = {
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  async rewrites() {
    return [
      {
        source: '/webhook',
        destination: '/api/lark/events',
      }
    ];
  }
};
```

## 📊 Monitoring & Analytics

### Built-in Monitoring
- Health check endpoint at `/api/health`
- Real-time dashboard at `/`
- Error tracking in Vercel Functions
- Performance metrics in Vercel Analytics

### Debug Information
- System status and service configuration
- Environment variable validation
- Uptime and performance metrics
- Service health indicators

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Follow Next.js patterns for new API routes
4. Use interactive cards for user interfaces
5. Test with `npm run dev`
6. Submit a pull request

### Development Guidelines
- Use Next.js API routes for new endpoints
- Implement immediate response + background processing pattern
- Follow serverless best practices
- Add proper error handling and recovery
- Update the admin dashboard for new features

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For technical support or questions:
- Create an issue in this repository
- Check the Next.js [documentation](https://nextjs.org/docs)
- Visit `/api/health` for system diagnostics
- Use the admin dashboard at `/` for monitoring

---

**🎉 Built with Next.js 14, serverless-first architecture, and optimized for modern deployment platforms!** 