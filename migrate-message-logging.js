const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    db: { schema: 'support' },
    auth: { persistSession: false }
  }
);

const MESSAGE_LOGS_TABLE_SQL = `
-- Message Logs Table for tracking user-bot interactions
CREATE TABLE IF NOT EXISTS message_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id VARCHAR(100) NOT NULL, -- Lark chat ID
  user_id VARCHAR(100), -- Lark user ID (null for bot messages)
  user_name VARCHAR(255), -- User display name
  message_type VARCHAR(20) NOT NULL, -- 'user_message', 'bot_response', 'system_message'
  message_content TEXT NOT NULL, -- The actual message content
  message_intent VARCHAR(100), -- Detected intent/category of the message
  response_type VARCHAR(50), -- 'ai_generated', 'knowledge_base', 'cached', 'template', 'escalation'
  processing_time_ms INTEGER, -- Time taken to process/respond (for bot messages)
  knowledge_base_hit BOOLEAN DEFAULT FALSE, -- Whether knowledge base was used
  cache_hit BOOLEAN DEFAULT FALSE, -- Whether cached response was used
  ticket_number VARCHAR(20), -- Associated ticket if any
  conversation_turn INTEGER DEFAULT 1, -- Turn number in conversation
  sentiment VARCHAR(20), -- 'positive', 'negative', 'neutral', 'frustrated'
  urgency_detected VARCHAR(20), -- 'low', 'medium', 'high', 'critical'
  escalated_to_human BOOLEAN DEFAULT FALSE, -- Whether escalated to human support
  session_id VARCHAR(100), -- Session identifier for grouping related messages
  user_metadata JSONB, -- Additional user context (timezone, department, etc.)
  message_metadata JSONB, -- Additional message context (rich content, attachments, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  response_satisfaction INTEGER CHECK (response_satisfaction >= 1 AND response_satisfaction <= 5) -- User feedback on bot response
);

-- Message logs indexes for analytics
CREATE INDEX IF NOT EXISTS idx_message_logs_chat_id ON message_logs(chat_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_user_id ON message_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_created_at ON message_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_message_logs_message_type ON message_logs(message_type);
CREATE INDEX IF NOT EXISTS idx_message_logs_response_type ON message_logs(response_type);
CREATE INDEX IF NOT EXISTS idx_message_logs_message_intent ON message_logs(message_intent);
CREATE INDEX IF NOT EXISTS idx_message_logs_sentiment ON message_logs(sentiment);
CREATE INDEX IF NOT EXISTS idx_message_logs_session_id ON message_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_ticket_number ON message_logs(ticket_number);
CREATE INDEX IF NOT EXISTS idx_message_logs_escalated ON message_logs(escalated_to_human);
`;

async function runMigration() {
  try {
    console.log('🚀 Starting message logging migration...');
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('Missing Supabase environment variables');
    }
    
    // Test connection
    const { error: testError } = await supabase.from('support_tickets').select('id').limit(1);
    if (testError) throw new Error(`Cannot connect: ${testError.message}`);
    
    console.log('✅ Connected to Supabase');
    console.log('📋 Please run the updated supabase-schema.sql in your Supabase dashboard');
    console.log('🎉 The message_logs table will be created with all necessary indexes');
    
  } catch (error) {
    console.error('❌ Migration check failed:', error.message);
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration, MESSAGE_LOGS_TABLE_SQL }; 