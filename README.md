# PM-Next Support Bot

A sophisticated Lark/Feishu support bot for PM-Next recruitment software with **SDK-based architecture**, **interactive cards**, and **pre-built FAQ responses**.

## Features

- 🤖 **AI-Powered Responses**: Uses OpenAI GPT-4 to provide intelligent answers about PM-Next
- 💬 **Multiple Interaction Modes**: Supports both direct messages and @ mentions
- 📚 **Comprehensive Knowledge Base**: Pre-loaded with PM-Next application knowledge
- 🔄 **Real-time Responses**: Instant replies to user queries
- 🛡️ **Secure**: Proper authentication and error handling

## 🌟 Key Features

### ✅ **SDK-Only Implementation** 
- **No raw fetch calls** - Uses Lark SDK exclusively for all API interactions
- Better error handling and automatic token management
- Consistent API patterns throughout the application

### 🎯 **Interactive Cards Only**
- **No text fallbacks** - Uses interactive cards exclusively 
- Rich, button-based navigation for all user interactions
- Seamless page selection and FAQ browsing experience

### 🚀 **Pre-Built FAQ Answers**
- **No AI generation delays** - Instant responses using curated answers
- Category-based fallbacks from `FAQ_RESPONSES` 
- Detailed step-by-step guides in `FAST_FAQ_ANSWERS`

### 📋 **Smart Navigation System**
- Page-based FAQ organization (Dashboard, Jobs, Candidates, Clients, Calendar, Claims)
- Follow-up action cards after FAQ responses
- Seamless navigation between pages and sections

## 🏗️ Architecture

### SDK Integration
```javascript
// All API calls use Lark SDK
const larkClient = new Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET
});

// User info via SDK
await larkClient.contact.user.get({
  user_id: actualUserId,
  user_id_type: userIdType
});

// Messages via SDK  
await larkClient.im.message.create({
  receive_id_type: receiveIdType,
  receive_id: chatId,
  msg_type: 'interactive',
  content: JSON.stringify(cardContent)
});
```

### Interactive Card Structure
```javascript
const pageSelectionCard = {
  "config": { "wide_screen_mode": true },
  "header": {
    "template": "blue",
    "title": { "content": "🤖 Welcome to PM-Next Support Bot" }
  },
  "elements": [
    // Page selection buttons
    // FAQ buttons  
    // Navigation actions
  ]
};
```

### Pre-Built FAQ Responses
```javascript
const FAST_FAQ_ANSWERS = {
  dashboard: {
    'How to view staff performance metrics?': `**Viewing Staff Performance Metrics:**
    
1. **Go to Dashboard** → Main navigation
2. **Select Analytics Tab** → Staff Performance section
3. **Choose Time Period** → Use date filters...`,
    // More detailed answers...
  }
};
```

## 🚀 Quick Start

### Prerequisites
- Node.js 14+
- Lark/Feishu App with IM Bot capabilities
- Environment variables configured

### Installation
```bash
npm install
```

### Environment Setup
```bash
# Required Environment Variables
LARK_APP_ID=your_app_id
LARK_APP_SECRET=your_app_secret
LARK_VERIFICATION_TOKEN=your_verification_token
LARK_ENCRYPT_KEY=your_encrypt_key

# Optional
PORT=3001
NODE_ENV=production
```

### Run the Bot
```bash
# Development
npm run dev

# Production
npm start
```

## 📖 Usage

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
     [🏢 Clients] [💼 Jobs] [👥 Candidates] ...

User: [Clicks "Jobs"]  
Bot: [Interactive Card] Jobs - FAQs
     [How to create a new job posting?]
     [How to assign candidates to jobs?] ...

User: [Clicks FAQ]
Bot: **How to create a new job posting?**
     
     **Creating a New Job Posting:**
     1. Navigate: Dashboard → Jobs → "Create New Job"
     2. Basic Information: Job Title, Client/Company...
     
     [🔙 Back to FAQs] [🏠 Main Menu] [💬 Ask Question]
```

## 🛠️ Technical Implementation

### Key Components

#### 1. SDK-Based API Layer
- `getLarkUserInfo()`: User information via SDK
- `sendMessage()`: Text messages via SDK  
- `sendInteractiveCard()`: Interactive cards via SDK
- `getParentMessageContent()`: Message retrieval via SDK

#### 2. Interactive Card System
- `sendPageSelectionMessage()`: Main navigation card
- `sendPageFAQs()`: FAQ selection cards
- `handleCardInteraction()`: Button click processing

#### 3. Pre-Built Answer System  
- `FAST_FAQ_ANSWERS`: Detailed step-by-step answers
- `FAQ_RESPONSES`: Category-based fallback responses
- `getFastFAQAnswer()`: Answer retrieval logic

#### 4. Navigation State Management
- `userInteractionState`: Track user's current page/mode
- `MAIN_PAGES`: Page definitions and FAQ lists
- Seamless state transitions between cards

### Performance Benefits

| Feature | Before | After |
|---------|--------|-------|
| API Calls | Raw fetch + manual token management | SDK with automatic token handling |
| User Interface | Text fallbacks when cards fail | Interactive cards exclusively |
| FAQ Responses | AI generation (slow) | Pre-built answers (instant) |
| Error Handling | Basic try/catch | SDK-provided error context |
| Code Maintainability | Mixed approaches | Consistent SDK patterns |

## 🎯 Interactive Features

### Page Categories
- **📊 Dashboard**: Analytics, KPIs, performance metrics
- **💼 Jobs**: Job creation, candidate assignment, tracking  
- **👥 Candidates**: Profile management, resume upload, applications
- **🏢 Clients**: Account management, company relationships
- **📅 Calendar**: Scheduling, meetings, leave requests
- **💰 Claims**: Expense management, approvals, tracking

### FAQ Response Types
1. **Exact Match**: From `FAST_FAQ_ANSWERS` with detailed steps
2. **Category Match**: From `FAQ_RESPONSES` with general guidance  
3. **Fallback**: Helpful prompt to ask questions directly

### Card Interaction Types
- **Page Selection**: Choose functional area
- **FAQ Selection**: Pick specific question
- **Navigation**: Back, home, custom questions
- **Follow-up**: Continue conversation after answers

## 🔧 Configuration

### Adding New FAQs
```javascript
// Add to MAIN_PAGES
'new_page': {
  name: '🆕 New Feature',
  description: 'Description of new feature',
  faqs: [
    'How to use new feature?',
    'Where to find new settings?'
  ]
}

// Add to FAST_FAQ_ANSWERS
new_page: {
  'How to use new feature?': `**Using New Feature:**
  
  1. Step one...
  2. Step two...`
}
```

### Customizing Cards
```javascript
// Modify card appearance
const cardContent = {
  "config": { "wide_screen_mode": true },
  "header": {
    "template": "blue", // green, red, yellow
    "title": { "content": "Custom Title" }
  }
};
```

## 📊 Monitoring & Analytics

### Built-in Analytics
- Request tracking and response times
- Cache hit rates for common questions  
- Error counting and categorization
- User interaction patterns

### Debug Endpoints
- `/test-card-interaction`: Simulate button clicks
- `/current-knowledge-base`: View loaded FAQ data
- `/health`: Service health check

## 🚀 Deployment

### Local Development
```bash
npm run dev
# Bot runs on http://localhost:3001
```

### Production Deployment
- **Vercel**: Auto-deploy from Git
- **Docker**: Container deployment
- **Traditional**: PM2 or systemd

### Environment-Specific Behavior
- All environments use SDK and interactive cards
- No serverless-specific fallbacks needed
- Consistent experience across deployments

## 🔒 Security

- Environment variable protection
- Lark webhook verification
- Request validation and sanitization
- No sensitive data in logs

## 📝 Contributing

1. Follow SDK-only patterns for new API calls
2. Use interactive cards for all user interfaces
3. Add pre-built answers for new FAQ categories
4. Maintain consistent error handling
5. Test card interactions thoroughly

## 📞 Support

For technical support or feature requests:
- Create GitHub issues for bugs/features
- Check debug endpoints for troubleshooting
- Review logs for detailed error information

---

**🎉 Built with SDK-first architecture, interactive card excellence, and instant pre-built responses!** 