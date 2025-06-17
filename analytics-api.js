const express = require('express');
const messageLogger = require('./message-logger');

const router = express.Router();

/**
 * Get analytics dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { startDate, endDate, chatId, userId } = req.query;
    
    // Set default date range if not provided (last 7 days)
    const end = endDate || new Date().toISOString();
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const filters = {};
    if (chatId) filters.chatId = chatId;
    if (userId) filters.userId = userId;
    
    const messages = await messageLogger.getAnalytics(start, end, filters);
    
    if (!messages) {
      return res.status(500).json({ error: 'Failed to fetch analytics data' });
    }
    
    // Calculate analytics
    const analytics = {
      totalMessages: messages.length,
      userMessages: messages.filter(m => m.message_type === 'user_message').length,
      botResponses: messages.filter(m => m.message_type === 'bot_response').length,
      systemMessages: messages.filter(m => m.message_type === 'system_message').length,
      
      // Response types breakdown
      responseTypes: {
        ai_generated: messages.filter(m => m.response_type === 'ai_generated').length,
        knowledge_base: messages.filter(m => m.response_type === 'knowledge_base').length,
        cached: messages.filter(m => m.response_type === 'cached').length,
        template: messages.filter(m => m.response_type === 'template').length,
        escalation: messages.filter(m => m.response_type === 'escalation').length
      },
      
      // Sentiment analysis
      sentiment: {
        positive: messages.filter(m => m.sentiment === 'positive').length,
        negative: messages.filter(m => m.sentiment === 'negative').length,
        neutral: messages.filter(m => m.sentiment === 'neutral').length,
        frustrated: messages.filter(m => m.sentiment === 'frustrated').length
      },
      
      // Intent breakdown
      intents: {},
      
      // Urgency levels
      urgency: {
        low: messages.filter(m => m.urgency_detected === 'low').length,
        medium: messages.filter(m => m.urgency_detected === 'medium').length,
        high: messages.filter(m => m.urgency_detected === 'high').length,
        critical: messages.filter(m => m.urgency_detected === 'critical').length
      },
      
      // Performance metrics
      performance: {
        averageResponseTime: 0,
        knowledgeBaseHits: messages.filter(m => m.knowledge_base_hit).length,
        cacheHits: messages.filter(m => m.cache_hit).length,
        escalations: messages.filter(m => m.escalated_to_human).length
      },
      
      // Unique users and chats
      uniqueUsers: new Set(messages.filter(m => m.user_id).map(m => m.user_id)).size,
      uniqueChats: new Set(messages.map(m => m.chat_id)).size,
      
      // Time range
      dateRange: { start, end }
    };
    
    // Calculate intent breakdown
    messages.forEach(message => {
      if (message.message_intent) {
        analytics.intents[message.message_intent] = (analytics.intents[message.message_intent] || 0) + 1;
      }
    });
    
    // Calculate average response time
    const responseTimes = messages
      .filter(m => m.processing_time_ms && m.processing_time_ms > 0)
      .map(m => m.processing_time_ms);
    
    if (responseTimes.length > 0) {
      analytics.performance.averageResponseTime = Math.round(
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      );
    }
    
    res.json({
      success: true,
      analytics,
      totalRecords: messages.length
    });
    
  } catch (error) {
    console.error('❌ Error generating analytics dashboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get conversation history for a specific chat
 */
router.get('/conversation/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 50 } = req.query;
    
    const conversation = await messageLogger.getConversationSummary(chatId, parseInt(limit));
    
    if (!conversation) {
      return res.status(500).json({ error: 'Failed to fetch conversation data' });
    }
    
    res.json({
      success: true,
      chatId,
      messages: conversation,
      totalMessages: conversation.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get user activity summary
 */
router.get('/users', async (req, res) => {
  try {
    const { startDate, endDate, limit = 100 } = req.query;
    
    const end = endDate || new Date().toISOString();
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const messages = await messageLogger.getAnalytics(start, end);
    
    if (!messages) {
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }
    
    // Group by user
    const userStats = {};
    
    messages.filter(m => m.user_id).forEach(message => {
      const userId = message.user_id;
      
      if (!userStats[userId]) {
        userStats[userId] = {
          userId,
          userName: message.user_name,
          messageCount: 0,
          lastActivity: message.created_at,
          sentiments: { positive: 0, negative: 0, neutral: 0, frustrated: 0 },
          intents: {},
          urgencyLevels: { low: 0, medium: 0, high: 0, critical: 0 },
          ticketsCreated: 0,
          satisfactionRatings: []
        };
      }
      
      const stats = userStats[userId];
      stats.messageCount++;
      
      if (new Date(message.created_at) > new Date(stats.lastActivity)) {
        stats.lastActivity = message.created_at;
      }
      
      if (message.sentiment) {
        stats.sentiments[message.sentiment]++;
      }
      
      if (message.message_intent) {
        stats.intents[message.message_intent] = (stats.intents[message.message_intent] || 0) + 1;
      }
      
      if (message.urgency_detected) {
        stats.urgencyLevels[message.urgency_detected]++;
      }
      
      if (message.ticket_number) {
        stats.ticketsCreated++;
      }
      
      if (message.response_satisfaction) {
        stats.satisfactionRatings.push(message.response_satisfaction);
      }
    });
    
    // Convert to array and sort by activity
    const userArray = Object.values(userStats)
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
      .slice(0, parseInt(limit));
    
    // Calculate average satisfaction for each user
    userArray.forEach(user => {
      if (user.satisfactionRatings.length > 0) {
        user.averageSatisfaction = user.satisfactionRatings.reduce((sum, rating) => sum + rating, 0) / user.satisfactionRatings.length;
      }
      delete user.satisfactionRatings; // Remove raw ratings from response
    });
    
    res.json({
      success: true,
      users: userArray,
      totalUsers: userArray.length,
      dateRange: { start, end }
    });
    
  } catch (error) {
    console.error('❌ Error fetching user analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get trending topics/intents
 */
router.get('/trends', async (req, res) => {
  try {
    const { startDate, endDate, period = 'day' } = req.query;
    
    const end = endDate || new Date().toISOString();
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const messages = await messageLogger.getAnalytics(start, end);
    
    if (!messages) {
      return res.status(500).json({ error: 'Failed to fetch trend data' });
    }
    
    // Group by time period
    const trends = {};
    const intentTrends = {};
    const sentimentTrends = {};
    
    messages.forEach(message => {
      const date = new Date(message.created_at);
      let periodKey;
      
      switch (period) {
        case 'hour':
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
          break;
        case 'day':
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          periodKey = `${weekStart.getFullYear()}-W${Math.ceil((weekStart.getDate() - weekStart.getDay() + 1) / 7)}`;
          break;
        default:
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }
      
      if (!trends[periodKey]) {
        trends[periodKey] = { userMessages: 0, botResponses: 0, total: 0 };
      }
      
      if (!intentTrends[periodKey]) {
        intentTrends[periodKey] = {};
      }
      
      if (!sentimentTrends[periodKey]) {
        sentimentTrends[periodKey] = { positive: 0, negative: 0, neutral: 0, frustrated: 0 };
      }
      
      trends[periodKey].total++;
      
      if (message.message_type === 'user_message') {
        trends[periodKey].userMessages++;
      } else if (message.message_type === 'bot_response') {
        trends[periodKey].botResponses++;
      }
      
      if (message.message_intent) {
        intentTrends[periodKey][message.message_intent] = (intentTrends[periodKey][message.message_intent] || 0) + 1;
      }
      
      if (message.sentiment) {
        sentimentTrends[periodKey][message.sentiment]++;
      }
    });
    
    res.json({
      success: true,
      trends: {
        volume: trends,
        intents: intentTrends,
        sentiment: sentimentTrends
      },
      period,
      dateRange: { start, end }
    });
    
  } catch (error) {
    console.error('❌ Error fetching trend data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get performance metrics
 */
router.get('/performance', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const end = endDate || new Date().toISOString();
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const messages = await messageLogger.getAnalytics(start, end);
    
    if (!messages) {
      return res.status(500).json({ error: 'Failed to fetch performance data' });
    }
    
    const botResponses = messages.filter(m => m.message_type === 'bot_response');
    
    // Response time statistics
    const responseTimes = botResponses
      .filter(m => m.processing_time_ms && m.processing_time_ms > 0)
      .map(m => m.processing_time_ms)
      .sort((a, b) => a - b);
    
    const performance = {
      responseTime: {
        average: responseTimes.length > 0 ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length) : 0,
        median: responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length / 2)] : 0,
        p95: responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.95)] : 0,
        min: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
        max: responseTimes.length > 0 ? Math.max(...responseTimes) : 0
      },
      
      efficiency: {
        knowledgeBaseHitRate: botResponses.length > 0 ? (botResponses.filter(m => m.knowledge_base_hit).length / botResponses.length * 100).toFixed(2) : 0,
        cacheHitRate: botResponses.length > 0 ? (botResponses.filter(m => m.cache_hit).length / botResponses.length * 100).toFixed(2) : 0,
        escalationRate: botResponses.length > 0 ? (botResponses.filter(m => m.escalated_to_human).length / botResponses.length * 100).toFixed(2) : 0
      },
      
      satisfaction: {
        totalRatings: messages.filter(m => m.response_satisfaction).length,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      },
      
      coverage: {
        totalBotResponses: botResponses.length,
        responseTypeBreakdown: {}
      }
    };
    
    // Calculate satisfaction metrics
    const satisfactionRatings = messages
      .filter(m => m.response_satisfaction)
      .map(m => m.response_satisfaction);
    
    if (satisfactionRatings.length > 0) {
      performance.satisfaction.averageRating = (satisfactionRatings.reduce((sum, rating) => sum + rating, 0) / satisfactionRatings.length).toFixed(2);
      
      satisfactionRatings.forEach(rating => {
        performance.satisfaction.ratingDistribution[rating]++;
      });
    }
    
    // Response type breakdown
    botResponses.forEach(response => {
      const type = response.response_type || 'unknown';
      performance.coverage.responseTypeBreakdown[type] = (performance.coverage.responseTypeBreakdown[type] || 0) + 1;
    });
    
    res.json({
      success: true,
      performance,
      dateRange: { start, end },
      sampleSize: {
        totalMessages: messages.length,
        botResponses: botResponses.length,
        withResponseTime: responseTimes.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching performance data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Export raw data (CSV format)
 */
router.get('/export', async (req, res) => {
  try {
    const { startDate, endDate, format = 'json', chatId, userId } = req.query;
    
    const end = endDate || new Date().toISOString();
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const filters = {};
    if (chatId) filters.chatId = chatId;
    if (userId) filters.userId = userId;
    
    const messages = await messageLogger.getAnalytics(start, end, filters);
    
    if (!messages) {
      return res.status(500).json({ error: 'Failed to fetch export data' });
    }
    
    if (format === 'csv') {
      // Generate CSV
      const csvHeaders = [
        'created_at', 'chat_id', 'user_id', 'user_name', 'message_type',
        'message_content', 'message_intent', 'response_type', 'processing_time_ms',
        'knowledge_base_hit', 'cache_hit', 'sentiment', 'urgency_detected',
        'escalated_to_human', 'ticket_number', 'session_id', 'conversation_turn'
      ];
      
      let csv = csvHeaders.join(',') + '\n';
      
      messages.forEach(msg => {
        const row = csvHeaders.map(header => {
          let value = msg[header] || '';
          if (typeof value === 'string' && value.includes(',')) {
            value = `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        });
        csv += row.join(',') + '\n';
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="message_logs_${start.split('T')[0]}_to_${end.split('T')[0]}.csv"`);
      res.send(csv);
    } else {
      // Return JSON
      res.json({
        success: true,
        data: messages,
        totalRecords: messages.length,
        dateRange: { start, end }
      });
    }
    
  } catch (error) {
    console.error('❌ Error exporting data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 