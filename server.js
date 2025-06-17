require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Client } = require('@larksuiteoapi/node-sdk');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const messageLogger = require('./message-logger');
const analyticsAPI = require('./analytics-api');

const app = express();
const PORT = process.env.PORT || 3001;

// Store processed event IDs to prevent duplicates
const processedEvents = new Set();

// Store conversation context per chat
const conversationContext = new Map();

// Response cache for common questions
const responseCache = new Map();
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Request queue management
const requestQueue = [];
const MAX_CONCURRENT_REQUESTS = 3;
let activeRequests = 0;

// Performance analytics
const analytics = {
  totalRequests: 0,
  cacheHits: 0,
  averageResponseTime: 0,
  commonQuestions: new Map(),
  errorCount: 0
};

// Support ticket system
const ticketCollectionState = new Map(); // Track users in ticket creation flow

// Knowledge base auto-update system - FLEXIBLE APPROACH
const SOLUTION_KEYWORDS = [
  // Explicit solution indicators
  'solution:', 'solution for', 'fix:', 'resolved:', 'answer:', 'steps to fix:', 'how to fix:',
  'to resolve this:', 'the issue is:', 'you need to:', 'try this:',
  'fixed by:', 'solution is:', 'resolve by:', 'fix this by:',
  'here\'s the solution:', 'here is how to fix:', 'problem solved:'
];

// Relaxed detection - these indicate actionable solutions
const SOLUTION_INDICATORS = [
  'refresh', 'clear cache', 'restart', 'reload', 'try again', 'try', 'check',
  'update', 'install', 'uninstall', 'contact', 'go to', 'click',
  'navigate to', 'open', 'close', 'enable', 'disable', 'settings'
];

const KNOWLEDGE_UPDATE_INDICATORS = [
  'for future reference', 'common issue', 'similar problem', 'faq',
  'frequently asked', 'add to kb', 'add to knowledge base', 'update kb',
  'document this', 'remember this solution', 'save this solution'
];

// Track support team messages for knowledge base updates
const supportTicketReplies = new Map(); // ticket_number -> reply_data

// Issue categories for classification
const ISSUE_CATEGORIES = {
  'candidate': 'candidate_management',
  'resume': 'candidate_management',
  'job': 'job_management',
  'position': 'job_management', 
  'client': 'client_management',
  'company': 'client_management',
  'pipeline': 'pipeline_management',
  'deal': 'pipeline_management',
  'login': 'authentication',
  'password': 'authentication',
  'access': 'authentication',
  'upload': 'file_upload',
  'file': 'file_upload',
  'slow': 'system_performance',
  'performance': 'system_performance',
  'loading': 'system_performance',
  'add': 'general',
  'create': 'general',
  'save': 'general',
  'other': 'general'
};

// FAQ responses by category
const FAQ_RESPONSES = {
  candidate_management: `**Candidate Management FAQs:**

• **Add Candidate**: Dashboard → Candidates → Add New → fill form → Save
• **Upload Resume**: Drag & drop or click upload (AI parsing enabled)
• **Link to Job**: Candidate profile → Applications tab → Add to job
• **Update Status**: Use status dropdown in candidate profile

**Common Issues:**
• Resume not parsing? Check file format (PDF/DOC/DOCX) and size (<10MB)
• Candidate not saving? Ensure required fields are filled
• Can't find candidate? Use search bar or check filters`,

  job_management: `**Job Management FAQs:**

• **Create Job**: Dashboard → Jobs → Create Job → fill details → Save
• **Edit Job**: Click job title → update fields → Save
• **Add Candidates**: Job profile → Candidates section → Add Candidate
• **Set Status**: Use status dropdown (Active/Closed/On Hold)

**Common Issues:**
• Job not saving? Check required fields are completed
• Can't find job? Use search or check job status filters
• Candidates not linking? Ensure both candidate and job exist`,

  authentication: `**Login & Access FAQs:**

• **Login Issues**: Clear browser cache → try different browser → contact admin
• **Password Reset**: Use "Forgot Password" link or contact admin
• **Access Denied**: Check with admin about user permissions
• **Session Expired**: Log out completely and log back in

**Common Issues:**
• Browser compatibility: Use Chrome, Firefox, Safari, or Edge
• Clear cookies and cache if login loops
• Check internet connection stability`,

  general: `**General PM-Next FAQs:**

• **Navigation**: Use Dashboard menu → select module
• **Search**: Global search bar finds candidates, jobs, clients
• **Help**: Look for ? icons throughout the system
• **Performance**: Close unused tabs, clear cache

**Common Issues:**
• Page loading slowly? Check internet speed and close other tabs
• Feature not working? Try refreshing the page
• Data not syncing? Check internet connection`
};

// Common question patterns for caching
const CACHEABLE_PATTERNS = [
  /how.*add.*candidate/i,
  /how.*create.*job/i,
  /how.*schedule.*interview/i,
  /where.*find/i,
  /what.*pm.?next/i,
  /login.*problem/i,
  /upload.*error/i
];

function getCacheKey(message) {
  const normalized = message.toLowerCase().trim();
  for (const pattern of CACHEABLE_PATTERNS) {
    if (pattern.test(normalized)) {
      return pattern.toString();
    }
  }
  return null;
}

function getCachedResponse(message) {
  const cacheKey = getCacheKey(message);
  if (!cacheKey) return null;
  
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    console.log('📋 Using cached response for pattern:', cacheKey);
    return cached.response;
  }
  return null;
}

function setCachedResponse(message, response) {
  const cacheKey = getCacheKey(message);
  if (cacheKey) {
    responseCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });
    console.log('💾 Cached response for pattern:', cacheKey);
  }
}

async function processRequestQueue() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) {
    return;
  }
  
  const { resolve, reject, fn } = requestQueue.shift();
  activeRequests++;
  
  try {
    const result = await fn();
    resolve(result);
  } catch (error) {
    reject(error);
  } finally {
    activeRequests--;
    // Process next request in queue
    setTimeout(processRequestQueue, 100);
  }
}

function queueRequest(fn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, fn });
    processRequestQueue();
  });
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Analytics API routes
app.use('/api/analytics', analyticsAPI);

// Initialize Lark client
const larkClient = new Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: 'self-built',
  domain: 'larksuite', // Use 'larksuite' for global domain
  loggerLevel: 'debug'
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Load PM-Next Application Knowledge Base from markdown file
const fs = require('fs');
const path = require('path');

// Dynamic knowledge base loading
let PM_NEXT_KNOWLEDGE = '';
let knowledgeBaseInitialized = false;
const KNOWLEDGE_BASE_PATH = path.join(__dirname, 'knowledge-base.md');

function loadKnowledgeBase() {
  try {
    PM_NEXT_KNOWLEDGE = fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf8');
    console.log('📚 Knowledge base loaded/reloaded');
    return PM_NEXT_KNOWLEDGE;
  } catch (error) {
    console.error('❌ Error loading knowledge base:', error);
    return PM_NEXT_KNOWLEDGE; // Return existing knowledge base if reload fails
  }
}

// Initial load
loadKnowledgeBase();

// Watch for knowledge base file changes (optional - for development)
if (process.env.NODE_ENV !== 'production') {
  fs.watchFile(KNOWLEDGE_BASE_PATH, (curr, prev) => {
    console.log('📝 Knowledge base file changed, reloading...');
    loadKnowledgeBase();
  });
}

// Validate environment variables first
console.log('🔧 Environment variable check:');
console.log('   - NODE_ENV:', process.env.NODE_ENV);
console.log('   - VERCEL:', process.env.VERCEL);
console.log('   - SUPABASE_URL exists:', !!process.env.SUPABASE_URL);
console.log('   - SUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);

if (!process.env.SUPABASE_URL) {
  console.error('❌ SUPABASE_URL environment variable is required but not set');
  console.error('💡 Check your Vercel environment variables configuration');
}

if (!process.env.SUPABASE_ANON_KEY) {
  console.error('❌ SUPABASE_ANON_KEY environment variable is required but not set');
  console.error('💡 Check your Vercel environment variables configuration');
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    db: {
      schema: 'support'
    }
  }
);

// Knowledge base storage - Hybrid approach: Static file + dynamic database entries
const KNOWLEDGE_BASE_TABLE = 'knowledge_base'; // Supabase will handle the schema prefix

// Initialize knowledge base table if needed
async function initKnowledgeBase() {
  try {
    // Check if table exists, if not we'll use the markdown file as fallback
    const { data, error } = await supabase
      .from(KNOWLEDGE_BASE_TABLE)
      .select('id')
      .limit(1);
    
    console.log('📚 Knowledge base table check:', error ? 'Using file fallback' : 'Database ready');
  } catch (error) {
    console.log('📚 Knowledge base: Using file-based fallback');
  }
}

// Ensure knowledge base is initialized (lazy loading for serverless)
async function ensureKnowledgeBaseInitialized() {
  if (!knowledgeBaseInitialized) {
    console.log('🔄 Initializing knowledge base (serverless lazy loading)...');
    await initKnowledgeBase();
    await loadKnowledgeBaseFromDB();
    knowledgeBaseInitialized = true;
  }
}

// Load knowledge base from file and supplement with database entries
async function loadKnowledgeBaseFromDB() {
  try {
    // First, always load the static knowledge base from the md file
    let knowledgeBase = loadKnowledgeBase();
    
    // Then try to supplement with dynamic Q&A from database
    const { data, error } = await supabase
      .from(KNOWLEDGE_BASE_TABLE)
      .select('*')
      .eq('is_active', true) // Only get active entries
      .order('created_at', { ascending: true });
    
    if (error) {
      console.log('⚠️ Database query failed, using static knowledge base only:', error.message);
      console.log('🔍 Error code:', error.code);
      console.log('🔧 Environment:', process.env.VERCEL ? 'Vercel' : 'Local');
      console.log('🔧 Supabase URL:', process.env.SUPABASE_URL ? 'Set (' + process.env.SUPABASE_URL.substring(0, 30) + '...)' : 'MISSING');
      console.log('🔧 Supabase key:', process.env.SUPABASE_ANON_KEY ? 'Set (' + process.env.SUPABASE_ANON_KEY.substring(0, 20) + '...)' : 'MISSING');
      
      // Check for common production issues
      if (!process.env.SUPABASE_URL) {
        console.log('❌ SUPABASE_URL is missing in production environment');
      }
      if (!process.env.SUPABASE_ANON_KEY) {
        console.log('❌ SUPABASE_ANON_KEY is missing in production environment');
      }
      if (error.message.includes('permission denied') || error.code === '42501') {
        console.log('🔐 RLS permission issue - check Supabase RLS policies');
      }
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        console.log('🗄️ Table does not exist - check schema and table name');
      }
      
      return knowledgeBase;
    }
    
    if (data && data.length > 0) {
      // Find the end of the "Common User Questions and Answers" section
      const questionsSection = '## Common User Questions and Answers';
      const questionsIndex = knowledgeBase.indexOf(questionsSection);
      
      if (questionsIndex !== -1) {
        // Find the next section or end of file
        const nextSectionIndex = knowledgeBase.indexOf('\n## ', questionsIndex + questionsSection.length);
        const insertIndex = nextSectionIndex !== -1 ? nextSectionIndex : knowledgeBase.length;
        
        // Build additional Q&A entries from database
        let additionalQA = '\n\n### Additional Support Solutions\n';
        data.forEach(entry => {
          additionalQA += `\n### Q: ${entry.question}\n**A**: ${entry.answer}\n`;
          if (entry.category) {
            additionalQA += `*Category: ${entry.category}*\n`;
          }
        });
        
        // Insert the database entries before the next section
        knowledgeBase = knowledgeBase.slice(0, insertIndex) + additionalQA + '\n' + knowledgeBase.slice(insertIndex);
        
        console.log('📚 Knowledge base loaded: Static content + ' + data.length + ' dynamic entries from database');
      } else {
        // If we can't find the questions section, append to the end
        let additionalQA = '\n\n## Additional Support Solutions\n';
        data.forEach(entry => {
          additionalQA += `\n### Q: ${entry.question}\n**A**: ${entry.answer}\n`;
          if (entry.category) {
            additionalQA += `*Category: ${entry.category}*\n`;
          }
        });
        knowledgeBase += additionalQA;
        
        console.log('📚 Knowledge base loaded: Static content + ' + data.length + ' dynamic entries (appended)');
      }
    } else {
      console.log('📚 Knowledge base loaded: Static content only (no database entries)');
    }
    
    PM_NEXT_KNOWLEDGE = knowledgeBase;
    knowledgeBaseInitialized = true; // Mark as initialized when successful
    return knowledgeBase;
    
  } catch (error) {
    console.error('❌ Error loading from database, using static knowledge base only:', error);
    // Fallback to just the static file content
    const staticKnowledgeBase = loadKnowledgeBase();
    console.log('📚 Knowledge base loaded: Static content only (database error fallback)');
    return staticKnowledgeBase;
  }
}

// Add Q&A to database instead of file
async function addToKnowledgeBase(qaPair) {
  try {
    // First try database approach
    const { data, error } = await supabase
      .from(KNOWLEDGE_BASE_TABLE)
      .insert([{
        question: qaPair.question,
        answer: qaPair.answer,
        category: qaPair.category,
        ticket_source: qaPair.ticketNumber || null,
        created_at: new Date().toISOString()
      }])
      .select();
    
    if (error) {
      console.log('⚠️ Database insert failed:', error.message);
      console.log('🔍 Error details:', JSON.stringify(error, null, 2));
      console.log('🔧 Environment check:');
      console.log('   - SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Missing');
      console.log('   - SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'Missing');
      console.log('   - VERCEL environment:', process.env.VERCEL ? 'Yes' : 'No');
      
      // Check if it's a permission issue
      if (error.code === '42501' || error.message.includes('permission denied')) {
        console.log('🔐 Permission denied - RLS policies may need to be configured');
        console.log('💡 Check fix-rls-policies.sql for SQL commands to fix this');
      }
      
      // Don't fallback to file updates in production (Vercel)
      if (process.env.VERCEL) {
        console.log('❌ Cannot fallback to file updates in Vercel deployment');
        return false;
      }
      
      // Fallback to file update for local development only
      console.log('🔄 Falling back to file-based knowledge base update...');
      return await updateKnowledgeBase(qaPair);
    }
    
    console.log('✅ Knowledge base entry added to database');
    
    // Reload knowledge base (static + database content)
    await loadKnowledgeBaseFromDB();
    
    return true;
    
  } catch (error) {
    console.error('❌ Error adding to knowledge base:', error);
    
    // Don't fallback to file updates in production (Vercel)
    if (process.env.VERCEL) {
      console.log('❌ Cannot fallback to file updates in Vercel deployment');
      return false;
    }
    
    // Final fallback to file update for local development only
    return await updateKnowledgeBase(qaPair);
  }
}

// Handle Lark events
app.post('/lark/events', async (req, res) => {
  try {
    console.log('📥 Received Lark event:', JSON.stringify(req.body, null, 2));
    const { schema, header, event, challenge, type } = req.body;

    // Handle URL verification (legacy format)
    if (type === 'url_verification') {
      console.log('🔗 URL verification request');
      return res.status(200).json({ 
        challenge: challenge 
      });
    }

    // Handle new format events
    if (header && header.event_type === 'im.message.receive_v1' && event) {
      console.log('📨 Message event received from header');
      console.log('📋 Event structure:', Object.keys(event));
      
      // Check for duplicate events
      const eventId = header.event_id;
      if (processedEvents.has(eventId)) {
        console.log('🔄 Duplicate event detected, skipping:', eventId);
        return res.json({ success: true });
      }
      
      // Mark event as processed
      processedEvents.add(eventId);
      
      // Clean up old event IDs (keep only last 1000 to prevent memory issues)
      if (processedEvents.size > 1000) {
        const eventsArray = Array.from(processedEvents);
        processedEvents.clear();
        eventsArray.slice(-500).forEach(id => processedEvents.add(id));
      }
      
      // Check if this is a message event by looking for the message property
      if (event.message) {
        console.log('💬 Processing message event');
        await handleMessage(event);
      } else {
        console.log('⏭️ Not a message event, skipping');
      }
    } else {
      console.log('⏭️ Unknown event type or structure');
      console.log('📋 Available keys:', Object.keys(req.body));
      if (header) {
        console.log('📋 Header event type:', header.event_type);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error handling Lark event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Extract text from Lark rich content format
function extractTextFromRichContent(content) {
  try {
    if (!Array.isArray(content)) return '';
    
    let text = '';
    content.forEach(paragraph => {
      if (Array.isArray(paragraph)) {
        paragraph.forEach(element => {
          if (element.tag === 'text' && element.text) {
            text += element.text;
          }
        });
        text += ' '; // Add space between paragraphs
      }
    });
    
    return text.trim().replace(/@\w+/g, '').trim(); // Remove mentions
  } catch (error) {
    console.error('❌ Error extracting rich content:', error);
    return '';
  }
}

// Handle incoming messages
async function handleMessage(event) {
  try {
    console.log('🔍 Handling message event:', JSON.stringify(event, null, 2));
    
    const { chat_id, message_id, content, mentions } = event.message;
    const { sender_type, sender_id } = event.sender;

    console.log('📋 Message details:');
    console.log('  - Chat ID:', chat_id);
    console.log('  - Message ID:', message_id);
    console.log('  - Sender Type:', sender_type);
    console.log('  - Sender ID:', JSON.stringify(sender_id, null, 2));
    console.log('  - Sender ID type:', typeof sender_id);
    console.log('  - Chat type:', event.message.chat_type);
    console.log('  - Content:', content);
    console.log('  - Mentions:', mentions);
    
    // Log chat ID for support group identification
    console.log('🆔 CHAT ID FOR REFERENCE:', chat_id);

    // Check if the message is from the bot itself
    if (sender_type === 'app' || (sender_id && sender_id.id === process.env.LARK_APP_ID)) {
      console.log('🤖 Skipping: Message from bot itself');
      return; // Don't respond to own messages
    }

    // Check if the bot was mentioned or if it's a direct message
    
    const isMentioned = mentions && mentions.some(mention => 
      mention.key === process.env.LARK_APP_ID || 
      mention.name === 'Ask Danish' ||
      (mention.id && (mention.id.open_id || mention.id.user_id || mention.id.union_id))
    );
    const isDirectMessage = event.message.chat_type === 'p2p';

    console.log('🎯 Response conditions:');
    console.log('  - Is mentioned:', isMentioned);
    console.log('  - Is direct message:', isDirectMessage);
    console.log('  - Should respond:', isMentioned || isDirectMessage);

    if (!isMentioned && !isDirectMessage) {
      console.log('⏭️  Skipping: Not mentioned and not a DM');
      return; // Don't respond if bot wasn't mentioned and it's not a DM
    }

    // Extract text content
    let userMessage = '';
    if (content) {
      // Content might be a JSON string, so parse it first
      let parsedContent = content;
      if (typeof content === 'string') {
        try {
          parsedContent = JSON.parse(content);
        } catch (e) {
          console.log('⚠️ Content is not JSON, using as string');
          parsedContent = { text: content };
        }
      }
      
      // Handle different message types
      if (parsedContent && parsedContent.text) {
        // Simple text message
        userMessage = parsedContent.text.replace(/@\w+/g, '').trim();
      } else if (parsedContent && parsedContent.content) {
        // Rich text/post message - extract text from structured content
        userMessage = extractTextFromRichContent(parsedContent.content);
      }
    }

    console.log('📝 Extracted user message:', userMessage);
    console.log('📏 Message length:', userMessage.length);

    // Check if user is in ticket creation flow
    const isInTicketFlow = ticketCollectionState.has(chat_id);
    
    if (!userMessage || (userMessage.length < 2 && !isInTicketFlow)) {
      console.log('⏭️  Skipping: Empty or too short message');
      return; // Don't respond to empty messages
    }
    
    if (isInTicketFlow) {
      console.log('🎫 User in ticket creation flow, allowing short responses');
    }

    // Get user information for logging
    let userName = 'Unknown User';
    let userInfo = null;
    try {
      if (sender_id && (sender_id.user_id || sender_id.open_id || sender_id.union_id)) {
        userInfo = await getLarkUserInfo(sender_id);
        userName = userInfo?.name || userInfo?.displayName || 'Unknown User';
      }
    } catch (error) {
      console.log('⚠️ Could not fetch user info for logging:', error.message);
    }

    // Log the user message
    const userLogData = {
      chatId: chat_id,
      userId: sender_id?.user_id || sender_id?.open_id || sender_id?.union_id || null,
      userName: userName,
      message: userMessage,
      userMetadata: {
        senderType: sender_type,
        chatType: event.message.chat_type,
        messageId: message_id,
        userInfo: userInfo
      },
      messageMetadata: {
        originalContent: content,
        mentions: mentions,
        isInTicketFlow: isInTicketFlow
      }
    };
    
    const userMessageLog = await messageLogger.logUserMessage(userLogData);
    console.log('📝 User message logged with ID:', userMessageLog?.id);

    // Check if this is a support solution for knowledge base update
    console.log('🔍 Checking if message is a support solution...');
    const solutionProcessed = await processSupportSolution(userMessage, chat_id, sender_id, event);
    console.log('📊 Solution processing result:', solutionProcessed);
    
    if (!solutionProcessed) {
      console.log('🤖 Generating AI response...');
      // Generate AI response with context, passing sender information
      const responseStartTime = Date.now();
      const aiResponseData = await generateAIResponse(userMessage, chat_id, sender_id);
      const totalProcessingTime = Date.now() - responseStartTime;
      
      // Handle response data (could be string or object with metadata)
      let aiResponse, responseMetadata;
      if (typeof aiResponseData === 'object' && aiResponseData.response) {
        aiResponse = aiResponseData.response;
        responseMetadata = aiResponseData;
      } else {
        aiResponse = aiResponseData;
        responseMetadata = {
          responseType: 'ai_generated',
          processingTimeMs: totalProcessingTime
        };
      }
      
      console.log('✅ AI response generated:', aiResponse);

      console.log('📤 Sending response to Lark...');
      // Send response back to Lark
      await sendMessage(chat_id, aiResponse);
      console.log('🎉 Message sent successfully!');
      
      // Log the bot response with detailed metadata
      const botLogData = {
        chatId: chat_id,
        message: aiResponse,
        responseType: responseMetadata.responseType || 'ai_generated',
        processingTimeMs: responseMetadata.processingTimeMs || totalProcessingTime,
        knowledgeBaseHit: responseMetadata.knowledgeBaseHit || false,
        cacheHit: responseMetadata.cacheHit || false,
        escalatedToHuman: responseMetadata.escalatedToHuman || false,
        messageMetadata: {
          userMessageId: userMessageLog?.id,
          originalUserMessage: userMessage,
          responseMetadata: responseMetadata
        }
      };
      
      const botMessageLog = await messageLogger.logBotResponse(botLogData);
      console.log('🤖 Bot response logged with ID:', botMessageLog?.id);
    } else {
      console.log('📚 Support solution processed, knowledge base updated!');
      console.log('🚫 Skipping AI response generation since solution was processed');
    }
    
  } catch (error) {
    console.error('❌ Error handling message:', error);
  }
}

// Generate AI response using OpenAI
async function generateAIResponse(userMessage, chatId, senderId = null) {
  const startTime = Date.now();
  
  try {
    // Ensure knowledge base is initialized for serverless environments
    await ensureKnowledgeBaseInitialized();
    
    console.log('🧠 Calling OpenAI with message:', userMessage);
    
    // Get or create conversation context
    if (!conversationContext.has(chatId)) {
      conversationContext.set(chatId, []);
    }
    
    const context = conversationContext.get(chatId);
    console.log('📚 Current context length:', context.length);
    
    // Check if user is in ticket creation flow
    const ticketState = ticketCollectionState.get(chatId);
    if (ticketState) {
      return await handleTicketCreationFlow(chatId, userMessage, ticketState, senderId);
    }
    
    // Check if user is confirming they want to create a ticket
    const isConfirmingTicket = checkTicketConfirmation(context, userMessage);
    if (isConfirmingTicket) {
      console.log('✅ User confirming ticket creation, starting flow...');
      const category = categorizeIssue(userMessage, context);
      return await startTicketCreation(chatId, userMessage, category, senderId);
    }
    
    // Check for escalation triggers
    console.log('🎯 Checking escalation triggers for message:', userMessage);
    const shouldEscalate = shouldEscalateToTicket(context, userMessage);
    const category = categorizeIssue(userMessage);
    console.log('📊 Escalation result:', shouldEscalate, 'Category:', category);
    
    if (shouldEscalate) {
      console.log('🚨 Escalation triggered for category:', category);
      
      // Check for direct escalation phrases that should skip FAQs
      const directEscalationPhrases = [
        // Existing direct escalation phrases
        /still.*(not|doesn't|don't).*(work|working)/i,
        /escalate.*to.*(support|team|human)/i,
        /can.*i.*escalate/i,
        /create.*ticket/i,
        /not.*working/i,
        
        // Additional direct escalation phrases
        /need.*human.*help/i,
        /speak.*to.*(someone|person|human)/i,
        /talk.*to.*(support|agent|human)/i,
        /contact.*support/i,
        /urgent.*help/i,
        /emergency/i,
        /critical.*issue/i,
        /this.*is.*broken/i,
        /completely.*broken/i,
        /nothing.*works/i,
        /tried.*everything/i,
        /exhausted.*options/i,
        /desperate.*help/i,
        /last.*resort/i,
        /immediately.*need/i,
        /right.*now/i,
        /asap/i,
        /blocking.*work/i,
        /cant.*continue/i,
        /can't.*continue/i,
        /cannot.*continue/i,
        /lost.*data/i,
        /system.*error/i,
        /server.*error/i,
        /crashed/i,
        /frozen/i,
        /timeout/i,
        /failed.*multiple.*times/i,
        /keep.*failing/i,
        /repeatedly.*failing/i
      ];
      
      const isDirectEscalation = directEscalationPhrases.some(phrase => phrase.test(userMessage));
      
      if (isDirectEscalation) {
        // Direct escalation - go straight to ticket creation
        console.log('🎫 Direct escalation detected, starting ticket creation');
        return await startTicketCreation(chatId, userMessage, category, senderId);
      }
      
      // Check if we've already shown FAQs for this category
      const hasShownFAQs = context.some(msg => 
        msg.content && msg.content.toLowerCase().includes('faqs:') && 
        msg.content.toLowerCase().includes(category.replace('_', ' ').toLowerCase())
      );
      
      if (!hasShownFAQs && FAQ_RESPONSES[category]) {
        // First escalation - show relevant FAQs
        const faqResponse = `I understand you're having trouble. Let me share some relevant FAQs that might help:

${FAQ_RESPONSES[category]}

If these don't resolve your issue, I can create a support ticket for you to get personalized help. Just let me know!`;
        
        const responseTime = Date.now() - startTime;
        trackRequest(userMessage, responseTime, false);
        
        // Update conversation context
        context.push({ role: 'user', content: userMessage });
        context.push({ role: 'assistant', content: faqResponse });
        
        // Return response with metadata for logging
        return {
          response: faqResponse,
          responseType: 'knowledge_base',
          knowledgeBaseHit: true,
          processingTimeMs: responseTime,
          escalatedToHuman: false
        };
      } else {
        // Second escalation or no specific FAQs - start ticket creation
        return await startTicketCreation(chatId, userMessage, category, senderId);
      }
    }
    
    // Check cache first for common questions
    const cachedResponse = getCachedResponse(userMessage);
    if (cachedResponse) {
      const responseTime = Date.now() - startTime;
      trackRequest(userMessage, responseTime, true);
      
      // Return response with metadata for logging
      return {
        response: cachedResponse,
        responseType: 'cached',
        cacheHit: true,
        processingTimeMs: responseTime
      };
    }
    
    // Continue with normal AI response...
    const models = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    const selectedModel = process.env.OPENAI_MODEL || models[0];
    console.log('🔧 Using OpenAI model:', selectedModel);
    
    // Build messages array with context
    const messages = [
      {
        role: 'system',
        content: `You are a helpful assistant for the PM-Next Recruitment Management System. 
        Your role is to help users navigate and understand how to use the application effectively.
        
        IMPORTANT: 
        - Always respond to user messages. Never leave a user without a response.
        - Pay attention to conversation context - don't ask for details the user already provided.
        - If user says "still not working" or similar, the system will automatically escalate.
        
        Use this knowledge base about PM-Next:
        ${PM_NEXT_KNOWLEDGE}
        
        ENHANCED RESPONSE GUIDELINES:
          
          1. **Initial Response**: Provide clear, step-by-step instructions for navigation and usage
          
          2. **Follow-up Questions**: If the user encounters issues or needs clarification, ask specific diagnostic questions based on their problem type:
          
          **For File Upload Issues:**
          - What file format are you trying to upload? (PDF, DOC, DOCX, etc.)
          - What is the file size?
          - What error message do you see exactly?
          - Which browser are you using?
          - Have you tried uploading a different file to test?
          
          **For Candidate Management Issues:**
          - At which step are you experiencing the problem?
          - Are you seeing any error messages?
          - What candidate status are you trying to set?
          - Are you able to access the candidate list?
          - Is this happening with all candidates or specific ones?
          
          **For Job Management Issues:**
          - Which specific job feature is not working?
          - Can you see the job in your job list?
          - Are you trying to create, edit, or delete a job?
          - What error appears when you try to save?
          - Are the required fields filled in correctly?
          
          **For Client Management Issues:**
          - What client information are you trying to access or modify?
          - Can you see the client in your client list?
          - Are you experiencing issues with contact management or financial tracking?
          - What error message appears?
          
          **For Login/Access Issues:**
          - Are you using the correct login credentials?
          - What error message do you see when trying to log in?
          - Have you tried resetting your password?
          - Which page are you unable to access?
          
          **For Performance Issues:**
          - Which specific pages or features are loading slowly?
          - How long does it typically take to load?
          - Are you experiencing this across all features or specific ones?
          - What device and browser are you using?
          
          3. **General Guidelines:**
          - Be specific about where to find features in the application
          - Keep responses concise but helpful
          - Use bullet points or numbered steps when appropriate
          - Always be friendly and professional
          - If asked about features not in the knowledge base, politely explain limitations and offer general guidance`
      }
    ];
    
    // Add conversation context (keep last 6 messages for context)
    const recentContext = context.slice(-6);
    messages.push(...recentContext);
    
    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage
    });
    
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: messages,
      max_tokens: 800,
      temperature: 0.7,
      stream: false
    });

    const response = completion.choices[0].message.content;
    
    // Cache the response for common questions
    setCachedResponse(userMessage, response);
    
    // Update conversation context
    context.push({ role: 'user', content: userMessage });
    context.push({ role: 'assistant', content: response });
    
    // Keep context manageable (last 20 messages)
    if (context.length > 20) {
      context.splice(0, context.length - 20);
    }
    
    const responseTime = Date.now() - startTime;
    trackRequest(userMessage, responseTime, false);
    
    console.log('🎯 OpenAI response received successfully');
    return response;
  } catch (error) {
    analytics.errorCount++;
    console.error('❌ Error generating AI response:', error);
    console.error('❌ Error details:', error.message);
    
    // Provide more specific error responses
    if (error.message.includes('timeout')) {
      return 'I apologize for the delay. The system is taking longer than usual to respond. Please try asking your question again, or contact our support team if this continues.';
    } else if (error.message.includes('rate limit')) {
      return 'I\'m currently experiencing high demand. Please wait a moment and try again.';
    } else {
      return 'I encountered a technical issue while processing your request. Please try rephrasing your question or our support team for immediate assistance.';
    }
  }
}

// Fetch user information from Lark API
async function getLarkUserInfo(userId) {
  try {
    console.log('👤 Fetching user info for:', userId);
    console.log('👤 User ID type:', typeof userId, 'Value:', JSON.stringify(userId));
    
    // Extract the actual user ID from the sender object if needed
    let actualUserId = userId;
    if (typeof userId === 'object') {
      // Try different ID properties in order of preference
      actualUserId = userId.open_id || userId.user_id || userId.id;
      console.log('👤 Extracted user ID from object:', actualUserId);
      console.log('👤 Available IDs in object:', {
        open_id: userId.open_id,
        user_id: userId.user_id,
        union_id: userId.union_id,
        id: userId.id
      });
    }
    
    if (!actualUserId) {
      console.error('❌ No valid user ID provided');
      return null;
    }
    
    console.log('👤 Using user ID for API call:', actualUserId);
    
    // Get access token first
    console.log('🔑 Getting access token...');
    const tokenResponse = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET
      })
    });

    const tokenData = await tokenResponse.json();
    console.log('🔑 Token response:', tokenData);
    
    if (tokenData.code !== 0) {
      console.error('❌ Failed to get access token:', tokenData.msg);
      return null;
    }

    const accessToken = tokenData.tenant_access_token;
    console.log('✅ Access token obtained');

    // Determine the correct endpoint based on user ID format
    let endpoint;
    let userIdType;
    
    if (actualUserId.startsWith('ou_')) {
      // This is an open_id
      endpoint = `https://open.larksuite.com/open-apis/contact/v3/users/${actualUserId}?user_id_type=open_id`;
      userIdType = 'open_id';
    } else if (actualUserId.match(/^[a-f0-9]{8}$/)) {
      // This looks like a user_id (8 hex characters)
      endpoint = `https://open.larksuite.com/open-apis/contact/v3/users/${actualUserId}?user_id_type=user_id`;
      userIdType = 'user_id';
    } else {
      // Default to treating as open_id
      endpoint = `https://open.larksuite.com/open-apis/contact/v3/users/${actualUserId}?user_id_type=open_id`;
      userIdType = 'open_id';
    }
    
    console.log('🎯 Using endpoint:', endpoint);
    console.log('🎯 User ID type determined:', userIdType);

    try {
      console.log('🔍 Calling Lark API:', endpoint);
      
      const userResponse = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const userData = await userResponse.json();
      console.log('📊 User API response:', userData);
      
      if (userData.code === 0 && userData.data?.user) {
        const userInfo = {
          user_id: actualUserId,
          name: userData.data.user.name || 'Unknown User',
          email: userData.data.user.email || null,
          mobile: userData.data.user.mobile || null,
          avatar: userData.data.user.avatar?.avatar_240 || null
        };

        console.log('✅ User info fetched successfully:', userInfo);
        return userInfo;
      } else {
        console.log('❌ API call failed:', 'Code:', userData.code, 'Message:', userData.msg);
      }
    } catch (apiError) {
      console.log('❌ API call error:', apiError.message);
    }

    console.error('❌ API call failed for user ID:', actualUserId);
    
    // Try a simple fallback approach - return basic info with the user ID
    console.log('🔄 Attempting fallback user info creation');
    const userIdString = String(actualUserId);
    return {
      user_id: actualUserId,
      name: userIdString.includes('ou_') ? 'Lark User (ID: ' + userIdString.substring(0, 10) + '...)' : 'Lark User',
      email: null,
      mobile: null,
      avatar: null,
      fallback: true
    };
  } catch (error) {
    console.error('❌ Error fetching user info:', error);
    console.error('❌ Stack trace:', error.stack);
    return null;
  }
}

// Send message to Lark using direct API call
async function sendMessage(chatId, message) {
  try {
    console.log('📨 Sending message to chat:', chatId);
    console.log('📝 Message content:', message);
    
    // First, get the access token
    const tokenResponse = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET
      })
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.code !== 0) {
      throw new Error(`Failed to get access token: ${tokenData.msg}`);
    }

    const accessToken = tokenData.tenant_access_token;
    console.log('🔑 Got access token successfully');

    // Send the message
    // Detect the ID type based on the chat ID format
    let idType = 'chat_id';
    if (chatId.startsWith('ou_')) {
      idType = 'user_id';
    } else if (chatId.startsWith('oc_')) {
      idType = 'chat_id';
    } else if (chatId.startsWith('og_')) {
      idType = 'chat_id';
    }

    const messagePayload = {
      receive_id_type: idType,
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({
        text: message
      }),
      uuid: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    console.log('📦 Message payload:', JSON.stringify(messagePayload, null, 2));

    const messageResponse = await fetch(`https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=${idType}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({
          text: message
        }),
        uuid: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })
    });

    const messageData = await messageResponse.json();
    
    console.log('📊 Lark API response status:', messageResponse.status);
    console.log('📊 Lark API response data:', JSON.stringify(messageData, null, 2));
    
    if (messageData.code !== 0) {
      console.error('🚨 Lark API Error Details:', {
        code: messageData.code,
        msg: messageData.msg,
        data: messageData.data,
        error: messageData.error
      });
      throw new Error(`Failed to send message: ${messageData.msg || 'Unknown error'}`);
    }

    console.log('✅ Message sent successfully:', messageData);
  } catch (error) {
    console.error('❌ Error sending message to Lark:', error);
    console.error('📋 Error details:', error.message);
  }
}

// Environment check endpoint
app.get('/env-check', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
    supabaseUrl: !!process.env.SUPABASE_URL,
    supabaseKey: !!process.env.SUPABASE_ANON_KEY,
    supabaseUrlPrefix: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 30) + '...' : 'NOT SET'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'PM-Next Lark Bot',
    timestamp: new Date().toISOString()
  });
});

// Test database connection endpoint
app.post('/test-db-connection', async (req, res) => {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test Supabase connection
    const { data: testData, error: testError } = await supabase
      .schema('support')
      .from('support_tickets')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('❌ Database test failed:', testError);
      return res.status(500).json({ 
        success: false, 
        error: testError.message,
        details: testError
      });
    }
    
    // Test knowledge base table
    const { data: kbData, error: kbError } = await supabase
      .from('knowledge_base')
      .select('count')
      .limit(1);
    
    if (kbError) {
      console.error('❌ Knowledge base test failed:', kbError);
      return res.status(500).json({ 
        success: false, 
        error: kbError.message,
        table: 'knowledge_base'
      });
    }
    
    console.log('✅ Database connection successful');
    res.json({
      success: true,
      message: 'Database connection working',
      environment: process.env.VERCEL ? 'vercel' : 'local',
      supabaseUrl: process.env.SUPABASE_URL ? 'configured' : 'missing',
      supabaseKey: process.env.SUPABASE_ANON_KEY ? 'configured' : 'missing'
    });
    
  } catch (error) {
    console.error('❌ Database connection error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Check knowledge base entries endpoint
app.get('/check-kb-entries', async (req, res) => {
  try {
    const { data: entries, error } = await supabase
      .from('knowledge_base')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
    
    res.json({
      success: true,
      count: entries.length,
      entries: entries.map(entry => ({
        id: entry.id,
        ticket_source: entry.ticket_source,
        question: entry.question?.substring(0, 50) + '...',
        category: entry.category,
        created_at: entry.created_at
      }))
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});



// Test user info endpoint for debugging
app.get('/test-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('🧪 Testing user info fetch for:', userId);
    
    const userInfo = await getLarkUserInfo(userId);
    
    res.json({
      success: !!userInfo,
      userInfo: userInfo,
      userId: userId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      userId: req.params.userId,
      timestamp: new Date().toISOString()
    });
  }
});

// Analytics endpoint
app.get('/analytics', (req, res) => {
  const topQuestions = Array.from(analytics.commonQuestions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([question, count]) => ({ question, count }));
    
  res.json({
    totalRequests: analytics.totalRequests,
    cacheHitRate: analytics.totalRequests > 0 ? 
      (analytics.cacheHits / analytics.totalRequests * 100).toFixed(1) + '%' : '0%',
    averageResponseTime: analytics.averageResponseTime.toFixed(0) + 'ms',
    errorCount: analytics.errorCount,
    errorRate: analytics.totalRequests > 0 ? 
      (analytics.errorCount / analytics.totalRequests * 100).toFixed(1) + '%' : '0%',
    activeRequests: activeRequests,
    queueLength: requestQueue.length,
    cacheSize: responseCache.size,
    conversationsActive: conversationContext.size,
    topQuestions: topQuestions,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Support tickets endpoints
app.get('/tickets', async (req, res) => {
  try {
    const { status = 'open', limit = 50 } = req.query;
    
    let query = supabase
      .schema('support')
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    
    if (status !== 'all') {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json({
      tickets: data,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

app.get('/tickets/:ticketNumber', async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    
    const { data, error } = await supabase
      .schema('support')
      .from('support_tickets')
      .select('*')
      .eq('ticket_number', ticketNumber)
      .single();
    
    if (error) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

app.patch('/tickets/:ticketNumber', async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const updates = req.body;
    
    // Add resolved timestamp if status is being set to resolved
    if (updates.status === 'resolved' && !updates.resolved_at) {
      updates.resolved_at = new Date().toISOString();
    }
    
    const { data, error } = await supabase
      .schema('support')
      .from('support_tickets')
      .update(updates)
      .eq('ticket_number', ticketNumber)
      .select()
      .single();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// Test notification endpoint
app.post('/test-notification', async (req, res) => {
  try {
    const { chatId } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }
    
    const testTicket = {
      ticket_number: 'TEST-' + Date.now(),
      user_name: 'Test User',
      issue_category: 'test',
      issue_title: 'Test Notification',
      issue_description: 'This is a test notification to verify the support team notification system.',
      urgency_level: 'medium',
      steps_attempted: ['Testing notification system'],
      browser_info: 'Test Browser',
      device_info: 'Test Device',
      created_at: new Date().toISOString()
    };
    
    // Override the support group ID temporarily
    const originalGroupId = process.env.LARK_SUPPORT_GROUP_ID;
    process.env.LARK_SUPPORT_GROUP_ID = chatId;
    
    await notifySupportTeam(testTicket);
    
    // Restore original group ID
    process.env.LARK_SUPPORT_GROUP_ID = originalGroupId;
    
    res.json({ 
      success: true, 
      message: 'Test notification sent',
      chatId: chatId 
    });
  } catch (error) {
    console.error('❌ Test notification error:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Test ticket creation endpoint
app.post('/test-ticket', async (req, res) => {
  try {
    console.log('🧪 Testing ticket creation...');
    
    const testTicketData = {
      user_id: 'test_user_' + Date.now(),
      chat_id: 'test_chat_' + Date.now(),
      user_name: 'Test User',
      issue_category: 'general',
      issue_title: 'Test Ticket Creation',
      issue_description: 'This is a test ticket to verify the database connection and ticket creation process.',
      steps_attempted: ['Testing system'],
      browser_info: 'Test Browser',
      device_info: 'Test Device',
      urgency_level: 'medium',
      status: 'open',
      conversation_context: {
        test: true,
        timestamp: new Date().toISOString()
      }
    };
    
    const ticket = await createSupportTicket(testTicketData);
    
    if (ticket) {
      res.json({ 
        success: true, 
        message: 'Test ticket created successfully',
        ticket: {
          ticket_number: ticket.ticket_number,
          id: ticket.id,
          created_at: ticket.created_at
        }
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create test ticket',
        message: 'Check server logs for detailed error information'
      });
    }
  } catch (error) {
    console.error('❌ Test ticket creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Exception during test ticket creation',
      message: error.message 
    });
  }
});

// Test solution processing endpoint
app.post('/test-solution-processing', async (req, res) => {
  try {
    console.log('🧪 Testing solution processing...');
    
    const { chatId, solutionMessage, createTestTicket = true } = req.body;
    
    if (!solutionMessage) {
      return res.status(400).json({ 
        error: 'solutionMessage is required' 
      });
    }
    
    let testChatId = chatId || 'test_chat_' + Date.now();
    let testTicketNumber = null;
    
    // Create a test ticket if requested
    if (createTestTicket) {
      const testTicketData = {
        user_id: 'test_user_solution_' + Date.now(),
        chat_id: testChatId,
        user_name: 'Test User - Solution Processing',
        issue_category: 'authentication',
        issue_title: 'Test login issue for solution processing',
        issue_description: 'This is a test ticket to verify solution processing works correctly.',
        steps_attempted: ['Tried different browser', 'Cleared cache'],
        browser_info: 'Chrome',
        device_info: 'MacBook',
        urgency_level: 'medium',
        status: 'open',
        conversation_context: {
          test: true,
          purpose: 'solution_processing_test'
        }
      };
      
      const ticket = await createSupportTicket(testTicketData);
      if (!ticket) {
        return res.status(500).json({ 
          error: 'Failed to create test ticket for solution processing test' 
        });
      }
      
      testTicketNumber = ticket.ticket_number;
      console.log('✅ Test ticket created:', testTicketNumber);
    }
    
    // Create a mock event that simulates a reply
    const mockEvent = {
      message: {
        chat_id: testChatId,
        parent_id: 'mock_parent_id',
        content: JSON.stringify({ text: solutionMessage })
      }
    };
    
    // Test solution processing
    console.log('🔍 Testing solution processing with message:', solutionMessage.substring(0, 100) + '...');
    
    const result = await processSupportSolution(
      solutionMessage, 
      testChatId, 
      { id: 'test_sender_id' }, 
      mockEvent
    );
    
    // Clean up test ticket if we created one
    if (testTicketNumber) {
      try {
        await supabase
          .schema('support')
          .from('support_tickets')
          .delete()
          .eq('ticket_number', testTicketNumber);
        console.log('🧹 Test ticket cleaned up');
      } catch (cleanupError) {
        console.log('⚠️ Failed to cleanup test ticket:', cleanupError.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Solution processing test completed',
      results: {
        solutionProcessed: result,
        testTicketCreated: createTestTicket,
        testTicketNumber: testTicketNumber,
        testChatId: testChatId,
        messageLength: solutionMessage.length
      }
    });
    
  } catch (error) {
    console.error('❌ Test solution processing error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Test failed',
      message: error.message 
    });
  }
});

// Knowledge Base Update Endpoints

// Manually trigger knowledge base update from ticket solution
app.post('/update-knowledge-base', async (req, res) => {
  try {
    const { ticketNumber, solution, forceUpdate = false } = req.body;
    
    if (!ticketNumber || !solution) {
      return res.status(400).json({ 
        error: 'ticketNumber and solution are required' 
      });
    }
    
    console.log('🔧 Manual knowledge base update requested:', ticketNumber);
    
    // Check if solution looks valid
    if (!forceUpdate && !isSupportSolution(solution)) {
      return res.status(400).json({ 
        error: 'Solution does not appear to contain resolution information. Use forceUpdate=true to override.' 
      });
    }
    
    // Extract Q&A pair
    const qaPair = await extractQAPair(ticketNumber, solution);
    if (!qaPair) {
      return res.status(400).json({ 
        error: 'Could not extract Q&A pair from ticket and solution' 
      });
    }
    
    // Update knowledge base (database-first approach)
    const success = await addToKnowledgeBase({...qaPair, ticketNumber});
    if (!success) {
      return res.status(500).json({ 
        error: 'Failed to update knowledge base' 
      });
    }
    
    // Update ticket status
    await supabase
      .schema('support')
      .from('support_tickets')
      .update({ 
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_notes: solution
      })
      .eq('ticket_number', ticketNumber);
    
    res.json({
      success: true,
      message: 'Knowledge base updated successfully',
      qaPair: qaPair
    });
    
  } catch (error) {
    console.error('❌ Manual knowledge base update error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Test knowledge base update with sample data
app.post('/test-knowledge-update', async (req, res) => {
  try {
    console.log('🧪 Testing knowledge base update...');
    
    const testSolution = `Solution: The user needs to clear their browser cache and cookies.

Steps to fix:
1. Go to browser settings
2. Clear browsing data
3. Select "Cookies and other site data" and "Cached images and files"
4. Click "Clear data"
5. Refresh the page and try again

This resolves the login issue in most cases.`;
    
    const mockTicket = {
      ticket_number: 'TEST-' + Date.now(),
      issue_title: 'Cannot login to PM-Next',
      issue_description: 'User reports login page keeps loading but never completes',
      issue_category: 'authentication',
      steps_attempted: ['Tried different browser', 'Restarted computer']
    };
    
    // Temporarily insert mock ticket
    const { data: insertedTicket } = await supabase
      .schema('support')
      .from('support_tickets')
      .insert([{
        ticket_number: mockTicket.ticket_number,
        user_id: 'test_user',
        chat_id: 'test_chat',
        user_name: 'Test User',
        issue_category: mockTicket.issue_category,
        issue_title: mockTicket.issue_title,
        issue_description: mockTicket.issue_description,
        steps_attempted: mockTicket.steps_attempted,
        urgency_level: 'low',
        status: 'open'
      }])
      .select()
      .single();
    
    if (!insertedTicket) {
      return res.status(500).json({ error: 'Failed to create test ticket' });
    }
    
    // Test the knowledge base update
    const qaPair = await extractQAPair(mockTicket.ticket_number, testSolution);
    if (!qaPair) {
      return res.status(500).json({ error: 'Failed to extract Q&A pair' });
    }
    
    const success = await updateKnowledgeBase(qaPair);
    
    // Clean up test ticket
    await supabase
      .schema('support')
      .from('support_tickets')
      .delete()
      .eq('ticket_number', mockTicket.ticket_number);
    
    if (success) {
      res.json({
        success: true,
        message: 'Knowledge base test update successful',
        testData: {
          ticket: mockTicket,
          solution: testSolution,
          extractedQA: qaPair
        }
      });
    } else {
      res.status(500).json({ error: 'Failed to update knowledge base' });
    }
    
  } catch (error) {
    console.error('❌ Test knowledge base update error:', error);
    res.status(500).json({ 
      error: 'Test failed',
      message: error.message 
    });
  }
});

// Get knowledge base statistics
app.get('/knowledge-stats', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const knowledgeBasePath = path.join(__dirname, 'knowledge-base.md');
    const knowledgeBase = fs.readFileSync(knowledgeBasePath, 'utf8');
    
    // Count Q&A pairs
    const qaCount = (knowledgeBase.match(/### Q:/g) || []).length;
    
    // Count by category
    const categories = {
      candidate_management: (knowledgeBase.match(/candidate/gi) || []).length,
      job_management: (knowledgeBase.match(/job/gi) || []).length,
      client_management: (knowledgeBase.match(/client/gi) || []).length,
      authentication: (knowledgeBase.match(/login|password|access/gi) || []).length,
      system_performance: (knowledgeBase.match(/slow|performance|loading/gi) || []).length
    };
    
    // Get resolved tickets count
    const { data: resolvedTickets } = await supabase
      .schema('support')
      .from('support_tickets')
      .select('id, created_at, resolved_at')
      .eq('status', 'resolved');
    
    const stats = {
      totalQAs: qaCount,
      fileSize: Math.round(knowledgeBase.length / 1024 * 100) / 100, // KB
      lastModified: fs.statSync(knowledgeBasePath).mtime,
      categories: categories,
      resolvedTickets: resolvedTickets?.length || 0,
      timestamp: new Date().toISOString()
    };
    
    res.json(stats);
    
  } catch (error) {
    console.error('❌ Knowledge stats error:', error);
    res.status(500).json({ error: 'Failed to get knowledge base statistics' });
  }
});

// Reload knowledge base endpoint (static + database content)
app.post('/reload-knowledge-base', async (req, res) => {
  try {
    const oldLength = PM_NEXT_KNOWLEDGE.length;
    knowledgeBaseInitialized = false; // Force re-initialization
    await ensureKnowledgeBaseInitialized(); // Use the serverless-safe approach
    const newLength = PM_NEXT_KNOWLEDGE.length;
    
    res.json({
      success: true,
      message: 'Knowledge base reloaded successfully (static + dynamic content)',
      stats: {
        oldSize: Math.round(oldLength / 1024 * 100) / 100,
        newSize: Math.round(newLength / 1024 * 100) / 100,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Knowledge base reload error:', error);
    res.status(500).json({ error: 'Failed to reload knowledge base' });
  }
});

// Get current loaded knowledge base content
app.get('/current-knowledge-base', (req, res) => {
  try {
    res.json({
      content: PM_NEXT_KNOWLEDGE,
      size: Math.round(PM_NEXT_KNOWLEDGE.length / 1024 * 100) / 100,
      qaCount: (PM_NEXT_KNOWLEDGE.match(/### Q:/g) || []).length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting current knowledge base:', error);
    res.status(500).json({ error: 'Failed to get current knowledge base' });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`🤖 PM-Next Lark Bot server is running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
  
  // Initialize knowledge base (static file + dynamic database entries)
  // Note: In serverless environments like Vercel, this won't run
  // Knowledge base will be initialized lazily on first request
  if (!process.env.VERCEL) {
    try {
      await ensureKnowledgeBaseInitialized();
      console.log(`🗄️ Hybrid knowledge base initialized (static + dynamic content)`);
    } catch (error) {
      console.error('⚠️ Knowledge base initialization failed:', error.message);
      console.log('🔄 Using static file-based knowledge base only');
    }
  } else {
    console.log('🚀 Serverless environment detected - knowledge base will initialize on first request');
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down PM-Next Lark Bot server...');
  process.exit(0);
});

function trackRequest(message, responseTime, fromCache = false) {
  analytics.totalRequests++;
  if (fromCache) analytics.cacheHits++;
  
  // Update average response time
  analytics.averageResponseTime = 
    (analytics.averageResponseTime * (analytics.totalRequests - 1) + responseTime) / analytics.totalRequests;
  
  // Track common questions
  const questionKey = message.toLowerCase().substring(0, 50);
  analytics.commonQuestions.set(questionKey, 
    (analytics.commonQuestions.get(questionKey) || 0) + 1);
  
  console.log(`📈 Analytics: ${analytics.totalRequests} requests, ${analytics.cacheHits} cache hits (${(analytics.cacheHits/analytics.totalRequests*100).toFixed(1)}%), avg ${analytics.averageResponseTime.toFixed(0)}ms`);
}

async function createSupportTicket(ticketData) {
  try {
    console.log('📝 Inserting ticket into database...');
    console.log('🔗 Supabase URL configured:', !!process.env.SUPABASE_URL);
    console.log('🔑 Supabase key configured:', !!process.env.SUPABASE_ANON_KEY);
    
    const { data, error } = await supabase
      .schema('support')
      .from('support_tickets')
      .insert([ticketData])
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error creating support ticket:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      console.error('❌ Full error object:', JSON.stringify(error, null, 2));
      return null;
    }

    if (!data) {
      console.error('❌ No data returned from Supabase insert');
      return null;
    }

    console.log('🎫 Support ticket created successfully:', data.ticket_number);
    console.log('📋 Ticket data:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('❌ Exception in createSupportTicket:', error.message);
    console.error('❌ Exception stack:', error.stack);
    console.error('❌ Exception full:', JSON.stringify(error, null, 2));
    return null;
  }
}

async function notifySupportTeam(ticket) {
  try {
    // Send notification to support group chat
    const supportGroupId = process.env.LARK_SUPPORT_GROUP_ID;
    if (!supportGroupId) {
      console.log('⚠️ No support group ID configured');
      return;
    }

    const message = `🚨 **New Support Ticket Created**

**Ticket**: ${ticket.ticket_number}
**User**: ${ticket.user_name || 'Unknown'}
**Category**: ${ticket.issue_category}
**Title**: ${ticket.issue_title}
**Urgency**: ${ticket.urgency_level}

**Description**: ${ticket.issue_description}

**Steps Attempted**: ${ticket.steps_attempted?.join(', ') || 'None specified'}

**Browser/Device**: ${ticket.browser_info || 'Not specified'} / ${ticket.device_info || 'Not specified'}

**Created**: ${new Date(ticket.created_at).toLocaleString()}

Please assign and respond to this ticket promptly.`;

    await sendMessage(supportGroupId, message);
    console.log('📢 Support team notified for ticket:', ticket.ticket_number);
  } catch (error) {
    console.error('❌ Error notifying support team:', error);
  }
}

function categorizeIssue(message, context = []) {
  const lowerMessage = message.toLowerCase();
  
  // First check the current message
  for (const [keyword, category] of Object.entries(ISSUE_CATEGORIES)) {
    if (lowerMessage.includes(keyword)) {
      return category;
    }
  }
  
  // If no category found in current message, check recent context
  if (context.length > 0) {
    const recentContext = context.slice(-6).map(msg => msg.content?.toLowerCase() || '').join(' ');
    for (const [keyword, category] of Object.entries(ISSUE_CATEGORIES)) {
      if (recentContext.includes(keyword)) {
        return category;
      }
    }
  }
  
  return 'general';
}

function checkTicketConfirmation(context, userMessage) {
  // Check if the previous assistant message offered to create a ticket
  const recentMessages = context.slice(-4); // Look at last 4 messages
  const botOfferedTicket = recentMessages.some(msg => 
    msg.role === 'assistant' && 
    msg.content && 
    (msg.content.toLowerCase().includes('create a support ticket') ||
     msg.content.toLowerCase().includes('create a ticket') ||
     msg.content.toLowerCase().includes('support ticket for you'))
  );
  
  if (!botOfferedTicket) return false;
  
  // Check if user is confirming
  const confirmationPhrases = [
    /^yes$/i,
    /^yes please$/i,
    /^yeah$/i,
    /^sure$/i,
    /^ok$/i,
    /^okay$/i,
    /yes.*create/i,
    /yes.*ticket/i,
    /please.*create/i,
    /go ahead/i,
    /^do it$/i
  ];
  
  return confirmationPhrases.some(phrase => phrase.test(userMessage.trim()));
}

function shouldEscalateToTicket(context, userMessage) {
  const escalationTriggers = [
    // Existing triggers
    /still.*(not|doesn't|don't|doesnt).*(work|working|help|helping)/i,
    /tried.*(that|everything|all)/i,
    /doesn't.*(work|help)/i,
    /doesnt.*(work|help)/i,
    /still.*not.*working/i,
    /still.*doesnt.*work/i,
    /still.*having.*trouble/i,
    /need.*(human|person|live|real).*(help|support)/i,
    /speak.*(to|with).*(someone|person|human)/i,
    /this.*(is|isn't).*(working|helpful)/i,
    /frustrated/i,
    /urgent/i,
    /critical/i,
    /escalate.*to.*(support|team|human)/i,
    /can.*i.*escalate/i,
    /create.*ticket/i,
    /(cant|can't|cannot).*(add|create|upload|login|access)/i,
    /not.*working/i,
    /having.*trouble/i,
    /error/i,
    
    // New comprehensive triggers - User frustration expressions
    /this.*(sucks|terrible|awful|horrible|useless)/i,
    /waste.*of.*time/i,
    /annoying/i,
    /ridiculous/i,
    /pathetic/i,
    /broken/i,
    /buggy/i,
    /glitched/i,
    /messed.*up/i,
    /screwed.*up/i,
    /totally.*broken/i,
    /completely.*broken/i,
    /not.*functioning/i,
    
    // Request for human help variations
    /talk.*to.*(someone|person|human|agent|rep)/i,
    /contact.*(support|help|team)/i,
    /get.*(help|support).*from.*(human|person)/i,
    /live.*(chat|support|help|agent)/i,
    /real.*(person|human|agent)/i,
    /technical.*(support|help)/i,
    /customer.*(service|support)/i,
    /help.*desk/i,
    /support.*team/i,
    /human.*help/i,
    /manual.*help/i,
    
    // Problem persistence expressions  
    /keeps.*(happening|occurring|breaking|failing)/i,
    /always.*(broken|failing|not.*working)/i,
    /constantly.*(failing|broken|not.*working)/i,
    /repeatedly.*(failing|broken|not.*working)/i,
    /consistently.*(failing|broken|not.*working)/i,
    /same.*problem/i,
    /same.*issue/i,
    /again.*and.*again/i,
    /over.*and.*over/i,
    /multiple.*times/i,
    
    // Inability to perform tasks
    /unable.*to/i,
    /impossible.*to/i,
    /(cant|can't|cannot).*(save|submit|complete|finish)/i,
    /(cant|can't|cannot).*(get.*it.*to|make.*it)/i,
    /won't.*let.*me/i,
    /wont.*let.*me/i,
    /preventing.*me/i,
    /blocking.*me/i,
    /stuck.*on/i,
    /stuck.*at/i,
    /locked.*out/i,
    
    // Error and failure expressions
    /error.*message/i,
    /error.*code/i,
    /system.*error/i,
    /failed.*to/i,
    /failure/i,
    /crash/i,
    /crashed/i,
    /freezing/i,
    /frozen/i,
    /timeout/i,
    /timed.*out/i,
    /connection.*error/i,
    /server.*error/i,
    /database.*error/i,
    /404.*error/i,
    /500.*error/i,
    
    // Time-sensitive situations
    /asap/i,
    /immediately/i,
    /right.*now/i,
    /emergency/i,
    /deadline/i,
    /time.*sensitive/i,
    /running.*out.*of.*time/i,
    /need.*this.*fixed/i,
    /fix.*this.*now/i,
    /priority/i,
    /high.*priority/i,
    
    // Workflow blocking expressions
    /(cant|can't|cannot).*continue/i,
    /(cant|can't|cannot).*proceed/i,
    /(cant|can't|cannot).*move.*forward/i,
    /(cant|can't|cannot).*complete.*work/i,
    /blocking.*my.*work/i,
    /stopping.*me.*from/i,
    /preventing.*work/i,
    /halt.*work/i,
    /work.*stopped/i,
    
    // Data loss concerns
    /lost.*data/i,
    /lost.*work/i,
    /disappeared/i,
    /vanished/i,
    /missing.*files/i,
    /missing.*data/i,
    /corrupted/i,
    /damaged/i,
    
    // Multiple attempt expressions
    /tried.*multiple.*times/i,
    /tried.*several.*times/i,
    /attempted.*many.*times/i,
    /keep.*trying/i,
    /tried.*different.*ways/i,
    /nothing.*works/i,
    /nothing.*is.*working/i,
    /none.*of.*this.*works/i,
    
    // Final resort expressions
    /last.*resort/i,
    /final.*option/i,
    /no.*other.*choice/i,
    /exhausted.*options/i,
    /tried.*everything.*else/i,
    /what.*else.*can.*i.*do/i,
    /help.*me.*please/i,
    /please.*help/i,
    /desperate/i,
    /desperately.*need/i
  ];

  console.log('🔍 Checking escalation for message:', userMessage);
  const shouldEscalate = escalationTriggers.some(trigger => {
    const matches = trigger.test(userMessage);
    if (matches) {
      console.log('✅ Escalation trigger matched:', trigger);
    }
    return matches;
  });
  console.log('🚨 Should escalate:', shouldEscalate);
  
  return shouldEscalate;
}

async function startTicketCreation(chatId, userMessage, category, senderId = null) {
  console.log('🎫 Starting ticket creation for chat:', chatId);
  
  // Initialize ticket collection state with user information
  ticketCollectionState.set(chatId, {
    step: 'title',
    category: category,
    originalMessage: userMessage,
    senderId: senderId,
    data: {}
  });
  
  return `I'll help you create a support ticket to get personalized assistance. Let me collect some details:

**Step 1 of 3: Issue Title**
Please provide a brief title that describes your issue (e.g., "Cannot add candidate to job", "Login page not loading"):`;
}

async function handleTicketCreationFlow(chatId, userMessage, ticketState, senderId = null) {
  const { step, data, category, senderId: storedSenderId } = ticketState;
  const actualSenderId = senderId || storedSenderId;
  
  switch (step) {
    case 'title':
      data.title = userMessage.trim();
      ticketState.step = 'description';
      ticketCollectionState.set(chatId, ticketState);
      
      return `**Step 2 of 3: Detailed Description**
Please describe the issue in detail. What exactly happens when you try to perform the action?`;

    case 'description':
      data.description = userMessage.trim();
      ticketState.step = 'steps';
      ticketCollectionState.set(chatId, ticketState);
      
      return `**Step 3 of 3: Steps Attempted**
What steps have you already tried to resolve this issue? (e.g., "Refreshed page, cleared cache, tried different browser")`;

    case 'steps':
      data.stepsAttempted = userMessage.trim().split(',').map(s => s.trim());
      
      // Set default values for removed steps
      data.browser = 'Not specified';
      data.device = 'Not specified';
      data.urgency = 'medium'; // Default urgency level
      
      // Create the ticket immediately after step 3
      const ticket = await createTicketFromData(chatId, data, category, ticketState.originalMessage, actualSenderId);
      
      // Clear the collection state
      ticketCollectionState.delete(chatId);
      
      if (ticket) {
        console.log('🎯 Ticket created successfully, notifying support team...');
        
        // Notify support team
        try {
          await notifySupportTeam(ticket);
          console.log('📢 Support team notification sent successfully');
        } catch (notifyError) {
          console.error('⚠️ Failed to notify support team:', notifyError);
          // Continue anyway - ticket was created
        }
        
        return `✅ **Support Ticket Created Successfully!**

**Ticket Number**: ${ticket.ticket_number}
**Status**: Open
**Urgency**: ${data.urgency.toUpperCase()}

Your ticket has been submitted and our support team has been notified. They will review your issue and respond as soon as possible.

**What happens next:**
• Our support team will review your ticket
• You'll receive updates on the progress
• A support agent may reach out for additional information

**Estimated Response Time:**
• Critical: Within 1 hour
• High: Within 4 hours  
• Medium: Within 24 hours
• Low: Within 48 hours

Thank you for providing detailed information. Is there anything else I can help you with?`;
      } else {
        console.log('❌ Ticket creation failed - returning error message to user');
        return `❌ I encountered an error creating your support ticket. This could be due to:

• Database connection issues
• Missing required information
• System configuration problems

**Please try again in a few minutes, or contact our support team directly:**

📧 Email: support@pm-next.com
💬 Direct Chat: https://applink.larksuite.com/client/chat/chatter/add_by_link?link_token=3ddsabad-9efa-4856-ad86-a3974dk05ek2

I apologize for the inconvenience. Our technical team has been notified of this issue.`;
      }

    default:
      // Reset if in unknown state
      ticketCollectionState.delete(chatId);
      return `I encountered an error in the ticket creation process. Let me start over. Please describe your issue and I'll help you create a support ticket.`;
  }
}

async function createTicketFromData(chatId, data, category, originalMessage, senderId = null) {
  try {
    console.log('🔧 Creating ticket with data:', {
      chatId,
      category,
      title: data.title,
      urgency: data.urgency,
      senderId
    });
    
    // Get actual user info from Lark
    let userInfo = null;
    let actualUserId = senderId?.id || `user_${chatId}`;
    let actualUserName = 'Lark User';
    
    console.log('🔍 Analyzing sender ID for user info:', JSON.stringify(senderId, null, 2));
    
    if (senderId) {
      console.log('🔍 Attempting to fetch user info for sender ID:', senderId);
      userInfo = await getLarkUserInfo(senderId);
      
      if (userInfo) {
        actualUserId = userInfo.user_id;
        actualUserName = userInfo.name;
        console.log('✅ Using fetched user info:', { id: actualUserId, name: actualUserName });
      } else {
        console.log('⚠️ Could not fetch user info, using sender ID as fallback');
        // Try to extract ID from sender object
        if (typeof senderId === 'object' && senderId.id) {
          actualUserId = senderId.id;
          console.log('🔄 Using sender.id as user ID:', actualUserId);
        } else if (typeof senderId === 'string') {
          actualUserId = senderId;
          console.log('🔄 Using sender string as user ID:', actualUserId);
        }
      }
    } else {
      console.log('⚠️ No sender ID provided, using fallback user identification');
    }
    
    const ticketData = {
      user_id: actualUserId,
      chat_id: chatId,
      user_name: actualUserName,
      issue_category: category,
      issue_title: data.title,
      issue_description: data.description,
      steps_attempted: data.stepsAttempted || [],
      browser_info: data.browser || 'Not specified',
      device_info: data.device || 'Not specified',
      urgency_level: data.urgency || 'medium',
      status: 'open',
      conversation_context: {
        original_message: originalMessage,
        collected_data: data,
        user_info: userInfo // Store additional user info for reference
      }
    };
    
    console.log('🎫 Sending ticket data to database:', JSON.stringify(ticketData, null, 2));
    
    const result = await createSupportTicket(ticketData);
    
    if (result) {
      console.log('✅ Ticket created successfully:', result.ticket_number);
    } else {
      console.log('❌ Ticket creation failed - no result returned');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error creating ticket from data:', error);
    console.error('❌ Error stack:', error.stack);
    return null;
  }
}

// Knowledge Base Auto-Update Functions

/**
 * Detect if a message contains a support solution - FLEXIBLE APPROACH
 */
function isSupportSolution(message, isReplyToTicket = false) {
  const lowerMessage = message.toLowerCase();
  
  // If this is a reply to a support ticket, treat any substantive reply as a solution
  if (isReplyToTicket) {
    // Any reply to a support ticket with reasonable length is considered a solution
    if (message.trim().length >= 5) {
      console.log('✅ Treating reply to support ticket as solution');
      return true;
    }
  }
  
  // For non-reply messages, check for explicit solution keywords
  const hasSolutionKeyword = SOLUTION_KEYWORDS.some(keyword => 
    lowerMessage.includes(keyword.toLowerCase())
  );
  
  // Check for knowledge base update indicators
  const hasKBIndicator = KNOWLEDGE_UPDATE_INDICATORS.some(indicator => 
    lowerMessage.includes(indicator.toLowerCase())
  );
  
  // Check for typical support response patterns - EXPANDED
  const supportPatterns = [
    /here.*how.*to/i,
    /follow.*these.*steps/i,
    /you.*can.*fix.*this.*by/i,
    /the.*problem.*is/i,
    /to.*resolve.*this/i,
    /issue.*caused.*by/i,
    /workaround.*is/i,
    /temporary.*fix/i,
    /first.*try/i,
    /next.*step/i,
    /should.*work/i,
    /test.*this/i,
    /try.*this/i,
    /check.*if/i,
    /refresh.*the/i,
    /clear.*cache/i,
    /restart.*browser/i,
    /incognito.*window/i,
    /private.*window/i,
    /disable.*extensions/i
  ];
  
  const hasPattern = supportPatterns.some(pattern => pattern.test(message));
  
  return hasSolutionKeyword || hasKBIndicator || hasPattern;
}

/**
 * Get parent message content from Lark API
 */
async function getParentMessageContent(messageId) {
  try {
    console.log('🔍 Attempting to fetch parent message:', messageId);
    
    // Get access token
    const tokenResponse = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET
      })
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.code !== 0) {
      console.log('❌ Failed to get access token for parent message:', tokenData.msg);
      return null;
    }

    const accessToken = tokenData.tenant_access_token;

    // Get the parent message content
    const messageResponse = await fetch(`https://open.larksuite.com/open-apis/im/v1/messages/${messageId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const messageData = await messageResponse.json();
    console.log('📧 Parent message API response:', messageData);
    
    if (messageData.code === 0 && messageData.data && messageData.data.items && messageData.data.items.length > 0) {
      const content = messageData.data.items[0].body.content;
      console.log('📄 Parent message content:', content);
      
      // Try to parse content if it's JSON
      try {
        const parsedContent = JSON.parse(content);
        if (parsedContent.text) {
          console.log('📝 Extracted text from parent message:', parsedContent.text);
          return parsedContent.text;
        }
      } catch (parseError) {
        // Content might already be plain text
        console.log('📄 Using content as plain text');
        return content;
      }
      
      return content;
    } else {
      console.log('❌ Failed to get parent message:', messageData.msg);
      return null;
    }
  } catch (error) {
    console.log('❌ Error fetching parent message:', error.message);
    return null;
  }
}

/**
 * Extract ticket number from message context - ENHANCED
 */
async function extractTicketNumber(message, event = null) {
  // First, try to find ticket number directly in the message
  const ticketPattern = /([A-Z]{2,3}-\d{8}-\d{4})/i;
  const directMatch = message.match(ticketPattern);
  if (directMatch) {
    console.log('✅ Found ticket number directly in message:', directMatch[1]);
    return directMatch[1];
  }
  
  // If this is a reply message, check if we can find ticket context
  if (event && event.message) {
    // Check if the message is a reply (in Lark, replies contain context)
    // Look for ticket patterns in any quoted/referenced content
    const messageContent = JSON.stringify(event.message);
    const contextMatch = messageContent.match(ticketPattern);
    if (contextMatch) {
      console.log('✅ Found ticket number in message context:', contextMatch[1]);
      return contextMatch[1];
    }
    
    // If this message has parent_id or root_id, it's a reply
    if (event.message.parent_id || event.message.root_id) {
      console.log('🧵 Detected reply message - searching for ticket in conversation context');
      
      // Try to get the parent message content from Lark API
      const parentMessageId = event.message.parent_id || event.message.root_id;
      console.log('📧 Parent message ID:', parentMessageId);
      
      const parentContent = await getParentMessageContent(parentMessageId);
      if (parentContent) {
        console.log('📄 Retrieved parent message content:', parentContent);
        const parentMatch = parentContent.match(ticketPattern);
        if (parentMatch) {
          console.log('✅ Found ticket number in parent message:', parentMatch[1]);
          return parentMatch[1];
        }
      }
      
      // If we still can't find the ticket in parent content, try database search
      const chatId = event.message.chat_id;
      console.log('🔍 Searching database for recent tickets as fallback...');
      return await findRecentTicketFromChat(chatId);
    }
  }
  
  return null;
}

/**
 * Find the most recent ticket from a specific chat - IMPROVED
 */
async function findRecentTicketFromChat(chatId) {
  try {
    // Look for recent tickets created in this chat (extend to 7 days for better coverage)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    console.log('🔍 Searching for recent tickets in chat:', chatId);
    console.log('🕐 Looking for tickets since:', sevenDaysAgo.toISOString());
    
    const { data: recentTickets, error } = await supabase
      .schema('support')
      .from('support_tickets')
      .select('ticket_number, created_at, issue_title')
      .eq('chat_id', chatId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5); // Get more tickets to choose from
    
    console.log('📊 Query result:', { recentTickets, error });
    
    if (error) {
      console.log('⚠️ Error searching for recent tickets:', error.message);
      return null;
    }
    
    if (recentTickets && recentTickets.length > 0) {
      const ticketNumber = recentTickets[0].ticket_number;
      console.log('🎫 Found recent ticket from this chat:', ticketNumber);
      console.log('📋 Ticket details:', recentTickets[0]);
      
      // Log all found tickets for debugging
      if (recentTickets.length > 1) {
        console.log('📝 All recent tickets found:', recentTickets.map(t => ({
          ticket: t.ticket_number,
          created: t.created_at,
          title: t.issue_title
        })));
      }
      
      return ticketNumber;
    }
    
    console.log('❌ No recent tickets found in this chat');
    return null;
  } catch (error) {
    console.log('⚠️ Exception searching for recent tickets:', error.message);
    return null;
  }
}

/**
 * Check if message is likely a reply to a support ticket
 */
function isReplyToSupportTicket(message, event = null) {
  // Check if message mentions support ticket patterns
  const supportReplyPatterns = [
    /reply.*to.*ask.*danish/i,
    /support.*ticket/i,
    /ticket.*created/i,
    /pmn-\d{8}-\d{4}/i
  ];
  
  // Also check if this is a threaded reply
  const isThreadedReply = event && event.message && 
    (event.message.parent_id || event.message.root_id);
  
  const isReply = supportReplyPatterns.some(pattern => 
    pattern.test(message) || (event && pattern.test(JSON.stringify(event)))
  ) || isThreadedReply;
  
  return isReply;
}

/**
 * Extract Q&A pair from ticket and solution
 */
async function extractQAPair(ticketNumber, solutionMessage) {
  try {
    // Get ticket details from database
    console.log('📋 Fetching ticket details for:', ticketNumber);
    
    const { data: ticket, error } = await supabase
      .schema('support')
      .from('support_tickets')
      .select('*')
      .eq('ticket_number', ticketNumber)
      .single();
    
    console.log('🎫 Ticket fetch result:', { ticket: ticket?.ticket_number, error });
    
    if (error || !ticket) {
      console.log('❌ Could not fetch ticket for knowledge base update:', ticketNumber);
      return null;
    }
    
    // Use AI to extract and format the Q&A pair
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a knowledge base curator. Extract a clear question and answer from a support ticket and its solution.

Format the response as JSON:
{
  "question": "Clear, general question that future users might ask",
  "answer": "Step-by-step solution that can help similar issues",
  "category": "One of: candidate_management, job_management, client_management, pipeline_management, authentication, system_performance, general"
}

Make the question generic enough to match similar future issues, but specific enough to be useful.
Make the answer comprehensive with clear steps.`
        },
        {
          role: 'user',
          content: `Support Ticket:
Title: ${ticket.issue_title}
Description: ${ticket.issue_description}
Category: ${ticket.issue_category}
Steps Attempted: ${ticket.steps_attempted?.join(', ') || 'None'}

Solution Provided:
${solutionMessage}

Extract a Q&A pair from this support interaction.`
        }
      ],
      temperature: 0.1,
      max_tokens: 500
    });
    
    const response = completion.choices[0].message.content;
    console.log('🤖 AI extracted Q&A:', response);
    
    try {
      return JSON.parse(response);
    } catch (parseError) {
      console.log('⚠️ Could not parse AI response as JSON, using fallback');
      return {
        question: ticket.issue_title,
        answer: solutionMessage,
        category: ticket.issue_category || 'general'
      };
    }
    
  } catch (error) {
    console.error('❌ Error extracting Q&A pair:', error);
    return null;
  }
}

/**
 * Update knowledge base with new Q&A
 */
async function updateKnowledgeBase(qaPair) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const knowledgeBasePath = path.join(__dirname, 'knowledge-base.md');
    let knowledgeBase = fs.readFileSync(knowledgeBasePath, 'utf8');
    
    // Determine where to insert the new Q&A based on category
    const categoryHeaders = {
      'candidate_management': '### Q: How do I add a new candidate?',
      'job_management': '### Q: How do I create a job posting?',
      'client_management': '### Q: How do I track a deal in the pipeline?',
      'authentication': '## Troubleshooting Common Issues',
      'system_performance': '## Troubleshooting Common Issues',
      'general': '## Common User Questions and Answers'
    };
    
    const category = qaPair.category || 'general';
    const insertAfterHeader = categoryHeaders[category] || categoryHeaders['general'];
    
    // Format the new Q&A entry
    const newEntry = `
### Q: ${qaPair.question}
**A**: ${qaPair.answer}
`;
    
    // Find insertion point
    const headerIndex = knowledgeBase.indexOf(insertAfterHeader);
    if (headerIndex === -1) {
      // If header not found, append to end of Common Questions section
      const commonQuestionsIndex = knowledgeBase.indexOf('## Common User Questions and Answers');
      if (commonQuestionsIndex !== -1) {
        const nextSectionIndex = knowledgeBase.indexOf('## ', commonQuestionsIndex + 1);
        const insertIndex = nextSectionIndex !== -1 ? nextSectionIndex : knowledgeBase.length;
        knowledgeBase = knowledgeBase.slice(0, insertIndex) + newEntry + '\n' + knowledgeBase.slice(insertIndex);
      } else {
        // If no Common Questions section, append to end
        knowledgeBase += newEntry;
      }
    } else {
      // Find the end of the current Q&A entry
      const nextQIndex = knowledgeBase.indexOf('\n### Q:', headerIndex + 1);
      const nextSectionIndex = knowledgeBase.indexOf('\n## ', headerIndex + 1);
      
      let insertIndex;
      if (nextQIndex !== -1 && (nextSectionIndex === -1 || nextQIndex < nextSectionIndex)) {
        insertIndex = nextQIndex;
      } else if (nextSectionIndex !== -1) {
        insertIndex = nextSectionIndex;
      } else {
        insertIndex = knowledgeBase.length;
      }
      
      knowledgeBase = knowledgeBase.slice(0, insertIndex) + newEntry + knowledgeBase.slice(insertIndex);
    }
    
    // Write updated knowledge base
    fs.writeFileSync(knowledgeBasePath, knowledgeBase);
    console.log('📚 Knowledge base updated with new Q&A:', qaPair.question);
    
    // Reload the knowledge base in memory
    loadKnowledgeBase();
    
    return true;
  } catch (error) {
    console.error('❌ Error updating knowledge base:', error);
    return false;
  }
}

/**
 * Process support solution for knowledge base update - ENHANCED
 */
async function processSupportSolution(message, chatId, senderId, event = null) {
  try {
    console.log('🔍 Processing potential support solution...');
    console.log('📝 Message content:', message);
    console.log('💬 Chat ID:', chatId);
    console.log('🆔 Sender ID:', senderId);
    console.log('🎯 Has event:', !!event);
    console.log('🧵 Has parent_id:', !!(event?.message?.parent_id));
    console.log('🧵 Has root_id:', !!(event?.message?.root_id));
    console.log('⚙️ LARK_SUPPORT_GROUP_ID:', process.env.LARK_SUPPORT_GROUP_ID || 'Not set');
    console.log('⚙️ STRICT_SUPPORT_GROUP_ONLY:', process.env.STRICT_SUPPORT_GROUP_ONLY || 'Not set (defaults to false)');
    
    // Check if this is a reply to a support ticket
    const isReply = isReplyToSupportTicket(message, event);
    console.log('🔄 Is reply to support ticket:', isReply);
    
    // Check if message contains a solution (use flexible detection)
    const isSolution = isSupportSolution(message, isReply);
    console.log('✨ Is detected as solution:', isSolution);
    
    if (!isSolution) {
      console.log('❌ Not detected as a support solution');
      return false;
    }
    
    // Check if this is from the configured support group (if set)
    // Allow testing in any chat by checking if STRICT_SUPPORT_GROUP_ONLY is enabled
    const strictGroupOnly = process.env.STRICT_SUPPORT_GROUP_ONLY === 'true';
    if (strictGroupOnly && process.env.LARK_SUPPORT_GROUP_ID && chatId !== process.env.LARK_SUPPORT_GROUP_ID) {
      console.log('⚠️ Solution detected but not from configured support group');
      console.log('💡 Current chat:', chatId);
      console.log('💡 Support group:', process.env.LARK_SUPPORT_GROUP_ID);
      console.log('💡 Set STRICT_SUPPORT_GROUP_ONLY=false to allow testing in any chat');
      return false;
    }
    
    console.log('✅ Support solution detected, extracting ticket info...');
    
    // Extract ticket number from message or context
    console.log('🔍 Attempting to extract ticket number from:', {
      message: message.substring(0, 100) + '...',
      hasEvent: !!event,
      hasParentId: !!(event?.message?.parent_id),
      hasRootId: !!(event?.message?.root_id),
      chatId: event?.message?.chat_id
    });
    
    const ticketNumber = await extractTicketNumber(message, event);
    if (!ticketNumber) {
      console.log('⚠️ No ticket number found in solution message or context');
      console.log('💡 This could be because:');
      console.log('   - The message is not actually a reply to a support ticket');
      console.log('   - The original ticket message is older than 7 days');
      console.log('   - The ticket was created in a different chat');
      console.log('   - The parent message could not be retrieved from Lark API');
      return false;
    }
    
    console.log('🎫 Found ticket number:', ticketNumber);
    
    // Extract Q&A pair
    const qaPair = await extractQAPair(ticketNumber, message);
    if (!qaPair) {
      console.log('❌ Could not extract Q&A pair');
      return false;
    }
    
    console.log('📝 Extracted Q&A pair:', qaPair);
    
    // Update knowledge base (database-first approach)
    const success = await addToKnowledgeBase({...qaPair, ticketNumber});
    if (success) {
      // Update ticket status to resolved
      await supabase
        .schema('support')
        .from('support_tickets')
        .update({ 
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: message
        })
        .eq('ticket_number', ticketNumber);
      
      // Send confirmation message
      const confirmationMessage = `✅ **Knowledge Base Updated**

**Ticket**: ${ticketNumber}
**Solution Recorded**: ${qaPair.question}
**Category**: ${qaPair.category}

Your solution has been saved to the knowledge base and will help resolve similar issues automatically. Thank you! 🤖📚`;

      console.log('📤 Sending knowledge base update confirmation...');
      await sendMessage(chatId, confirmationMessage);
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Error processing support solution:', error);
    return false;
  }
} 