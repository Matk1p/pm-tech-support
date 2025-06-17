const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client (reuse from environment)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    db: { schema: 'support' },
    auth: { persistSession: false }
  }
);

const MESSAGE_LOGS_TABLE = 'message_logs';

// Session tracking for conversation grouping
const activeSessions = new Map(); // chatId -> sessionId
const conversationTurns = new Map(); // sessionId -> turnCount

/**
 * Generate a unique session ID for grouping related messages
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get or create session ID for a chat
 */
function getSessionId(chatId) {
  if (!activeSessions.has(chatId)) {
    activeSessions.set(chatId, generateSessionId());
    conversationTurns.set(activeSessions.get(chatId), 0);
  }
  return activeSessions.get(chatId);
}

/**
 * Simple sentiment analysis based on keywords
 */
function analyzeSentiment(message) {
  const positiveWords = ['thank', 'thanks', 'great', 'awesome', 'perfect', 'excellent', 'good', 'helpful', 'love', 'amazing'];
  const negativeWords = ['problem', 'issue', 'error', 'bug', 'broken', 'wrong', 'bad', 'terrible', 'hate', 'frustrated', 'annoying'];
  const frustratedWords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'stuck', 'blocked', 'deadline'];
  
  const lowerMessage = message.toLowerCase();
  
  const positiveScore = positiveWords.filter(word => lowerMessage.includes(word)).length;
  const negativeScore = negativeWords.filter(word => lowerMessage.includes(word)).length;
  const frustratedScore = frustratedWords.filter(word => lowerMessage.includes(word)).length;
  
  if (frustratedScore > 0 || negativeScore > positiveScore + 1) {
    return frustratedScore > 0 ? 'frustrated' : 'negative';
  } else if (positiveScore > negativeScore) {
    return 'positive';
  }
  return 'neutral';
}

/**
 * Detect message intent/category
 */
function detectIntent(message) {
  const intents = {
    'candidate_management': ['candidate', 'resume', 'applicant', 'cv', 'profile'],
    'job_management': ['job', 'position', 'posting', 'vacancy', 'role'],
    'client_management': ['client', 'company', 'employer', 'organization'],
    'authentication': ['login', 'password', 'access', 'signin', 'logout'],
    'file_upload': ['upload', 'file', 'document', 'attachment'],
    'system_performance': ['slow', 'loading', 'performance', 'lag', 'freeze'],
    'help_request': ['help', 'how to', 'how do', 'tutorial', 'guide'],
    'greeting': ['hello', 'hi', 'hey', 'good morning', 'good afternoon'],
    'support_ticket': ['ticket', 'support', 'escalate', 'human', 'agent'],
    'feedback': ['feedback', 'suggestion', 'improve', 'rating', 'review']
  };
  
  const lowerMessage = message.toLowerCase();
  
  for (const [intent, keywords] of Object.entries(intents)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return intent;
    }
  }
  
  return 'general';
}

/**
 * Detect urgency level from message
 */
function detectUrgency(message) {
  const urgencyKeywords = {
    'critical': ['critical', 'emergency', 'urgent', 'asap', 'immediately', 'deadline today'],
    'high': ['important', 'urgent', 'priority', 'soon', 'deadline'],
    'medium': ['help', 'issue', 'problem', 'question'],
    'low': ['when you can', 'no rush', 'whenever', 'eventually']
  };
  
  const lowerMessage = message.toLowerCase();
  
  for (const [level, keywords] of Object.entries(urgencyKeywords)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return level;
    }
  }
  
  return 'medium';
}

/**
 * Log a user message
 */
async function logUserMessage(data) {
  const {
    chatId,
    userId,
    userName,
    message,
    userMetadata = {},
    messageMetadata = {},
    ticketNumber = null
  } = data;
  
  // Cleanup sessions in serverless environments
  if (process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    cleanupOldSessions();
  }
  
  const sessionId = getSessionId(chatId);
  const currentTurn = conversationTurns.get(sessionId) + 1;
  conversationTurns.set(sessionId, currentTurn);
  
  const logEntry = {
    chat_id: chatId,
    user_id: userId,
    user_name: userName,
    message_type: 'user_message',
    message_content: message,
    message_intent: detectIntent(message),
    sentiment: analyzeSentiment(message),
    urgency_detected: detectUrgency(message),
    session_id: sessionId,
    conversation_turn: currentTurn,
    user_metadata: userMetadata,
    message_metadata: messageMetadata,
    ticket_number: ticketNumber
  };
  
  try {
    const { data: insertedData, error } = await supabase
      .from(MESSAGE_LOGS_TABLE)
      .insert([logEntry])
      .select();
    
    if (error) {
      console.error('❌ Error logging user message:', error);
      return null;
    }
    
    console.log('📝 User message logged:', {
      chatId,
      userId,
      intent: logEntry.message_intent,
      sentiment: logEntry.sentiment,
      turn: currentTurn
    });
    
    return insertedData[0];
  } catch (error) {
    console.error('❌ Exception logging user message:', error);
    return null;
  }
}

/**
 * Log a bot response
 */
async function logBotResponse(data) {
  const {
    chatId,
    message,
    responseType = 'ai_generated',
    processingTimeMs = null,
    knowledgeBaseHit = false,
    cacheHit = false,
    ticketNumber = null,
    escalatedToHuman = false,
    messageMetadata = {}
  } = data;
  
  const sessionId = getSessionId(chatId);
  const currentTurn = conversationTurns.get(sessionId);
  
  const logEntry = {
    chat_id: chatId,
    user_id: null, // Bot messages don't have user_id
    user_name: 'PM-Next Bot',
    message_type: 'bot_response',
    message_content: message,
    response_type: responseType,
    processing_time_ms: processingTimeMs,
    knowledge_base_hit: knowledgeBaseHit,
    cache_hit: cacheHit,
    ticket_number: ticketNumber,
    escalated_to_human: escalatedToHuman,
    session_id: sessionId,
    conversation_turn: currentTurn,
    message_metadata: messageMetadata
  };
  
  try {
    const { data: insertedData, error } = await supabase
      .from(MESSAGE_LOGS_TABLE)
      .insert([logEntry])
      .select();
    
    if (error) {
      console.error('❌ Error logging bot response:', error);
      return null;
    }
    
    console.log('🤖 Bot response logged:', {
      chatId,
      responseType,
      processingTime: processingTimeMs,
      knowledgeBaseHit,
      cacheHit
    });
    
    return insertedData[0];
  } catch (error) {
    console.error('❌ Exception logging bot response:', error);
    return null;
  }
}

/**
 * Log system messages (tickets created, escalations, etc.)
 */
async function logSystemMessage(data) {
  const {
    chatId,
    message,
    ticketNumber = null,
    messageMetadata = {}
  } = data;
  
  const sessionId = getSessionId(chatId);
  
  const logEntry = {
    chat_id: chatId,
    user_id: null,
    user_name: 'System',
    message_type: 'system_message',
    message_content: message,
    ticket_number: ticketNumber,
    session_id: sessionId,
    conversation_turn: conversationTurns.get(sessionId) || 1,
    message_metadata: messageMetadata
  };
  
  try {
    const { data: insertedData, error } = await supabase
      .from(MESSAGE_LOGS_TABLE)
      .insert([logEntry])
      .select();
    
    if (error) {
      console.error('❌ Error logging system message:', error);
      return null;
    }
    
    console.log('⚙️ System message logged:', { chatId, ticketNumber });
    return insertedData[0];
  } catch (error) {
    console.error('❌ Exception logging system message:', error);
    return null;
  }
}

/**
 * Update response satisfaction rating
 */
async function updateResponseSatisfaction(messageId, rating) {
  try {
    const { data, error } = await supabase
      .from(MESSAGE_LOGS_TABLE)
      .update({ response_satisfaction: rating })
      .eq('id', messageId)
      .select();
    
    if (error) {
      console.error('❌ Error updating response satisfaction:', error);
      return false;
    }
    
    console.log('⭐ Response satisfaction updated:', { messageId, rating });
    return true;
  } catch (error) {
    console.error('❌ Exception updating response satisfaction:', error);
    return false;
  }
}

/**
 * Get analytics data for a specific time period
 */
async function getAnalytics(startDate, endDate, filters = {}) {
  try {
    let query = supabase
      .from(MESSAGE_LOGS_TABLE)
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate);
    
    // Apply filters
    if (filters.chatId) query = query.eq('chat_id', filters.chatId);
    if (filters.userId) query = query.eq('user_id', filters.userId);
    if (filters.messageType) query = query.eq('message_type', filters.messageType);
    if (filters.intent) query = query.eq('message_intent', filters.intent);
    if (filters.sentiment) query = query.eq('sentiment', filters.sentiment);
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Error fetching analytics:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('❌ Exception fetching analytics:', error);
    return null;
  }
}

/**
 * Get conversation summary for a chat
 */
async function getConversationSummary(chatId, limit = 50) {
  try {
    const { data, error } = await supabase
      .from(MESSAGE_LOGS_TABLE)
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('❌ Error fetching conversation summary:', error);
      return null;
    }
    
    return data.reverse(); // Return in chronological order
  } catch (error) {
    console.error('❌ Exception fetching conversation summary:', error);
    return null;
  }
}

/**
 * Clean up old sessions (call periodically)
 */
function cleanupOldSessions() {
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();
  
  for (const [chatId, sessionId] of activeSessions.entries()) {
    const sessionTimestamp = parseInt(sessionId.split('_')[1]);
    if (now - sessionTimestamp > SESSION_TIMEOUT) {
      activeSessions.delete(chatId);
      conversationTurns.delete(sessionId);
    }
  }
}

// Clean up sessions every 15 minutes (only in non-serverless environments)
if (!process.env.VERCEL && !process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  setInterval(cleanupOldSessions, 15 * 60 * 1000);
} else {
  // In serverless environments, cleanup will happen on each request
  console.log('🚀 Serverless environment detected - session cleanup will happen per request');
}

module.exports = {
  logUserMessage,
  logBotResponse,
  logSystemMessage,
  updateResponseSatisfaction,
  getAnalytics,
  getConversationSummary,
  detectIntent,
  analyzeSentiment,
  detectUrgency,
  cleanupOldSessions
}; 