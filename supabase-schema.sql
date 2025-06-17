-- Support Tickets Table for PM-Next Lark Bot
CREATE TABLE support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  user_id VARCHAR(100) NOT NULL, -- Lark user ID
  chat_id VARCHAR(100) NOT NULL, -- Lark chat ID
  user_name VARCHAR(255),
  issue_category VARCHAR(50), -- 'candidate_management', 'job_management', etc.
  issue_title VARCHAR(255) NOT NULL,
  issue_description TEXT NOT NULL,
  steps_attempted TEXT[], -- Array of steps user tried
  browser_info VARCHAR(255),
  device_info VARCHAR(255),
  error_messages TEXT,
  urgency_level VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  status VARCHAR(20) DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
  assigned_to VARCHAR(100), -- Support agent ID
  conversation_context JSONB, -- Last few messages for context
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
  tags TEXT[] -- For categorization and search
);

-- Knowledge Base Table for auto-updating Q&A pairs
CREATE TABLE knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(50), -- 'candidate_management', 'job_management', etc.
  ticket_source VARCHAR(20), -- Reference to originating ticket
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true, -- Allow disabling entries
  usage_count INTEGER DEFAULT 0, -- Track how often this Q&A is used
  last_accessed TIMESTAMP WITH TIME ZONE
);

-- Message Logs Table for tracking user-bot interactions
CREATE TABLE message_logs (
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

-- Indexes for performance
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_created_at ON support_tickets(created_at);
CREATE INDEX idx_support_tickets_urgency ON support_tickets(urgency_level);

-- Knowledge base indexes
CREATE INDEX idx_knowledge_base_category ON knowledge_base(category);
CREATE INDEX idx_knowledge_base_active ON knowledge_base(is_active);
CREATE INDEX idx_knowledge_base_created ON knowledge_base(created_at);
CREATE INDEX idx_knowledge_base_usage ON knowledge_base(usage_count DESC);

-- Message logs indexes for analytics
CREATE INDEX idx_message_logs_chat_id ON message_logs(chat_id);
CREATE INDEX idx_message_logs_user_id ON message_logs(user_id);
CREATE INDEX idx_message_logs_created_at ON message_logs(created_at);
CREATE INDEX idx_message_logs_message_type ON message_logs(message_type);
CREATE INDEX idx_message_logs_response_type ON message_logs(response_type);
CREATE INDEX idx_message_logs_message_intent ON message_logs(message_intent);
CREATE INDEX idx_message_logs_sentiment ON message_logs(sentiment);
CREATE INDEX idx_message_logs_session_id ON message_logs(session_id);
CREATE INDEX idx_message_logs_ticket_number ON message_logs(ticket_number);
CREATE INDEX idx_message_logs_escalated ON message_logs(escalated_to_human);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_support_tickets_updated_at 
    BEFORE UPDATE ON support_tickets 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_updated_at 
    BEFORE UPDATE ON knowledge_base 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Generate ticket numbers
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.ticket_number = 'PMN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('ticket_sequence')::TEXT, 4, '0');
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE SEQUENCE ticket_sequence START 1;

CREATE TRIGGER generate_ticket_number_trigger
    BEFORE INSERT ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION generate_ticket_number(); 