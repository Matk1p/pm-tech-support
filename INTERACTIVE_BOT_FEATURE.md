# Interactive Bot Feature - Page Selection & FAQs

## Overview

The PM-Next Support Bot now features an interactive interface that shows page selection buttons before users start asking questions. This improves user experience by guiding them to the right information more efficiently.

## How It Works

### 1. **Initial Greeting - Page Selection**
When users first interact with the bot or send simple greetings, they see a card with buttons for each main page:

- 📊 **Dashboard** - Central hub with analytics and KPIs
- 💼 **Jobs** - Job management and candidate assignment  
- 👥 **Candidates** - Candidate management and profiles
- 🏢 **Clients** - Client relationship management
- 📅 **Calendar** - Scheduling and event management
- 💰 **Claims** - Expense claims and approvals

### 2. **Page-Specific FAQs**
After selecting a page, users see common FAQs for that specific area:

**Example - Jobs Page FAQs:**
- How to create a new job posting?
- How to assign candidates to jobs?
- How to track job status and pipeline?
- How to manage job budgets and percentages?

### 3. **Normal Bot Logic**
If FAQs don't answer the user's question, they can:
- Click "Ask Custom Question" to proceed with normal bot AI
- Use the "Back to Page Selection" to choose a different page

## Trigger Conditions

### New Conversations
Page buttons automatically appear for:
- Very short messages (< 5 characters) in new conversations
- Empty or minimal initial messages

### Greetings & Commands
Page buttons appear for these patterns:
- `hi`, `hello`, `hey`, `help`, `start`, `menu`, `options`
- `good morning`, `good afternoon`, `good evening`
- `need help`, `show options`, `main menu`
- `restart`, `reset`, `begin`, `page selection`, `show pages`

## Technical Implementation

### Interactive Cards
Uses Lark's interactive card system with:
- **Message Type**: `interactive`
- **Card Elements**: Action buttons with specific values
- **Event Handling**: `card.action.trigger` webhook events

### State Management
- `userInteractionState` Map tracks user flow state
- `conversationContext` determines if conversation is new
- State is cleared when users complete FAQ flow or choose custom questions

### Webhook Integration
Main webhook (`/lark/events`) handles:
- Message events: `im.message.receive_v1`
- Card interactions: `card.action.trigger`
- Legacy card format: `card.action`

## FAQ Structure

Each page has 4 targeted FAQs covering the most common user questions:

```javascript
const MAIN_PAGES = {
  'dashboard': {
    name: '📊 Dashboard',
    description: 'Central hub with analytics and KPIs',
    faqs: [
      'How to view staff performance metrics?',
      'How to filter data by time period?',
      // ... more FAQs
    ]
  }
  // ... other pages
};
```

## Button Actions

| Button Type | Action Value | Behavior |
|-------------|--------------|----------|
| Page Selection | `dashboard`, `jobs`, etc. | Shows page-specific FAQs |
| FAQ Selection | `faq_pageKey_index` | Generates AI response for FAQ |
| Navigation | `back_to_pages` | Returns to page selection |
| Custom Question | `custom_question` | Enables normal bot interaction |

## Testing

### Manual Testing
1. Send a greeting: `hi`, `hello`, `help`
2. Click page buttons to see FAQs
3. Click FAQ buttons to get answers
4. Use navigation buttons to test flow

### API Testing
```bash
# Test page buttons directly
curl -X POST http://localhost:3001/test-page-buttons \
  -H "Content-Type: application/json" \
  -d '{"chatId": "your_chat_id"}'
```

## Configuration

### Environment Variables
- `LARK_APP_ID` - Required for interactive cards
- `LARK_APP_SECRET` - Required for API access
- No additional configuration needed

### Customization
Modify `MAIN_PAGES` object in `server.js` to:
- Add/remove pages
- Update FAQ questions
- Change page descriptions
- Modify button labels and emojis

## Fallback Behavior

If interactive cards fail:
- Falls back to plain text messages
- Lists pages and FAQs as numbered text
- Normal bot functionality continues

## Benefits

1. **Improved UX**: Users find relevant information faster
2. **Reduced Support Load**: FAQs handle common questions automatically
3. **Better Navigation**: Clear page-based organization
4. **Context Awareness**: Bot understands user's focus area
5. **Seamless Transition**: Easy escalation to full AI support when needed

## Future Enhancements

- Dynamic FAQ generation based on common support tickets
- Page-specific knowledge base sections
- User preference learning
- Analytics on button click patterns
- Integration with knowledge base updates 