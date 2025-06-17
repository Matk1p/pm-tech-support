# Message Tracking & Analytics System

This document explains the new message tracking and analytics system that records all interactions between users and the PM-Next Lark Bot for analysis and insights.

## Overview

The message tracking system captures:
- **User Messages**: All incoming messages with sentiment analysis, intent detection, and urgency classification
- **Bot Responses**: All outgoing responses with performance metrics and response type classification
- **System Messages**: Ticket creation, escalations, and other system events
- **Session Tracking**: Groups related messages for conversation flow analysis
- **Analytics Data**: Rich metadata for comprehensive analysis over time

## Setup Instructions

### 1. Database Migration

Run the updated schema in your Supabase dashboard:

```bash
# Check connection first
node migrate-message-logging.js
```

Then copy the contents of `supabase-schema.sql` and run it in your Supabase SQL Editor to create the `message_logs` table.

### 2. Start Using Analytics

Once the table is created, message logging will automatically start when your bot receives messages. No additional configuration needed!

## Database Schema

### message_logs Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `chat_id` | VARCHAR(100) | Lark chat identifier |
| `user_id` | VARCHAR(100) | Lark user identifier (null for bot messages) |
| `user_name` | VARCHAR(255) | Display name of the user |
| `message_type` | VARCHAR(20) | 'user_message', 'bot_response', 'system_message' |
| `message_content` | TEXT | The actual message content |
| `message_intent` | VARCHAR(100) | Detected intent/category |
| `response_type` | VARCHAR(50) | 'ai_generated', 'knowledge_base', 'cached', etc. |
| `processing_time_ms` | INTEGER | Response processing time (bot messages only) |
| `knowledge_base_hit` | BOOLEAN | Whether knowledge base was used |
| `cache_hit` | BOOLEAN | Whether cached response was used |
| `ticket_number` | VARCHAR(20) | Associated support ticket |
| `conversation_turn` | INTEGER | Turn number in conversation |
| `sentiment` | VARCHAR(20) | 'positive', 'negative', 'neutral', 'frustrated' |
| `urgency_detected` | VARCHAR(20) | 'low', 'medium', 'high', 'critical' |
| `escalated_to_human` | BOOLEAN | Whether escalated to human support |
| `session_id` | VARCHAR(100) | Session identifier for grouping |
| `user_metadata` | JSONB | Additional user context |
| `message_metadata` | JSONB | Additional message context |
| `created_at` | TIMESTAMP | When the message was logged |
| `response_satisfaction` | INTEGER | User satisfaction rating (1-5) |

## Analytics API Endpoints

### Base URL: `/api/analytics`

### 1. Dashboard Overview
```
GET /api/analytics/dashboard
```

**Query Parameters:**
- `startDate` (optional): Start date (ISO string, default: 7 days ago)
- `endDate` (optional): End date (ISO string, default: now)
- `chatId` (optional): Filter by specific chat
- `userId` (optional): Filter by specific user

**Response:**
```json
{
  "success": true,
  "analytics": {
    "totalMessages": 1250,
    "userMessages": 625,
    "botResponses": 600,
    "systemMessages": 25,
    "responseTypes": {
      "ai_generated": 400,
      "knowledge_base": 150,
      "cached": 50
    },
    "sentiment": {
      "positive": 300,
      "negative": 50,
      "neutral": 250,
      "frustrated": 25
    },
    "performance": {
      "averageResponseTime": 1250,
      "knowledgeBaseHits": 150,
      "cacheHits": 50,
      "escalations": 25
    },
    "uniqueUsers": 45,
    "uniqueChats": 52
  }
}
```

### 2. Conversation History
```
GET /api/analytics/conversation/:chatId
```

**Query Parameters:**
- `limit` (optional): Number of messages to return (default: 50)

### 3. User Activity
```
GET /api/analytics/users
```

**Query Parameters:**
- `startDate`, `endDate`: Date range
- `limit` (optional): Number of users to return (default: 100)

### 4. Trends Analysis
```
GET /api/analytics/trends
```

**Query Parameters:**
- `startDate`, `endDate`: Date range
- `period` (optional): 'hour', 'day', 'week' (default: 'day')

### 5. Performance Metrics
```
GET /api/analytics/performance
```

Returns detailed performance statistics including response times, hit rates, and satisfaction scores.

### 6. Data Export
```
GET /api/analytics/export
```

**Query Parameters:**
- `format` (optional): 'json' or 'csv' (default: 'json')
- `startDate`, `endDate`: Date range
- `chatId`, `userId` (optional): Filters

## Key Features

### Automatic Intent Detection
Messages are automatically classified into categories:
- `candidate_management`: Resume, applicant, CV related
- `job_management`: Job posting, position related
- `client_management`: Company, employer related
- `authentication`: Login, password issues
- `file_upload`: Document upload problems
- `system_performance`: Slow loading, performance issues
- `help_request`: How-to questions
- `support_ticket`: Escalation requests
- And more...

### Sentiment Analysis
Each user message is analyzed for sentiment:
- **Positive**: Grateful, satisfied expressions
- **Negative**: Problems, complaints
- **Neutral**: Factual questions
- **Frustrated**: Urgent, critical issues

### Urgency Detection
Automatic urgency classification:
- **Critical**: Emergency, ASAP, deadline today
- **High**: Important, priority, soon
- **Medium**: General help, issues
- **Low**: When convenient, no rush

### Session Tracking
Related messages are grouped into sessions for conversation flow analysis. Sessions automatically expire after 30 minutes of inactivity.

## Performance Monitoring

Track key metrics:
- **Response Time**: Average, median, 95th percentile
- **Cache Hit Rate**: Percentage of cached responses
- **Knowledge Base Hit Rate**: Percentage using KB
- **Escalation Rate**: Percentage escalated to humans
- **User Satisfaction**: Average rating and distribution

## Use Cases

### 1. Bot Improvement
- Identify common questions not in knowledge base
- Find slow response patterns
- Optimize cache strategies

### 2. User Experience Analysis
- Track user satisfaction trends
- Identify frustrated users before escalation
- Understand conversation patterns

### 3. Support Team Insights
- See escalation patterns
- Identify training opportunities
- Track resolution effectiveness

### 4. Business Intelligence
- Understand user needs and pain points
- Track product usage patterns
- Measure support efficiency

## Example Queries

### Get Weekly Dashboard
```bash
curl "http://localhost:3001/api/analytics/dashboard?startDate=2024-01-01&endDate=2024-01-07"
```

### Export User Data as CSV
```bash
curl "http://localhost:3001/api/analytics/export?format=csv&startDate=2024-01-01" > user_data.csv
```

### Check Specific User Activity
```bash
curl "http://localhost:3001/api/analytics/users?userId=specific-user-id"
```

## Integration Notes

- Message logging is automatic and non-blocking
- Failed logging attempts are logged but don't affect bot functionality
- Sessions are automatically cleaned up every 15 minutes
- All timestamps are in UTC
- Analytics data is real-time (no caching delay)

## Privacy & Data Management

- User messages are stored with consent implied through bot usage
- Personal information is handled according to your privacy policy
- Consider implementing data retention policies
- Regular cleanup of old logs may be necessary for compliance

## Troubleshooting

### Common Issues

1. **Missing Messages in Analytics**
   - Check Supabase connection
   - Verify table creation
   - Check console logs for errors

2. **Analytics API Returns Empty**
   - Ensure message_logs table exists
   - Check date range parameters
   - Verify data has been collected

3. **Performance Issues**
   - Consider adding more database indexes
   - Implement data archiving for old records
   - Monitor Supabase usage limits

### Debug Mode
Set environment variable for detailed logging:
```bash
DEBUG_MESSAGE_LOGGING=true
```

## Next Steps

Consider implementing:
- Real-time dashboard with WebSocket updates
- Alert system for frustrated users
- Automated response suggestions based on patterns
- Integration with business intelligence tools
- Custom reporting dashboards 