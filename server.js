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
  candidate_management: `**Candidate Management Help:**

**Adding Candidates:**
• Navigate to the Candidates section
• Click the "Add New" or "+" button
• Fill in the required fields (name, email, phone)
• Upload resume if available
• Save the candidate profile

**Common Issues & Solutions:**
• **Can't add candidate?** Check that all required fields are filled
• **Resume not uploading?** Ensure file is PDF, DOC, or DOCX format and under 10MB
• **Page not responding?** Try refreshing the browser or clearing cache
• **Getting error messages?** Note the exact error text to help with troubleshooting

**If you're still having trouble, I can create a support ticket to get you personalized help from our technical team.**`,

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

  general: `**General PM-Next Support:**

I'm here to help you with any issues you're experiencing in PM-Next. For the best assistance, please let me know:

• **What specific feature** you're trying to use
• **What exactly happens** when you try to perform the action
• **Any error messages** you see

**Common Quick Fixes:**
• Try refreshing your browser page
• Clear your browser cache and cookies
• Make sure you have a stable internet connection
• Try using a different browser (Chrome, Firefox, Safari, Edge)

**If these don't help, I can create a support ticket to get you personalized assistance from our technical team.**`
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

// Enhanced logging for webhook events
app.use((req, res, next) => {
  if (req.path === '/lark/events') {
    console.log('🔍 ========== WEBHOOK EVENT DEBUG ==========');
    console.log('🔍 Method:', req.method);
    console.log('🔍 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('🔍 Body preview:', JSON.stringify(req.body, null, 2)?.substring(0, 500) + '...');
    console.log('🔍 Event type:', req.body?.header?.event_type || req.body?.type);
    console.log('🔍 Has action:', !!req.body?.action);
    console.log('🔍 Action value:', req.body?.action?.value);
    console.log('🔍 ============================================');
  }
  next();
});

// Analytics API routes
app.use('/api/analytics', analyticsAPI);

// Initialize Lark client with explicit domain configuration
const larkClient = new Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET
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
    console.log('🔍 Event Type Analysis:');
    console.log('  - Has header:', !!req.body.header);
    console.log('  - Header event_type:', req.body.header?.event_type);
    console.log('  - Has legacy type:', !!req.body.type);
    console.log('  - Legacy type:', req.body.type);
    console.log('  - Has action:', !!req.body.action);
    console.log('  - Has event:', !!req.body.event);
    console.log('🌐 Vercel deployment - single server.js handler');
    
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
      
      // Check for duplicate events
      const eventId = header.event_id;
      if (processedEvents.has(eventId)) {
        console.log('🔄 Duplicate event detected, skipping:', eventId);
        return res.json({ success: true });
      }
      
      // Mark event as processed
      processedEvents.add(eventId);
      
      // RESPOND TO LARK IMMEDIATELY to prevent timeout
      res.status(200).json({ 
        success: true, 
        message: 'Message received, processing in background',
        timestamp: new Date().toISOString()
      });
      
      // Clean up old event IDs (keep only last 1000 to prevent memory issues)
      if (processedEvents.size > 1000) {
        const eventsArray = Array.from(processedEvents);
        processedEvents.clear();
        eventsArray.slice(-500).forEach(id => processedEvents.add(id));
      }
      
      // Process message in background without blocking response
      if (event.message) {
        console.log('💬 Processing message event in background');
        setImmediate(async () => {
          try {
            await handleMessage(event);
          } catch (error) {
            console.error('❌ Background message processing error:', error);
          }
        });
      } else {
        console.log('⏭️ Not a message event, skipping');
      }
      
      return; // Exit early since we already responded
    } 
    // Handle card interaction events
    else if (header && header.event_type === 'card.action.trigger' && event) {
      console.log('🎯 Card interaction event received from header');
      console.log('🎯 Responding immediately to prevent timeout');
      console.log('📋 Card event structure:', Object.keys(event));
      console.log('🔍 Event details:', JSON.stringify(event, null, 2));
      
      // Check for duplicate events
      const eventId = header.event_id;
      if (processedEvents.has(eventId)) {
        console.log('🔄 Duplicate card event detected, skipping:', eventId);
        return res.json({ success: true });
      }
      
      // Mark event as processed
      processedEvents.add(eventId);
      
      // Handle card interaction asynchronously to respond immediately
      handleCardInteraction(event).catch(async (error) => {
        console.error('❌ Error processing card interaction:', error);
        console.error('❌ Error stack:', error.stack);
        
        // Try to send a fallback error message to the user
        try {
          const chatId = event.context?.open_chat_id || event.open_chat_id;
          if (chatId) {
            console.log('🚨 Sending error fallback message to chat:', chatId);
            
            // Clear any stuck user state
            userInteractionState.delete(chatId);
            
            await sendMessage(chatId, 'Sorry, I encountered an issue processing your request. Please send me a new message and I\'ll help you! 🤖');
            console.log('✅ Fallback message sent and user state cleared');
          }
        } catch (fallbackError) {
          console.error('❌ Even fallback message failed:', fallbackError.message);
        }
      });
      
      // Return success immediately for card interactions (optimized for serverless)
      console.log('✅ Sending immediate webhook response');
      
      // Set response headers for better serverless performance
      res.set({
        'Cache-Control': 'no-cache',
        'Connection': 'close'
      });
      
      return res.status(200).json({ 
        success: true, 
        message: 'Card interaction received',
        environment: process.env.VERCEL ? 'serverless' : 'local',
        timestamp: new Date().toISOString()
      });
    }
    // Handle legacy card callback format
    else if (type === 'card.action' && req.body.open_id) {
      console.log('🎯 Legacy card interaction received');
      console.log('🎯 Responding immediately to prevent timeout');
      
      handleCardInteraction(req.body).catch(error => 
        console.error('Error processing legacy card interaction:', error)
      );
      
      return res.status(200).json({ 
        success: true, 
        message: 'Legacy card interaction received' 
      });
    }
    // Handle direct card callback (alternative format)
    else if (req.body.action && (req.body.open_chat_id || req.body.open_id)) {
      console.log('🎯 Direct card callback received');
      console.log('🎯 Responding immediately to prevent timeout');
      
      handleCardInteraction(req.body).catch(error => 
        console.error('Error processing direct card interaction:', error)
      );
      
      return res.status(200).json({ 
        success: true, 
        message: 'Direct card interaction received' 
      });
    }
    else {
      console.log('⏭️ Unknown event type or structure');
      console.log('📋 Available keys:', Object.keys(req.body));
      if (header) {
        console.log('📋 Header event type:', header.event_type);
      }
      
      // Enhanced debugging for unknown events
      console.log('🔍 DEBUGGING UNKNOWN EVENT:');
      console.log('  - Full body structure:', JSON.stringify(req.body, null, 2));
      console.log('  - Is this a card interaction?', !!req.body.action);
      console.log('  - Has open_chat_id:', !!req.body.open_chat_id);
      console.log('  - Has open_id:', !!req.body.open_id);
      
      // Try to handle as potential card interaction anyway
      if (req.body.action && (req.body.open_chat_id || req.body.open_id)) {
        console.log('🎯 ATTEMPTING to handle as card interaction...');
        console.log('🎯 Responding immediately to prevent timeout');
        
        handleCardInteraction(req.body).catch(error => 
          console.error('Error processing unknown card interaction:', error)
        );
        
        return res.status(200).json({ 
          success: true, 
          message: 'Unknown card interaction handled' 
        });
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
    
    // Check if this is a new conversation - show page selection buttons
    if (isNewConversation(chat_id) && !isInTicketFlow && (!userMessage || userMessage.length < 5)) {
      console.log('🆕 New conversation detected, sending page selection buttons');
      await sendPageSelectionMessage(chat_id);
      return;
    }
    
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
      if (typeof aiResponseData === 'object' && aiResponseData.response !== undefined) {
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

      // Only send text message if we have a response and it's not an interactive card
      if (aiResponse && !responseMetadata.interactiveCard) {
        console.log('📤 Sending response to Lark...');
        // Send response back to Lark
        await sendMessage(chat_id, aiResponse);
        console.log('🎉 Message sent successfully!');
      } else if (responseMetadata.interactiveCard) {
        console.log('🎯 Interactive card already sent, skipping text response');
      }
      
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
async function generateAIResponse(userMessage, chat_id, senderId = null) {
  const startTime = Date.now();
  
  try {
    // Ensure knowledge base is initialized for serverless environments
    await ensureKnowledgeBaseInitialized();
    
    console.log('🧠 Calling OpenAI with message:', userMessage);
    
    // Get or create conversation context
    if (!conversationContext.has(chat_id)) {
      conversationContext.set(chat_id, []);
    }
    
    const context = conversationContext.get(chat_id);
    console.log('📚 Current context length:', context.length);
    
    // Check if user is in ticket creation flow
    const ticketState = ticketCollectionState.get(chat_id);
    if (ticketState) {
      return await handleTicketCreationFlow(chat_id, userMessage, ticketState, senderId);
    }
    
    // Check if user is in text-based interaction mode
    const userState = userInteractionState.get(chat_id);
    if (userState && userState.step === 'text_page_selection') {
      console.log('📝 User in text page selection mode');
      // Clear the user state to allow normal AI interaction
      userInteractionState.delete(chat_id);
    }
    
    if (userState && userState.step === 'text_faq_mode') {
      console.log('💬 User in text FAQ mode for page:', userState.selectedPage);
      // Clear the user state to allow normal AI interaction
      userInteractionState.delete(chat_id);
    }
    
    // Check if user is confirming they want to create a ticket
    const isConfirmingTicket = checkTicketConfirmation(context, userMessage);
    if (isConfirmingTicket) {
      console.log('✅ User confirming ticket creation, starting flow...');
      const category = categorizeIssue(userMessage, context);
      return await startTicketCreation(chat_id, userMessage, category, senderId);
    }
    
    // Check for simple greetings or restart commands - show page selection buttons
    const greetingPatterns = [
      /^(hi|hello|hey|help|start|menu|options)$/i,
      /^(good morning|good afternoon|good evening)$/i,
      /^(how can|what can).*help/i,
      /^need help$/i,
      /^show.*options$/i,
      /^main menu$/i,
      /^restart$/i,
      /^reset$/i,
      /^begin$/i,
      /^page.*selection$/i,
      /^show.*pages$/i
    ];
    
    const isGreeting = greetingPatterns.some(pattern => pattern.test(userMessage.trim()));
    
    // In serverless environment, use simpler card for better reliability
    const useSimpleCard = process.env.VERCEL && isGreeting;
    
    // Show page buttons for greetings (new conversations) or restart commands (existing conversations)
    if (isGreeting && (context.length === 0 || /^(restart|reset|main menu|page.*selection|show.*pages)$/i.test(userMessage.trim()))) {
      console.log('👋 Greeting/restart detected, sending page selection buttons');
      
      // Clear user interaction state to reset the flow
      userInteractionState.delete(chat_id);
      
      let cardSent = false;
      
      try {
        let cardResult;
        if (useSimpleCard) {
          // Send simplified card for serverless environment
          cardResult = await sendSimplePageSelectionCard(chat_id);
          console.log('✅ Simple page selection card sent successfully');
        } else {
          cardResult = await sendPageSelectionMessage(chat_id);
          console.log('✅ Page selection card sent successfully');
        }
        
        // Check if card sending failed gracefully
        if (cardResult && cardResult.success === false) {
          console.log('⚠️ Card sending failed gracefully, using text fallback');
          throw new Error(cardResult.error || 'Card sending failed');
        } else {
          cardSent = true;
        }
      } catch (cardError) {
        console.error('❌ Failed to send page selection card:', cardError.message || cardError);
        console.log('🔄 Falling back to text message...');
        
        // Fallback to text message if card fails
        const fallbackMessage = `👋 Welcome to PM-Next Support Bot! 🤖

Please let me know which page you need help with:
📊 Dashboard
💼 Jobs  
👥 Candidates
🏢 Clients
📅 Calendar
💰 Claims

Or ask me anything about PM-Next directly!`;
        
        try {
          await sendMessage(chat_id, fallbackMessage);
          console.log('✅ Text fallback sent successfully');
        } catch (textError) {
          console.error('❌ Even text fallback failed:', textError.message);
          // At this point, we'll just return an error response
        }
      }
      
      const responseTime = Date.now() - startTime;
      return {
        response: cardSent ? '' : 'Welcome! Please let me know which page you need help with: Dashboard, Jobs, Candidates, Clients, Calendar, or Claims.',
        responseType: 'greeting_buttons',
        processingTimeMs: responseTime,
        interactiveCard: cardSent,
        fallbackUsed: !cardSent
      };
    }
    
    // Check for escalation triggers
    console.log('🎯 Checking escalation triggers for message:', userMessage);
    const shouldEscalate = shouldEscalateToTicket(context, userMessage);
    const category = categorizeIssue(userMessage, context);
    console.log('📊 Escalation result:', shouldEscalate, 'Category:', category);
    
    if (shouldEscalate) {
      console.log('🚨 Escalation triggered for category:', category);
      
      // Check for direct escalation phrases that should skip FAQs
      const directEscalationPhrases = [
        // Existing direct escalation phrases
        /still.*(not|doesn't|don't|doesnt).*(work|working)/i,
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
      
      // Check if we've already shown FAQs for ANY category in recent context
      const hasShownAnyFAQs = context.some(msg => 
        msg.role === 'assistant' && 
        msg.content && 
        msg.content.toLowerCase().includes('faqs:')
      );
      
      // If user indicates something "still doesn't work" after we've shown FAQs, escalate immediately
      const isFollowUpFailure = /still.*(not|doesn't|don't|doesnt).*(work|working|help|helpful)/i.test(userMessage);
      
      if (isDirectEscalation || (hasShownAnyFAQs && isFollowUpFailure)) {
        // Direct escalation or follow-up after FAQ failure - go straight to ticket creation
        console.log('🎫 Direct escalation or FAQ follow-up failure detected, starting ticket creation');
        
        // Use the original category from conversation context if the current message is generic
        let escalationCategory = category;
        if (category === 'general' && hasShownAnyFAQs) {
          // Look for the category from recent FAQ responses
          const recentFAQMessage = context.slice().reverse().find(msg => 
            msg.role === 'assistant' && 
            msg.content && 
            msg.content.toLowerCase().includes('faqs:')
          );
          
          if (recentFAQMessage) {
            if (recentFAQMessage.content.toLowerCase().includes('candidate management')) {
              escalationCategory = 'candidate_management';
            } else if (recentFAQMessage.content.toLowerCase().includes('job management')) {
              escalationCategory = 'job_management';
            } else if (recentFAQMessage.content.toLowerCase().includes('login')) {
              escalationCategory = 'authentication';
            }
          }
        }
        
        console.log('📂 Using escalation category:', escalationCategory);
        return await startTicketCreation(chat_id, userMessage, escalationCategory, senderId);
      }
      
      // Check if we've already shown FAQs for this specific category
      const hasShownSpecificCategoryFAQs = context.some(msg => 
        msg.content && msg.content.toLowerCase().includes('faqs:') && 
        msg.content.toLowerCase().includes(category.replace('_', ' ').toLowerCase())
      );
      
      if (!hasShownSpecificCategoryFAQs && FAQ_RESPONSES[category] && category !== 'general') {
        // First escalation - show relevant FAQs only for specific categories (not general)
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
        // Second escalation, general category, or no specific FAQs - start ticket creation
        console.log('🎫 Second escalation or general category, starting ticket creation immediately');
        return await startTicketCreation(chat_id, userMessage, category, senderId);
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
    
    // Determine the correct user ID type based on format
    let userIdType;
    if (actualUserId.startsWith('ou_')) {
      userIdType = 'open_id';
    } else if (actualUserId.match(/^[a-f0-9]{8}$/)) {
      userIdType = 'user_id';
    } else {
      userIdType = 'open_id'; // Default
    }
    
    console.log('🎯 User ID type determined:', userIdType);

    try {
      console.log('🔍 Calling Lark SDK for user info...');
      
      const response = await larkClient.contact.user.get({
        path: {
          user_id: actualUserId
        },
        params: {
          user_id_type: userIdType
        }
      });

      console.log('📊 User SDK response:', response);
      
      if (response.code === 0 && response.data?.user) {
        const userInfo = {
          user_id: actualUserId,
          name: response.data.user.name || 'Unknown User',
          email: response.data.user.email || null,
          mobile: response.data.user.mobile || null,
          avatar: response.data.user.avatar?.avatar_240 || null
        };

        console.log('✅ User info fetched successfully via SDK:', userInfo);
        return userInfo;
      } else {
        console.log('❌ SDK call failed:', 'Code:', response.code, 'Message:', response.msg);
      }
    } catch (sdkError) {
      console.log('❌ SDK call error:', sdkError.message);
    }

    console.error('❌ SDK call failed for user ID:', actualUserId);
    
    // Return basic fallback info
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

// Send message to Lark using SDK
async function sendMessage(chat_id, message, maxRetries = 3) {
  console.log('📨 Sending message to chat:', chat_id);
  console.log('📝 Message content:', message);
  
  // Detect the ID type based on the chat ID format
  let receiveIdType = 'chat_id';
  if (chat_id.startsWith('ou_')) {
    receiveIdType = 'open_id';
  } else if (chat_id.startsWith('oc_')) {
    receiveIdType = 'chat_id';
  } else if (chat_id.startsWith('og_')) {
    receiveIdType = 'chat_id';
  }

  console.log('🔍 Using receive_id_type:', receiveIdType);

  const messageParams = {
    params: {
      receive_id_type: receiveIdType
    },
    data: {
      receive_id: chat_id,
      msg_type: 'text',
      content: JSON.stringify({
        text: message
      }),
      uuid: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
  };

  // Retry logic for network issues
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${maxRetries}: Using Lark SDK for message sending...`);
      
      if (attempt > 1) {
        // Add exponential backoff delay for retries
        const delay = Math.min(1000 * Math.pow(2, attempt - 2), 5000); // 500ms, 1s, 2s, max 5s
        console.log(`⏱️ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Generate new UUID for retry to avoid duplicates
        messageParams.data.uuid = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      
      console.log('📊 SDK Message Parameters:', JSON.stringify(messageParams, null, 2));
      
      const messageData = await larkClient.im.message.create(messageParams);
      
      console.log('✅ SDK message sending successful');
      console.log('📊 SDK response code:', messageData?.code);
      
      if (!messageData || messageData.code !== 0) {
        throw new Error(`SDK message failed: ${messageData?.msg || 'Unknown error'} (Code: ${messageData?.code})`);
      }

      console.log('✅ Message sent successfully via SDK');
      console.log('📬 Message ID:', messageData.data?.message_id);
      console.log('📅 Timestamp:', messageData.data?.create_time);
      
      return messageData;
      
    } catch (error) {
      const isNetworkError = error.code === 'ECONNRESET' || 
                            error.code === 'ENOTFOUND' || 
                            error.code === 'ETIMEDOUT' ||
                            error.message?.includes('socket hang up') ||
                            error.message?.includes('timeout') ||
                            error.message?.includes('network');
      
      console.error(`❌ Attempt ${attempt}/${maxRetries} failed:`, error.message);
      console.error('🔍 Error code:', error.code);
      console.error('🌐 Is network error:', isNetworkError);
      
      if (attempt === maxRetries || !isNetworkError) {
        // Last attempt or non-network error - throw the error
        console.error('❌ All retry attempts exhausted or non-recoverable error');
        console.error('📋 Final error details:', error.message);
        throw error;
      }
      
      console.log(`🔄 Network error detected, will retry (${maxRetries - attempt} attempts remaining)`);
    }
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

// Enhanced environment check for debugging
app.get('/debug-env', (req, res) => {
  const envVars = {
    // Lark configuration
    larkAppId: !!process.env.LARK_APP_ID,
    larkAppSecret: !!process.env.LARK_APP_SECRET,
    larkSupportGroupId: !!process.env.LARK_SUPPORT_GROUP_ID,
    
    // OpenAI configuration  
    openaiApiKey: !!process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || 'not set',
    
    // Supabase configuration
    supabaseUrl: !!process.env.SUPABASE_URL,
    supabaseAnonKey: !!process.env.SUPABASE_ANON_KEY,
    
    // Environment info
    nodeEnv: process.env.NODE_ENV || 'not set',
    vercel: !!process.env.VERCEL,
    platform: process.platform,
    nodeVersion: process.version,
    
    // Partial values for debugging (first 10 chars)
    larkAppIdPrefix: process.env.LARK_APP_ID ? process.env.LARK_APP_ID.substring(0, 10) + '...' : 'NOT SET',
    supabaseUrlPrefix: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 30) + '...' : 'NOT SET'
  };
  
  res.json({
    timestamp: new Date().toISOString(),
    environment: envVars,
    deployment: process.env.VERCEL ? 'Vercel Serverless' : 'Local Development'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'PM-Next Lark Bot',
    sdk_version: 'lark-sdk-1.0.0',
    environment: {
      hasAppId: !!process.env.LARK_APP_ID,
      hasAppSecret: !!process.env.LARK_APP_SECRET,
      hasVerificationToken: !!process.env.LARK_VERIFICATION_TOKEN
    }
  });
});

// Test SDK endpoint
app.post('/test-sdk', async (req, res) => {
  try {
    console.log('🧪 Testing SDK configuration...');
    
    const { chatId = 'test_chat_id', messageType = 'text' } = req.body;
    
    if (messageType === 'text') {
      const testParams = {
        params: {
          receive_id_type: 'chat_id'
        },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({
            text: '🧪 SDK Test Message - This is a test to verify SDK configuration'
          }),
          uuid: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      };
      
      console.log('📊 Test SDK Parameters:', JSON.stringify(testParams, null, 2));
      
      res.json({
        success: true,
        message: 'SDK parameters validated',
        parameters: testParams,
        timestamp: new Date().toISOString()
      });
    } else {
      const testCardContent = {
        "config": { "wide_screen_mode": true },
        "header": {
          "template": "blue",
          "title": { "content": "🧪 SDK Test Card", "tag": "plain_text" }
        },
        "elements": [
          {
            "tag": "div",
            "text": { "content": "SDK configuration test successful!", "tag": "plain_text" }
          }
        ]
      };
      
      const testParams = {
        params: {
          receive_id_type: 'chat_id'
        },
        data: {
          receive_id: chatId,
          msg_type: 'interactive',
          content: JSON.stringify(testCardContent),
          uuid: `test_card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      };
      
      console.log('📊 Test Card SDK Parameters:', JSON.stringify(testParams, null, 2));
      
      res.json({
        success: true,
        message: 'SDK card parameters validated',
        parameters: testParams,
        cardContent: testCardContent,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ SDK test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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

// Test interactive page selection endpoint
app.post('/test-page-buttons', async (req, res) => {
  try {
    const { chatId } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }
    
    console.log('🧪 Testing page selection buttons for chat:', chatId);
    await sendPageSelectionMessage(chatId);
    
    res.json({
      success: true,
      message: 'Page selection buttons sent successfully',
      chatId: chatId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Test page buttons error:', error);
    res.status(500).json({ 
      error: 'Failed to send page buttons',
      details: error.message 
    });
  }
});

// Test simple card endpoint
app.post('/test-simple-card', async (req, res) => {
  try {
    const { chatId } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }
    
    console.log('🧪 Testing simple card for chat:', chatId);
    
    // Send a very simple card to test basic functionality
    const simpleCard = {
      "elements": [
        {
          "tag": "div",
          "text": {
            "content": "Simple test card",
            "tag": "plain_text"
          }
        },
        {
          "tag": "action",
          "actions": [
            {
              "tag": "button",
              "text": {
                "content": "Test Button",
                "tag": "plain_text"
              },
              "type": "primary",
              "value": "test_action"
            }
          ]
        }
      ]
    };
    
    await sendInteractiveCard(chatId, simpleCard);
    
    res.json({
      success: true,
      message: 'Simple test card sent successfully',
      chatId: chatId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Test simple card error:', error);
    res.status(500).json({ 
      error: 'Failed to send simple card',
      details: error.message 
    });
  }
});

// Test serverless-specific card sending  
app.post('/test-serverless-card', async (req, res) => {
  try {
    const { chatId } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }
    
    console.log('🌐 Testing serverless-optimized card for chat:', chatId);
    console.log('🌐 Environment: Vercel =', !!process.env.VERCEL);
    
    // Very minimal card optimized for serverless
    const serverlessCard = {
      "config": {
        "wide_screen_mode": false
      },
      "elements": [
        {
          "tag": "div",
          "text": {
            "content": "🌐 Serverless Test Card",
            "tag": "plain_text"
          }
        },
        {
          "tag": "action", 
          "actions": [
            {
              "tag": "button",
              "text": {
                "content": "Test Action",
                "tag": "plain_text"
              },
              "type": "primary",
              "value": "serverless_test"
            }
          ]
        }
      ]
    };
    
    console.log('📦 Serverless card size:', JSON.stringify(serverlessCard).length, 'bytes');
    
    const startTime = Date.now();
    await sendInteractiveCard(chatId, serverlessCard);
    const sendTime = Date.now() - startTime;
    
    res.json({
      success: true,
      message: 'Serverless card test completed',
      environment: process.env.VERCEL ? 'Vercel' : 'Local',
      sendTimeMs: sendTime,
      cardSize: JSON.stringify(serverlessCard).length,
      nodeVersion: process.version,
      chatId: chatId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Serverless card test error:', error);
    res.status(500).json({ 
      error: 'Failed to send serverless test card',
      details: error.message,
      environment: process.env.VERCEL ? 'Vercel' : 'Local'
    });
  }
});

// Test basic message sending
app.post('/test-basic-message', async (req, res) => {
  try {
    const { chatId, message } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }
    
    const testMessage = message || 'Test message from server.js - basic message functionality working! 🎉';
    
    console.log('🧪 Testing basic message for chat:', chatId);
    await sendMessage(chatId, testMessage);
    
    res.json({
      success: true,
      message: 'Basic message sent successfully',
      chatId: chatId,
      sentMessage: testMessage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Test basic message error:', error);
    res.status(500).json({ 
      error: 'Failed to send basic message',
      details: error.message 
    });
  }
});

// Test hybrid knowledge FAQ system
app.post('/test-hybrid-faq', async (req, res) => {
  try {
    const { pageKey = 'dashboard', faqQuestion = 'How to view staff performance metrics?' } = req.body;
    
    console.log('🧪 Testing hybrid knowledge FAQ system');
    console.log('🧪 Page:', pageKey);
    console.log('🧪 Question:', faqQuestion);
    
    // Test the hybrid knowledge FAQ function
    const startTime = Date.now();
    const answer = await getFastFAQAnswer(pageKey, faqQuestion);
    const processingTime = Date.now() - startTime;
    
    // Check knowledge base status
    await ensureKnowledgeBaseInitialized();
    const kbStats = {
      length: PM_NEXT_KNOWLEDGE.length,
      qaCount: (PM_NEXT_KNOWLEDGE.match(/### Q:/g) || []).length,
      hasDatabase: PM_NEXT_KNOWLEDGE.includes('Additional Support Solutions'),
      sampleContent: PM_NEXT_KNOWLEDGE.substring(0, 200) + '...'
    };
    
    res.json({
      success: true,
      message: 'Hybrid FAQ test completed',
      results: {
        pageKey,
        faqQuestion,
        answer: answer ? answer.substring(0, 500) + (answer.length > 500 ? '...' : '') : null,
        fullAnswerLength: answer ? answer.length : 0,
        processingTimeMs: processingTime,
        usedKnowledgeBase: answer ? answer.includes('Based on our PM-Next knowledge base') : false,
        usedFallback: answer ? !answer.includes('Based on our PM-Next knowledge base') : true
      },
      knowledgeBaseStats: kbStats,
      environment: process.env.VERCEL ? 'Vercel' : 'Local',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Hybrid FAQ test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test serverless optimized card with enhanced error handling
app.post('/test-serverless-optimized', async (req, res) => {
  try {
    const { chatId } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }
    
    console.log('🌐 Testing serverless-optimized card with enhanced error handling');
    console.log('🌐 Environment check:', {
      VERCEL: !!process.env.VERCEL,
      NODE_ENV: process.env.NODE_ENV,
      LARK_APP_ID: !!process.env.LARK_APP_ID,
      LARK_APP_SECRET: !!process.env.LARK_APP_SECRET
    });
    
    // Ultra-minimal card for serverless testing
    const minimalCard = {
      "elements": [
        {
          "tag": "div",
          "text": {
            "content": "🔧 Serverless Test - Enhanced",
            "tag": "plain_text"
          }
        },
        {
          "tag": "action",
          "actions": [
            {
              "tag": "button",
              "text": {
                "content": "✅ Working",
                "tag": "plain_text"
              },
              "type": "primary",
              "value": "test_working"
            },
            {
              "tag": "button",
              "text": {
                "content": "❌ Failed",
                "tag": "plain_text"
              },
              "type": "default",
              "value": "test_failed"
            }
          ]
        }
      ]
    };
    
    console.log('📦 Minimal card payload size:', JSON.stringify(minimalCard).length, 'bytes');
    
    const startTime = Date.now();
    const result = await sendInteractiveCard(chatId, minimalCard);
    const duration = Date.now() - startTime;
    
    console.log('⏱️ Card sending took:', duration + 'ms');
    console.log('📊 Result:', result);
    
    if (result && result.success === false) {
      // Card failed, test text fallback
      console.log('⚠️ Card failed, testing text fallback...');
      const textStartTime = Date.now();
      await sendMessage(chatId, '🔧 Serverless test - Card failed, but text messaging is working! ✅');
      const textDuration = Date.now() - textStartTime;
      
      res.json({
        success: true,
        message: 'Card failed but text fallback worked',
        environment: process.env.VERCEL ? 'Vercel' : 'Local',
        cardResult: result,
        cardDuration: duration,
        textDuration: textDuration,
        fallbackUsed: true,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: true,
        message: 'Serverless optimized card sent successfully',
        environment: process.env.VERCEL ? 'Vercel' : 'Local',
        cardResult: result,
        duration: duration,
        fallbackUsed: false,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Serverless optimized test error:', error);
    
    // Try text fallback even on exception
    try {
      await sendMessage(req.body.chatId, '⚠️ Serverless test encountered errors, but basic messaging still works!');
      res.json({
        success: false,
        error: error.message,
        textFallbackWorked: true,
        environment: process.env.VERCEL ? 'Vercel' : 'Local',
        timestamp: new Date().toISOString()
      });
    } catch (textError) {
      res.status(500).json({ 
        success: false,
        error: error.message,
        textFallbackWorked: false,
        textError: textError.message,
        environment: process.env.VERCEL ? 'Vercel' : 'Local',
        timestamp: new Date().toISOString()
      });
    }
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

// Initialize knowledge base for serverless environment
async function initializeForServerless() {
  console.log('🚀 Serverless environment detected - initializing for Vercel');
  try {
    await ensureKnowledgeBaseInitialized();
    console.log(`🗄️ Hybrid knowledge base initialized (static + dynamic content)`);
  } catch (error) {
    console.error('⚠️ Knowledge base initialization failed:', error.message);
    console.log('🔄 Using static file-based knowledge base only');
  }
}

// For local development only
if (!process.env.VERCEL && !process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.listen(PORT, async () => {
    console.log(`🤖 PM-Next Lark Bot server is running on port ${PORT}`);
    console.log(`📝 Health check: http://localhost:${PORT}/health`);
    
    try {
      await ensureKnowledgeBaseInitialized();
      console.log(`🗄️ Hybrid knowledge base initialized (static + dynamic content)`);
    } catch (error) {
      console.error('⚠️ Knowledge base initialization failed:', error.message);
      console.log('🔄 Using static file-based knowledge base only');
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down PM-Next Lark Bot server...');
    process.exit(0);
  });
} else {
  // Serverless environment - initialize on first request
  initializeForServerless();
}

// Enhanced debugging for card interactions
app.post('/debug-cards', async (req, res) => {
  try {
    const { chatId, testType = 'page_selection' } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }
    
    console.log('🐛 ========== CARD DEBUG TEST ==========');
    console.log('🐛 Chat ID:', chatId);
    console.log('🐛 Test Type:', testType);
    console.log('🐛 SDK initialized:', !!larkClient);
    console.log('🐛 SDK config:', {
      appId: !!process.env.LARK_APP_ID,
      appSecret: !!process.env.LARK_APP_SECRET
    });
    
    if (testType === 'page_selection') {
      console.log('🐛 Testing page selection card...');
      await sendPageSelectionMessage(chatId);
      
      res.json({
        success: true,
        message: 'Page selection card sent',
        testType: testType,
        chatId: chatId
      });
    } else if (testType === 'faq_dashboard') {
      console.log('🐛 Testing FAQ card for dashboard...');
      await sendPageFAQs(chatId, 'dashboard');
      
      res.json({
        success: true,
        message: 'Dashboard FAQ card sent',
        testType: testType,
        chatId: chatId
      });
    } else {
      res.status(400).json({ error: 'Unknown test type. Use page_selection or faq_dashboard' });
    }
    
  } catch (error) {
    console.error('🐛 Card debug test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Export the app for Vercel
module.exports = app;

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

async function startTicketCreation(chat_id, userMessage, category, senderId = null) {
  console.log('🎫 Starting ticket creation for chat:', chat_id);
  
  // Initialize ticket collection state with user information
  ticketCollectionState.set(chat_id, {
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

async function handleTicketCreationFlow(chat_id, userMessage, ticketState, senderId = null) {
  const { step, data, category, senderId: storedSenderId } = ticketState;
  const actualSenderId = senderId || storedSenderId;
  
  switch (step) {
    case 'title':
      data.title = userMessage.trim();
      ticketState.step = 'description';
      ticketCollectionState.set(chat_id, ticketState);
      
      return `**Step 2 of 3: Detailed Description**
Please describe the issue in detail. What exactly happens when you try to perform the action?`;

    case 'description':
      data.description = userMessage.trim();
      ticketState.step = 'steps';
      ticketCollectionState.set(chat_id, ticketState);
      
      return `**Step 3 of 3: Steps Attempted**
What steps have you already tried to resolve this issue? (e.g., "Refreshed page, cleared cache, tried different browser")`;

    case 'steps':
      data.stepsAttempted = userMessage.trim().split(',').map(s => s.trim());
      
      // Set default values for removed steps
      data.browser = 'Not specified';
      data.device = 'Not specified';
      data.urgency = 'medium'; // Default urgency level
      
      // Create the ticket immediately after step 3
      const ticket = await createTicketFromData(chat_id, data, category, ticketState.originalMessage, actualSenderId);
      
      // Clear the collection state
      ticketCollectionState.delete(chat_id);
      
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
      ticketCollectionState.delete(chat_id);
      return `I encountered an error in the ticket creation process. Let me start over. Please describe your issue and I'll help you create a support ticket.`;
  }
}

async function createTicketFromData(chat_id, data, category, originalMessage, senderId = null) {
  try {
    console.log('🔧 Creating ticket with data:', {
      chat_id,
      category,
      title: data.title,
      urgency: data.urgency,
      senderId
    });
    
    // Get actual user info from Lark
    let userInfo = null;
    let actualUserId = senderId?.id || `user_${chat_id}`;
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
      chat_id: chat_id,
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
  if (!messageId) {
    console.log('⚠️ No message ID provided for parent message lookup');
    return null;
  }
  
  try {
    console.log('🔍 Fetching parent message content for:', messageId);
    
    try {
      console.log('🔄 Using Lark SDK for message content...');
      const response = await larkClient.im.message.get({
        path: {
          message_id: messageId
        }
      });

      console.log('📊 Parent message SDK response:', response);
      
      if (response.code === 0 && response.data?.items?.[0]) {
        const messageData = response.data.items[0];
        
        // Extract text content based on message type
        let content = '';
        if (messageData.msg_type === 'text' && messageData.body?.content) {
          const textContent = JSON.parse(messageData.body.content);
          content = textContent.text || '';
        } else if (messageData.msg_type === 'interactive' && messageData.body?.content) {
          // For interactive cards, try to extract readable content
          const cardContent = JSON.parse(messageData.body.content);
          content = JSON.stringify(cardContent); // Fallback to JSON string
        }
        
        console.log('✅ Parent message content retrieved via SDK:', content?.substring(0, 100) + '...');
        return content;
      } else {
        console.log('❌ SDK call failed:', 'Code:', response.code, 'Message:', response.msg);
        return null;
      }
    } catch (sdkError) {
      console.log('❌ SDK call error:', sdkError.message);
      return null;
    }
    
  } catch (error) {
    console.error('❌ Error fetching parent message content:', error);
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

// Main page buttons and FAQs configuration
const MAIN_PAGES = {
  'dashboard': {
    name: '📊 Dashboard',
    description: 'Central hub with analytics and KPIs',
    faqs: [
      'How to view staff performance metrics?',
      'How to filter data by time period?',
      'How to understand pipeline values?',
      'How to access role-based analytics?'
    ]
  },
  'jobs': {
    name: '💼 Jobs',
    description: 'Job management and candidate assignment',
    faqs: [
      'How to create a new job posting?',
      'How to assign candidates to jobs?',
      'How to track job status and pipeline?',
      'How to manage job budgets and percentages?'
    ]
  },
  'candidates': {
    name: '👥 Candidates',
    description: 'Candidate management and profiles',
    faqs: [
      'How to add a new candidate?',
      'How to upload and parse resumes?',
      'How to assign candidates to jobs?',
      'How to track candidate communication history?'
    ]
  },
  'clients': {
    name: '🏢 Clients',
    description: 'Client relationship management',
    faqs: [
      'How to add a new client?',
      'How to organize parent company relationships?',
      'How to track client job history?',
      'How to manage client financial values?'
    ]
  },
  'calendar': {
    name: '📅 Calendar',
    description: 'Scheduling and event management',
    faqs: [
      'How to schedule a candidate meeting?',
      'How to request leave approval?',
      'How to create client meetings?',
      'How to view team calendar events?'
    ]
  },
  'claims': {
    name: '💰 Claims',
    description: 'Expense claims and approvals',
    faqs: [
      'How to submit an expense claim?',
      'How to upload receipt attachments?',
      'How to approve claims as a manager?',
      'How to track claim status and history?'
    ]
  }
};

// Store user interaction state
const userInteractionState = new Map(); // chatId -> { step, selectedPage, awaiting }

// Fast FAQ answers for serverless performance
const FAST_FAQ_ANSWERS = {
  dashboard: {
    'How to view staff performance metrics?': `**Viewing Staff Performance Metrics:**

1. **Go to Dashboard** → Main navigation
2. **Select Analytics Tab** → Staff Performance section
3. **Choose Time Period** → Use date filters (Last 7 days, 30 days, etc.)
4. **View Key Metrics:**
   - Total placements made
   - Revenue generated
   - Client meetings completed
   - Candidate submissions

5. **Detailed Reports** → Click on any staff member for individual breakdown
6. **Export Data** → Use "Export" button for Excel/PDF reports

💡 **Tip:** Use the comparison view to compare multiple staff members side by side.`,

    'How to filter data by time period?': `**Filtering Data by Time Period:**

1. **Date Filter Controls** → Top right of Dashboard
2. **Quick Filters:**
   - Today
   - Last 7 days
   - Last 30 days
   - This Month
   - Last Month
   - This Quarter

3. **Custom Date Range:**
   - Click "Custom Range"
   - Select start and end dates
   - Apply filter

4. **Save Filters** → Use "Save View" to remember your preferred settings
5. **Reset Filters** → Click "Clear All" to return to default view

📊 All charts and metrics will automatically update based on your selected time period.`,

    'How to understand pipeline values?': `**Understanding Pipeline Values:**

**Pipeline Value = Total potential revenue from active opportunities**

1. **Pipeline Components:**
   - Active job opportunities
   - Expected placement fees
   - Probability of success
   - Expected close dates

2. **Value Calculation:**
   - Job Value × Success Probability = Weighted Pipeline Value
   - Example: $50,000 job × 75% probability = $37,500 pipeline value

3. **Pipeline Stages:**
   - Early (0-25% probability)
   - Developing (25-50%)
   - Advanced (50-75%)
   - Near Close (75-90%)
   - Won/Lost (100%/0%)

4. **Viewing Pipeline:**
   - Dashboard → Pipeline Widget
   - Color-coded by stage
   - Drill down for details

💰 **Focus on high-value, high-probability opportunities for best results.**`,

    'How to access role-based analytics?': `**Accessing Role-Based Analytics:**

**Your analytics depend on your role permissions:**

1. **Admin Users:**
   - Full company analytics
   - All staff performance
   - Financial reports
   - System usage stats

2. **Managers:**
   - Team performance metrics
   - Assigned client analytics
   - Budget vs actual reports
   - Staff under management

3. **Consultants:**
   - Personal performance only
   - Own client/candidate metrics
   - Personal targets vs actual
   - Commission tracking

4. **To Access:**
   - Dashboard → Analytics section
   - Available reports show based on your role
   - Request additional access from your manager

🔐 **Note:** If you need access to additional analytics, contact your system administrator.`
  },
  
  jobs: {
    'How to create a new job posting?': `**Creating a New Job Posting:**

1. **Navigate:** Dashboard → Jobs → "Create New Job"
2. **Basic Information:**
   - Job Title
   - Client/Company
   - Location (Remote/Hybrid/Office)
   - Salary Range

3. **Job Details:**
   - Job Description
   - Required Skills
   - Experience Level
   - Education Requirements

4. **Commercial Details:**
   - Fee Percentage
   - Expected Start Date
   - Job Priority Level

5. **Save & Activate:**
   - Click "Save as Draft" for later editing
   - Click "Publish" to make active

✅ **Tip:** Use job templates for similar positions to save time!`,

    'How to assign candidates to jobs?': `**Assigning Candidates to Jobs:**

**Method 1 - From Job Page:**
1. Open the job → "Candidates" tab
2. Click "Add Candidate"
3. Search by name, skills, or location
4. Select candidate(s) → Click "Assign"

**Method 2 - From Candidate Page:**
1. Open candidate profile → "Jobs" tab
2. Click "Add to Job"
3. Search for relevant jobs
4. Select job → Click "Assign"

**Method 3 - Bulk Assignment:**
1. Candidates page → Select multiple candidates
2. Bulk Actions → "Assign to Job"
3. Choose job from dropdown

👥 **Track assignment status in both job and candidate views.**`,

    'How to track job status and pipeline?': `**Tracking Job Status & Pipeline:**

**Job Statuses:**
- 📝 **Draft** - Being prepared
- 🟢 **Active** - Currently recruiting
- 🟡 **On Hold** - Temporarily paused
- 🔴 **Cancelled** - No longer required
- ✅ **Filled** - Successfully completed

**Pipeline Tracking:**
1. **Jobs Dashboard** → Pipeline view
2. **Status Columns** → Drag jobs between stages
3. **Progress Indicators** → Visual progress bars
4. **Time Tracking** → Days in each stage

**Reports Available:**
- Time to fill analysis
- Success rate by consultant
- Pipeline value by stage
- Client satisfaction scores

📊 **Use filters to focus on specific job types, clients, or time periods.**`,

    'How to manage job budgets and percentages?': `**Managing Job Budgets & Percentages:**

**Setting Fee Percentages:**
1. Job Details → "Commercial" section
2. Set fee percentage (typically 15-25%)
3. Choose payment terms (30/60/90 days)
4. Add any special conditions

**Budget Tracking:**
- **Expected Revenue** = Salary × Fee %
- **Actual Costs** = Time spent × hourly rate
- **Profit Margin** = Revenue - Costs

**Managing Budgets:**
1. **Set Targets** → Expected hours to fill
2. **Track Progress** → Time spent vs. budget
3. **Monitor ROI** → Revenue per hour invested
4. **Adjust Strategy** → If over/under budget

💰 **Best Practice:** Review budget vs. actual monthly to optimize future estimates.`
  },

  candidates: {
    'How to add a new candidate?': `**Adding a New Candidate:**

1. **Navigate:** Dashboard → Candidates → "Add New Candidate"
2. **Personal Details:**
   - Full Name
   - Email & Phone
   - Location
   - LinkedIn Profile

3. **Professional Info:**
   - Current Position
   - Current Employer
   - Salary Expectations
   - Notice Period

4. **Upload Resume:**
   - Drag & drop or click to upload
   - AI will auto-parse information
   - Review and correct any errors

5. **Skills & Preferences:**
   - Add key skills
   - Set job preferences
   - Location preferences

6. **Save & Tag:**
   - Save candidate
   - Add relevant tags for easy searching

🚀 **The system will auto-suggest matching jobs once saved!**`,

    'How to upload and parse resumes?': `**Uploading & Parsing Resumes:**

**Upload Methods:**
1. **Drag & Drop** → Simply drag PDF/DOC files to upload area
2. **Click Upload** → Browse and select files
3. **Bulk Upload** → Select multiple files at once

**Supported Formats:**
- PDF (recommended)
- DOC/DOCX
- TXT files

**AI Parsing Features:**
- ✅ **Contact Information** → Auto-extracted
- ✅ **Work Experience** → Job titles, companies, dates
- ✅ **Education** → Degrees, institutions, years
- ✅ **Skills** → Technical and soft skills
- ✅ **Certifications** → Professional qualifications

**After Parsing:**
1. **Review Information** → Check for accuracy
2. **Edit if Needed** → Correct any mistakes
3. **Add Missing Info** → Fill gaps not captured
4. **Save Changes** → Finalize the profile

⚠️ **Always review AI-parsed data for accuracy before saving.**`,

    'How to assign candidates to jobs?': `**Assigning Candidates to Jobs:**

**Quick Assignment:**
1. **From Candidate Profile** → "Jobs" tab
2. **Click "Add to Job"** → Search for relevant positions
3. **Select Job** → Choose appropriate position
4. **Set Status** → Applied/Submitted/Interviewed
5. **Add Notes** → Reason for assignment

**Bulk Assignment:**
1. **Candidates List** → Select multiple candidates
2. **Bulk Actions** → "Assign to Job"
3. **Choose Job** → Select from dropdown
4. **Apply to All** → Confirm assignment

**Smart Matching:**
- System suggests best-fit jobs automatically
- Match score based on skills, location, salary
- Click "Auto-Suggest" for recommendations

**Track Assignments:**
- View in candidate profile → Applications tab
- Monitor progress through interview stages
- Update status as process advances

🎯 **Use matching scores to prioritize the best candidate-job fits.**`,

    'How to track candidate communication history?': `**Tracking Communication History:**

**Communication Types Tracked:**
- 📧 **Emails** → Sent/received
- 📞 **Phone Calls** → Logged with notes
- 💬 **Messages** → Internal team communications
- 📅 **Meetings** → Interview/consultation records

**Viewing History:**
1. **Candidate Profile** → "Communications" tab
2. **Filter by Type** → Email, calls, meetings, notes
3. **Sort by Date** → Most recent first
4. **Search Content** → Find specific conversations

**Adding Communications:**
1. **Quick Actions** → Email/Call/Note buttons
2. **Log Details** → Date, time, type, notes
3. **Tag Topics** → Interview, offer, feedback, etc.
4. **Set Reminders** → For follow-up actions

**Team Visibility:**
- All team communications visible
- Private notes (admin only)
- Client communications tracked
- Interview feedback recorded

📝 **Best Practice:** Log all candidate interactions immediately for complete history.**`
  },

  clients: {
    'How to add a new client?': `**Adding a New Client:**

1. **Navigate:** Dashboard → Clients → "Add New Client"
2. **Company Information:**
   - Company Name
   - Industry Sector
   - Company Size
   - Website URL

3. **Primary Contact:**
   - Contact Name & Title
   - Email & Phone
   - LinkedIn Profile
   - Preferred Communication Method

4. **Business Details:**
   - Annual Revenue (if known)
   - Typical Hiring Volume
   - Fee Preferences
   - Payment Terms

5. **Relationship Info:**
   - How did you meet?
   - Relationship strength
   - Key decision makers
   - Budget authority

6. **Save & Set Up:**
   - Save client details
   - Set up first job opportunity
   - Schedule initial meeting

🏢 **Pro Tip:** Add multiple contacts per client for better relationship coverage.**`,

    'How to organize parent company relationships?': `**Organizing Parent Company Relationships:**

**Setting Up Hierarchies:**
1. **Create Parent Company** → Add main corporate entity first
2. **Add Subsidiaries** → Create child companies
3. **Link Relationships** → Set parent-child connections
4. **Define Hierarchy** → Multiple levels supported

**Benefits of Proper Structure:**
- Consolidated reporting across all entities
- Shared contact databases
- Group-level fee negotiations
- Unified communication history

**Managing Relationships:**
1. **Parent Level** → Set global preferences, rates, terms
2. **Subsidiary Level** → Specific requirements, local contacts
3. **Reporting** → Roll-up or drill-down views
4. **Billing** → Centralized or distributed

**Best Practices:**
- Map organizational chart in system
- Identify key stakeholders at each level
- Set appropriate permissions for each entity
- Regular review of structure changes

🏗️ **Proper setup enables better account management and reporting.**`,

    'How to track client job history?': `**Tracking Client Job History:**

**Viewing Job History:**
1. **Client Profile** → "Jobs" tab
2. **Filter Options** → Active, completed, cancelled
3. **Sort by Date** → Most recent first
4. **Search Jobs** → By title, status, consultant

**Key Metrics Displayed:**
- Total jobs posted
- Average time to fill
- Success rate percentage
- Total revenue generated
- Current pipeline value

**Detailed Job Information:**
- Job specifications and requirements
- Assigned consultants
- Candidate submissions
- Interview progress
- Placement outcomes

**Historical Analysis:**
- Seasonal hiring patterns
- Preferred job types
- Success factors
- Areas for improvement

**Reports Available:**
- Client performance summary
- Year-over-year comparisons
- Consultant effectiveness by client
- Revenue trends and forecasts

📈 **Use historical data to predict future hiring needs and improve service delivery.**`,

    'How to manage client financial values?': `**Managing Client Financial Values:**

**Setting Up Financial Tracking:**
1. **Client Profile** → "Financial" tab
2. **Payment Terms** → 30/60/90 day options
3. **Preferred Rates** → Standard fee percentages
4. **Credit Limits** → If applicable
5. **Billing Preferences** → Consolidated or per-job

**Tracking Revenue:**
- **Pipeline Value** → Potential upcoming revenue
- **Invoiced Amount** → Billed but not paid
- **Received Revenue** → Actual payments
- **Outstanding Debt** → Overdue amounts

**Financial Reports:**
- Client profitability analysis
- Payment history and trends
- Average fee percentages achieved
- Revenue forecasting

**Managing Collections:**
- Automated payment reminders
- Escalation procedures
- Credit hold capabilities
- Payment plan options

💰 **Regular financial reviews help identify your most profitable client relationships.**`
  },

  calendar: {
    'How to schedule a candidate meeting?': `**Scheduling Candidate Meetings:**

1. **From Candidate Profile:**
   - Click "Schedule Meeting"
   - Choose meeting type (Interview, Consultation, etc.)
   - Select date and time
   - Add meeting details

2. **Calendar Integration:**
   - Syncs with Outlook/Google Calendar
   - Automatic meeting invitations sent
   - Reminder notifications set
   - Video meeting links generated

3. **Meeting Types:**
   - Initial consultation
   - Job interview
   - Offer discussion
   - Check-in/follow-up

4. **Attendees:**
   - Add candidate (automatically included)
   - Include hiring manager
   - Add team members as needed
   - Set optional vs required attendees

**Meeting Best Practices:**
- Send agenda in advance
- Include job description
- Prepare interview questions
- Block adequate time (30-60 minutes)

📅 **All meetings automatically appear in candidate timeline for tracking.**`
  },

  claims: {
    'How to submit an expense claim?': `**Submitting Expense Claims:**

1. **Navigate:** Dashboard → Claims → "Submit New Claim"
2. **Claim Details:**
   - Claim Category (Travel, Meals, etc.)
   - Date of Expense
   - Amount Spent
   - Business Purpose

3. **Upload Receipts:**
   - Drag & drop receipt images/PDFs
   - Multiple receipts per claim supported
   - Auto-OCR reads receipt details
   - Verify extracted information

4. **Additional Information:**
   - Client/Job attribution (if applicable)
   - Mileage details for travel
   - Attendees for meals
   - Supporting documentation

5. **Submit for Approval:**
   - Review all details
   - Submit to manager
   - Track approval status
   - Receive payment notifications

💡 **Tip:** Submit claims weekly to ensure timely reimbursement and better tracking.**`
  }
};

// Get fast FAQ answer using hybrid knowledge content
async function getFastFAQAnswer(pageKey, faqQuestion) {
  try {
    console.log('🔍 Getting pre-built FAQ answer for:', pageKey, '->', faqQuestion);
    
    // Use pre-built answers from FAST_FAQ_ANSWERS
    const pageAnswers = FAST_FAQ_ANSWERS[pageKey];
    if (pageAnswers && pageAnswers[faqQuestion]) {
      console.log('✅ Found pre-built answer for FAQ question');
      return pageAnswers[faqQuestion];
    }
    
    // If no exact match, use the fallback FAQ response from FAQ_RESPONSES
    console.log('📝 Using category-based pre-built response');
    const categoryResponse = getFallbackFAQAnswer(pageKey, faqQuestion);
    return categoryResponse;
    
  } catch (error) {
    console.error('❌ Error in getFastFAQAnswer:', error);
    console.log('🔄 Falling back to category response');
    return getFallbackFAQAnswer(pageKey, faqQuestion);
  }
}

// Extract search terms from FAQ question and page context
function extractSearchTerms(faqQuestion, pageKey) {
  const terms = [];
  
  // Add page-specific terms
  const pageTerms = {
    dashboard: ['dashboard', 'analytics', 'performance', 'metrics', 'kpi', 'reporting'],
    jobs: ['job', 'position', 'posting', 'vacancy', 'role', 'recruitment'],
    candidates: ['candidate', 'applicant', 'resume', 'cv', 'profile', 'talent'],
    clients: ['client', 'company', 'organization', 'employer', 'account'],
    calendar: ['calendar', 'schedule', 'meeting', 'appointment', 'interview'],
    claims: ['claim', 'expense', 'reimbursement', 'receipt', 'cost']
  };
  
  if (pageTerms[pageKey]) {
    terms.push(...pageTerms[pageKey]);
  }
  
  // Extract key terms from the question
  const questionWords = faqQuestion.toLowerCase()
    .replace(/[?.,!]/g, '')
    .split(' ')
    .filter(word => word.length > 3 && !['what', 'how', 'where', 'when', 'why', 'can', 'does'].includes(word));
  
  terms.push(...questionWords);
  
  return [...new Set(terms)]; // Remove duplicates
}

// Search knowledge base content for relevant sections
function searchKnowledgeBase(knowledgeContent, searchTerms, originalQuestion) {
  // Split by headers and Q&A sections
  const sections = knowledgeContent.split(/^(##+ .*|### Q:.*)/m).filter(s => s.trim().length > 0);
  let bestMatch = { content: '', confidence: 0 };
  
  console.log('🔍 Searching through', sections.length, 'sections');
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (section.trim().length < 50) continue; // Skip very short sections
    
    let relevanceScore = 0;
    const sectionLower = section.toLowerCase();
    const questionLower = originalQuestion.toLowerCase();
    
    // Higher weight for direct question similarity
    const questionWords = questionLower.split(' ').filter(w => w.length > 3);
    const matchingWords = questionWords.filter(word => sectionLower.includes(word));
    relevanceScore += (matchingWords.length / questionWords.length) * 3.0;
    
    // Check for exact phrases from the question
    const questionPhrases = extractKeyPhrases(originalQuestion);
    for (const phrase of questionPhrases) {
      if (sectionLower.includes(phrase.toLowerCase())) {
        relevanceScore += 2.0;
      }
    }
    
    // Check for search terms with weighted importance
    for (const term of searchTerms) {
      const termCount = (sectionLower.match(new RegExp(term.toLowerCase(), 'g')) || []).length;
      if (termCount > 0) {
        relevanceScore += Math.min(termCount * 0.4, 1.5); // Cap per term
      }
    }
    
    // Bonus for Q&A format sections
    if (sectionLower.includes('### q:') && sectionLower.includes('**a**:')) {
      relevanceScore += 1.0;
    }
    
    // Bonus for step-by-step instructions
    if (sectionLower.includes('step') && (sectionLower.includes('1.') || sectionLower.includes('•'))) {
      relevanceScore += 0.5;
    }
    
    // Bonus for additional support solutions (database entries)
    if (sectionLower.includes('additional support solutions')) {
      relevanceScore += 0.3;
    }
    
    // Calculate confidence with better normalization
    const confidence = Math.min(relevanceScore / Math.max(searchTerms.length, 3), 1.0);
    
    if (confidence > bestMatch.confidence) {
      // Include next section if this is a Q: header
      let fullContent = section;
      if (section.startsWith('### Q:') && i + 1 < sections.length) {
        fullContent += '\n' + sections[i + 1];
      }
      
      bestMatch = {
        content: fullContent.trim(),
        confidence: confidence,
        matchType: section.startsWith('### Q:') ? 'qa_section' : 'general_section'
      };
    }
  }
  
  console.log('🎯 Best match confidence:', bestMatch.confidence, 'Type:', bestMatch.matchType || 'none');
  return bestMatch;
}

// Extract key phrases from a question for better matching
function extractKeyPhrases(question) {
  const phrases = [];
  
  // Common action phrases
  const actionPatterns = [
    /how to ([\w\s]+)/gi,
    /where to ([\w\s]+)/gi,
    /what is ([\w\s]+)/gi,
    /when to ([\w\s]+)/gi
  ];
  
  for (const pattern of actionPatterns) {
    const matches = question.match(pattern);
    if (matches) {
      phrases.push(...matches);
    }
  }
  
  // Add the whole question as a phrase if it's not too long
  if (question.length < 100) {
    phrases.push(question);
  }
  
  return phrases;
}

// Format knowledge base content for FAQ response
function formatKnowledgeBaseAnswer(content, originalQuestion) {
  // Remove markdown headers and clean up formatting
  let formatted = content
    .replace(/^#+\s*/gm, '') // Remove markdown headers
    .replace(/\*\*(.*?)\*\*/g, '**$1**') // Keep bold formatting
    .trim();
  
  // If it's a Q&A section, extract the answer part
  if (formatted.includes('**A**:') || formatted.includes('**A:**')) {
    const answerMatch = formatted.match(/\*\*A\*\*:?\s*([\s\S]*)/i);
    if (answerMatch) {
      formatted = answerMatch[1].trim();
    }
  }
  
  // Add a personalized intro
  const intro = `Based on our PM-Next knowledge base:\n\n`;
  
  // Ensure the response isn't too long for Lark
  if (formatted.length > 2000) {
    formatted = formatted.substring(0, 1900) + '\n\n... [Answer continues - ask for more details if needed]';
  }
  
  return intro + formatted;
}

// Fallback to category-based static answers
function getFallbackFAQAnswer(pageKey, faqQuestion) {
  console.log('🔄 Using category-based static answers for:', pageKey, faqQuestion);
  
  // Map page keys to issue categories
  const pageToCategory = {
    'dashboard': 'general',
    'jobs': 'job_management', 
    'candidates': 'candidate_management',
    'clients': 'client_management',
    'calendar': 'general',
    'claims': 'general'
  };
  
  const category = pageToCategory[pageKey] || 'general';
  const categoryResponse = FAQ_RESPONSES[category];
  
  if (categoryResponse) {
    console.log('✅ Using category response for:', category);
    return categoryResponse;
  }
  
  // Final fallback
  const pageAnswers = FAST_FAQ_ANSWERS[pageKey];
  if (!pageAnswers) {
    return `I'd be happy to help with "${faqQuestion}". Please ask me this question directly and I'll provide detailed information from our knowledge base.`;
  }
  
  // Exact match first
  if (pageAnswers[faqQuestion]) {
    return pageAnswers[faqQuestion];
  }
  
  // Partial match if exact not found
  const partialMatch = Object.keys(pageAnswers).find(key => 
    key.toLowerCase().includes(faqQuestion.toLowerCase()) || 
    faqQuestion.toLowerCase().includes(key.toLowerCase())
  );
  
  if (partialMatch) {
    return pageAnswers[partialMatch];
  }
  
  // Generic helpful response
  return `I can help you with "${faqQuestion}". This relates to ${pageKey} functionality in PM-Next. Please ask me this question directly for detailed step-by-step guidance.`;
}

// Send simplified page selection for serverless environments
async function sendSimplePageSelectionCard(chatId) {
  try {
    console.log('🌐 Sending simplified page selection for serverless environment');
    
    // Very minimal card optimized for serverless
    const simpleCard = {
      "elements": [
        {
          "tag": "div",
          "text": {
            "content": "🤖 PM-Next Support - Select Page:",
            "tag": "plain_text"
          }
        },
        {
          "tag": "action",
          "actions": [
            {
              "tag": "button",
              "text": {
                "content": "📊 Dashboard",
                "tag": "plain_text"
              },
              "type": "primary",
              "value": "dashboard"
            },
            {
              "tag": "button",
              "text": {
                "content": "💼 Jobs",
                "tag": "plain_text"
              },
              "type": "primary", 
              "value": "jobs"
            }
          ]
        },
        {
          "tag": "action",
          "actions": [
            {
              "tag": "button",
              "text": {
                "content": "👥 Candidates",
                "tag": "plain_text"
              },
              "type": "primary",
              "value": "candidates"
            },
            {
              "tag": "button",
              "text": {
                "content": "🏢 Clients",
                "tag": "plain_text"
              },
              "type": "primary",
              "value": "clients"
            }
          ]
        }
      ]
    };

    const result = await sendInteractiveCard(chatId, simpleCard);
    
    // Check if card sending was successful
    if (result && result.success === false) {
      console.log('⚠️ Simple card sending failed, returning error result');
      return result;
    }
    
    // Set user state only if card was sent successfully
    userInteractionState.set(chatId, {
      step: 'awaiting_page_selection',
      selectedPage: null,
      awaiting: true,
      timestamp: Date.now()
    });
    
    console.log('✅ Simple page selection card sent and state set');
    return { success: true, cardType: 'simple_page_selection' };
    
  } catch (error) {
    console.error('❌ Error sending simple page selection:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to send simple page selection',
      cardType: 'simple_page_selection'
    };
  }
}



// Send interactive page selection message
async function sendPageSelectionMessage(chatId) {
  try {
    console.log('📋 Sending page selection message to chat:', chatId);
    
    // Create interactive card with page buttons
    const cardContent = {
      "config": {
        "wide_screen_mode": true
      },
      "header": {
        "template": "blue",
        "title": {
          "content": "🤖 Welcome to PM-Next Support Bot",
          "tag": "plain_text"
        }
      },
      "elements": [
        {
          "tag": "div",
          "text": {
            "content": "Please select the page you need help with:",
            "tag": "plain_text"
          }
        },
        {
          "tag": "hr"
        },
        {
          "tag": "action",
          "actions": Object.keys(MAIN_PAGES).slice(0, 3).map(pageKey => ({
            "tag": "button",
            "text": {
              "content": MAIN_PAGES[pageKey].name,
              "tag": "plain_text"
            },
            "type": "primary",
            "value": pageKey
          }))
        },
        {
          "tag": "action",
          "actions": Object.keys(MAIN_PAGES).slice(3, 6).map(pageKey => ({
            "tag": "button",
            "text": {
              "content": MAIN_PAGES[pageKey].name,
              "tag": "plain_text"
            },
            "type": "primary",
            "value": pageKey
          }))
        },
        {
          "tag": "hr"
        },
        {
          "tag": "div",
          "text": {
            "content": "Or you can ask me anything directly about PM-Next!",
            "tag": "plain_text"
          }
        }
      ]
    };

    const result = await sendInteractiveCard(chatId, cardContent);
    
    // Check if card sending was successful
    if (result && result.success === false) {
      console.error('❌ Page selection card sending failed:', result.error);
      throw new Error(result.error || 'Failed to send page selection card');
    }
    
    // Set user state to awaiting page selection
    userInteractionState.set(chatId, {
      step: 'awaiting_page_selection',
      selectedPage: null,
      awaiting: true,
      timestamp: Date.now()
    });
    
    console.log('✅ Page selection message sent successfully');
    return { success: true, cardType: 'interactive_card' };
    
  } catch (error) {
    console.error('❌ Error sending page selection message:', error.message || error);
    throw error;
  }
}



// Send FAQ options for selected page
async function sendPageFAQs(chatId, pageKey) {
  try {
    console.log('📋 Sending FAQ options for page:', pageKey);
    
    const page = MAIN_PAGES[pageKey];
    if (!page) {
      throw new Error(`Unknown page: ${pageKey}`);
    }
    
    // Create interactive FAQ card
    const cardContent = {
      "config": {
        "wide_screen_mode": true
      },
      "header": {
        "template": "green",
        "title": {
          "content": `${page.name} - FAQs`,
          "tag": "plain_text"
        }
      },
      "elements": [
        {
          "tag": "div",
          "text": {
            "content": `Here are common questions about ${page.description}:`,
            "tag": "plain_text"
          }
        },
        {
          "tag": "hr"
        },
        ...page.faqs.map((faq, index) => ({
          "tag": "action",
          "actions": [{
            "tag": "button",
            "text": {
              "content": faq,
              "tag": "plain_text"
            },
            "type": "default",
            "value": `faq_${pageKey}_${index}`
          }]
        })),
        {
          "tag": "hr"
        },
        {
          "tag": "action",
          "actions": [
            {
              "tag": "button",
              "text": {
                "content": "🔙 Back to Page Selection",
                "tag": "plain_text"
              },
              "type": "default",
              "value": "back_to_pages"
            },
            {
              "tag": "button",
              "text": {
                "content": "💬 Ask Custom Question",
                "tag": "plain_text"
              },
              "type": "primary",
              "value": "custom_question"
            }
          ]
        }
      ]
    };

    console.log('📦 FAQ card payload size:', JSON.stringify(cardContent).length, 'bytes');
    
    const result = await sendInteractiveCard(chatId, cardContent);
    
    // Check if card sending was successful
    if (result && result.success === false) {
      console.error('❌ FAQ card sending failed:', result.error);
      throw new Error(result.error || 'FAQ card sending failed');
    }
    
    // Update user state
    userInteractionState.set(chatId, {
      step: 'awaiting_faq_selection',
      selectedPage: pageKey,
      awaiting: true,
      timestamp: Date.now()
    });
    
    console.log('✅ FAQ options sent successfully');
    const isServerless = !!process.env.VERCEL;
    return { success: true, cardType: isServerless ? 'simplified_faq' : 'full_faq' };
    
  } catch (error) {
    console.error('❌ Error sending FAQ options:', error.message || error);
    console.log('🔄 Using immediate text fallback for FAQ options...');
    
    // Immediate fallback to text message
    try {
      const page = MAIN_PAGES[pageKey];
      let message = `**${page.name} - Common Questions:**\n\n`;
      
      page.faqs.forEach((faq, index) => {
        message += `**${index + 1}.** ${faq}\n\n`;
      });
      
      const isServerless = !!process.env.VERCEL;
      if (isServerless) {
        message += `💬 **Type the number (1-${page.faqs.length}) or ask your question directly!**`;
      } else {
        message += '💬 **Please type your question or ask me anything about this page!**';
      }
      
      await sendMessage(chatId, message);
      
      // Set user state for text-based FAQ interaction
      userInteractionState.set(chatId, {
        step: 'text_faq_mode',
        selectedPage: pageKey,
        awaiting: true,
        timestamp: Date.now()
      });
      
      console.log('✅ FAQ text fallback sent successfully');
      return { success: true, cardType: 'text_fallback' };
    } catch (textError) {
      console.error('❌ Even FAQ text fallback failed:', textError.message);
      return { 
        success: false, 
        error: error.message || 'Failed to send FAQ options',
        cardType: 'faq_options'
      };
    }
  }
}

// Send interactive card message
async function sendInteractiveCard(chatId, cardContent) {
  try {
    console.log('📨 Sending interactive card to chat:', chatId);
    
    // Detect the ID type based on the chat ID format
    let receiveIdType = 'chat_id';
    if (chatId.startsWith('ou_')) {
      receiveIdType = 'open_id';
    } else if (chatId.startsWith('oc_')) {
      receiveIdType = 'chat_id';
    } else if (chatId.startsWith('og_')) {
      receiveIdType = 'chat_id';
    }

    console.log('📦 Interactive card payload size:', JSON.stringify(cardContent).length, 'bytes');
    console.log('🔍 Using receive_id_type:', receiveIdType);
    console.log('🔍 Chat ID format detected:', chatId.substring(0, 3) + '...');

    try {
      console.log('🔄 Using Lark SDK for interactive card...');
      
      const cardParams = {
        params: {
          receive_id_type: receiveIdType
        },
        data: {
          receive_id: chatId,
          msg_type: 'interactive',
          content: JSON.stringify(cardContent),
          uuid: `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      };
      
      console.log('📊 SDK Card Parameters:', JSON.stringify(cardParams, null, 2));
      console.log('📦 Card Content Preview:', JSON.stringify(cardContent, null, 2).substring(0, 500) + '...');
      
      console.log('🚀 About to call SDK...');
      
      // Add timeout and retry logic for network issues
      let messageData;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        let timeoutId;
        try {
          console.log(`🔄 SDK call attempt ${retryCount + 1}/${maxRetries + 1}`);
          
          // Create a new timeout promise for each retry
          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error('SDK call timeout after 25 seconds'));
            }, 25000);
          });
          
          try {
            messageData = await Promise.race([
              larkClient.im.message.create(cardParams),
              timeoutPromise
            ]);
            
            // Clear timeout on success
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            
            break; // Success, exit retry loop
          } catch (raceError) {
            // Clear timeout on any error
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            throw raceError;
          }
        } catch (error) {
          retryCount++;
          console.log(`⚠️ SDK call attempt ${retryCount} failed:`, error.message);
          
          // Ensure timeout is cleared
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          
          if (retryCount > maxRetries) {
            throw error; // All retries exhausted
          }
          
          // Wait before retry (exponential backoff)
          const waitTime = Math.pow(2, retryCount) * 1000;
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
      
      console.log('🎯 SDK call completed');
      
      console.log('✅ SDK interactive card sending successful');
      console.log('📊 Full SDK response:', JSON.stringify(messageData, null, 2));
      console.log('📊 SDK response code:', messageData?.code);
      
      console.log('🔍 Checking SDK response validity...');
      console.log('🔍 messageData exists:', !!messageData);
      console.log('🔍 messageData.code:', messageData?.code);
      console.log('🔍 messageData type:', typeof messageData);
      
      if (!messageData || messageData.code !== 0) {
        const errorInfo = {
          code: messageData?.code || 'unknown',
          msg: messageData?.msg || 'No response data',
          data: messageData?.data,
          error: messageData?.error,
          fullResponse: messageData
        };
        
        console.error('🚨 Lark SDK Error Details for card:', errorInfo);
        
        // Specific error handling for common issues
        if (messageData?.code === 230002) {
          console.error('❌ Invalid card format or unsupported message type');
        } else if (messageData?.code === 99991401) {
          console.error('❌ Invalid receive_id or chat not found');
        } else if (messageData?.code === 99991400) {
          console.error('❌ Missing required parameters');
        }
        
        throw new Error(`Failed to send interactive card via SDK: ${errorInfo.msg} (Code: ${errorInfo.code})`);
      }

      console.log('✅ Interactive card sent successfully via SDK');
      console.log('📬 Message ID:', messageData.data?.message_id);
      console.log('📅 Timestamp:', messageData.data?.create_time);
      
      return messageData;
      
    } catch (sdkError) {
      console.error('❌ SDK interactive card sending failed:', sdkError.message);
      throw sdkError;
    }
    
  } catch (error) {
    console.error('❌ Error sending interactive card to Lark:', error);
    console.error('📋 Card error details:', error.message);
    console.error('📋 Error stack (first 500 chars):', error.stack?.substring(0, 500));
    
    // Return structured error response
    return { 
      success: false, 
      error: error.message,
      code: error.code || 'CARD_SEND_ERROR'
    };
  }
}

// Handle button clicks and interactions
async function handleCardInteraction(event) {
  const startTime = Date.now();
  console.log('🔥 CARD INTERACTION STARTED at', new Date().toISOString());
  
  try {
    console.log('🎯 ========== CARD INTERACTION DEBUG ==========');
    console.log('🎯 Handling card interaction:', JSON.stringify(event, null, 2));
    console.log('🎯 Event keys:', Object.keys(event));
    console.log('🎯 Event type:', typeof event);
    
    // Handle different event formats
    let chatId, actionValue, userId;
    
    if (event.open_chat_id) {
      // Standard format
      console.log('🔍 Using standard format (event.open_chat_id)');
      chatId = event.open_chat_id;
      userId = event.open_id || event.user_id;
      actionValue = event.action?.value;
    } else if (event.context) {
      // Lark webhook format with context and operator
      console.log('🔍 Using context format (event.context)');
      chatId = event.context.open_chat_id;
      userId = event.operator?.open_id || event.operator?.user_id;
      actionValue = event.action?.value;
    } else {
      console.log('⚠️ Unknown card interaction format');
      console.log('🔍 Available event properties:', Object.keys(event));
      console.log('🔍 Checking for alternative formats...');
      
      // Try to find chat_id and action in alternative formats
      if (event.chat_id || event.message?.chat_id) {
        console.log('🔍 Found alternative chat_id format');
        chatId = event.chat_id || event.message?.chat_id;
        actionValue = event.action?.value || event.message?.action?.value;
        userId = event.user_id || event.sender?.user_id;
      } else {
        console.log('❌ Could not extract chat_id from event');
        return;
      }
    }
    
    // Clean up action value (remove extra quotes if present)
    if (actionValue && typeof actionValue === 'string') {
      actionValue = actionValue.replace(/^"(.*)"$/, '$1'); // Remove surrounding quotes
      actionValue = actionValue.replace(/\\"/g, '"'); // Remove escaped quotes
    }
    
    console.log('🧹 Cleaned action value:', actionValue);
    
    if (!actionValue) {
      console.log('⚠️ No action value in interaction');
      console.log('📋 Available keys:', Object.keys(event));
      console.log('📋 Action object:', event.action);
      return;
    }
    
    console.log('🔍 Processing action:', actionValue);
    console.log('💬 Chat ID:', chatId);
    console.log('👤 User ID:', userId);
    console.log('📊 MAIN_PAGES keys:', Object.keys(MAIN_PAGES));
    console.log('🎯 Action matches page?', Object.keys(MAIN_PAGES).includes(actionValue));
    
    // Handle different button actions
    if (Object.keys(MAIN_PAGES).includes(actionValue)) {
      // Page selection
      console.log('📄 Page selected:', actionValue);
      console.log('📋 Sending FAQ options for page:', actionValue);
      
      try {
        const result = await sendPageFAQs(chatId, actionValue);
        console.log('📊 FAQ sending result:', result);
        
        if (result && result.success === false) {
          console.log('⚠️ FAQ page sending failed, sending error message');
          await sendMessage(chatId, `Sorry, I had trouble showing the FAQ options for ${actionValue}. Please ask me directly about ${actionValue} or try again later.`);
        } else {
          console.log('✅ FAQ card should have been sent successfully');
        }
      } catch (error) {
        console.error('❌ Error in page FAQ handling:', error.message);
        console.error('❌ Error stack:', error.stack);
        await sendMessage(chatId, `Sorry, I encountered an error while trying to show ${actionValue} options. Please ask me directly about ${actionValue}.`);
      }
    } else if (actionValue.startsWith('faq_')) {
      // FAQ selection
      console.log('🔍 ========== FAQ BUTTON DEBUG ==========');
      console.log('🔍 Raw action value:', actionValue);
      console.log('🔍 Action value type:', typeof actionValue);
      console.log('🔍 Action value length:', actionValue.length);
      
      const parts = actionValue.split('_');
      console.log('🔍 Split parts:', parts);
      console.log('🔍 Number of parts:', parts.length);
      
      const [, pageKey, faqIndex] = parts;
      console.log('🔍 Page key:', pageKey);
      console.log('🔍 FAQ index:', faqIndex);
      console.log('🔍 FAQ index type:', typeof faqIndex);
      
      const page = MAIN_PAGES[pageKey];
      console.log('🔍 Page found:', !!page);
      
      if (!page) {
        console.error('❌ Page not found for key:', pageKey);
        await sendMessage(chatId, "Sorry, I couldn't find that page. Please try again.");
        return;
      }
      
      const faq = page.faqs[parseInt(faqIndex)];
      console.log('🔍 FAQ found:', !!faq);
      console.log('🔍 FAQ text:', faq);
      
      if (!faq) {
        console.error('❌ FAQ not found for index:', faqIndex);
        await sendMessage(chatId, "Sorry, I couldn't find that FAQ. Please try again.");
        return;
      }
      
      console.log('❓ FAQ selected:', faq);
      console.log('🚀 Using pre-built FAQ answers...');
      
      try {
        // Use pre-built answers from FAST_FAQ_ANSWERS
        let faqAnswer = await getFastFAQAnswer(pageKey, faq);
        
        if (!faqAnswer) {
          console.log('📝 No pre-built answer found, using category response...');
          faqAnswer = `I'd be happy to help with "${faq}". This is a common question about ${page.description}. 

Here's some quick guidance for this topic. For more detailed step-by-step instructions, please ask me this question directly: "${faq}"`;
        }
        
        console.log('📤 Sending pre-built FAQ response...');
        console.log('📊 Response length:', faqAnswer.length, 'characters');
        console.log('📊 Chat ID:', chatId);
        console.log('📊 FAQ text preview:', faq.substring(0, 100) + '...');
        
        const finalMessage = `**${faq}**\n\n${faqAnswer}`;
        console.log('📊 Final message length:', finalMessage.length, 'characters');
        
        const messageResult = await sendMessage(chatId, finalMessage);
        console.log('📊 Send message result:', messageResult);
        console.log('✅ Pre-built FAQ response sent successfully');
        
        // Reset user state to allow normal bot interaction
        userInteractionState.delete(chatId);
        
        // Send follow-up card with navigation options immediately
        try {
          console.log('📋 Sending follow-up navigation card...');
          const followUpCard = {
            "elements": [
              {
                "tag": "div",
                "text": {
                  "content": "Need more help?",
                  "tag": "plain_text"
                }
              },
              {
                "tag": "action",
                "actions": [
                  {
                    "tag": "button",
                    "text": {
                      "content": "🔙 Back to FAQs",
                      "tag": "plain_text"
                    },
                    "type": "default",
                    "value": pageKey
                  },
                  {
                    "tag": "button",
                    "text": {
                      "content": "🏠 Main Menu",
                      "tag": "plain_text"
                    },
                    "type": "default",
                    "value": "back_to_pages"
                  },
                  {
                    "tag": "button",
                    "text": {
                      "content": "💬 Ask Question",
                      "tag": "plain_text"
                    },
                    "type": "primary",
                    "value": "custom_question"
                  }
                ]
              }
            ]
          };
          
          const followUpResult = await sendInteractiveCard(chatId, followUpCard);
          if (followUpResult && followUpResult.success !== false) {
            console.log('✅ Follow-up navigation card sent successfully');
          } else {
            console.log('⚠️ Follow-up card failed, continuing without it');
          }
        } catch (followUpError) {
          console.log('⚠️ Follow-up card failed (non-critical):', followUpError.message);
        }
        
      } catch (error) {
        console.error('❌ ========== FAQ RESPONSE ERROR ==========');
        console.error('❌ Error in fast FAQ response:', error);
        console.error('❌ Error stack:', error.stack);
        
        // Even simpler fallback
        try {
          await sendMessage(chatId, `**${faq}**\n\nI can help with this! Please ask me directly: "${faq}" and I'll provide detailed assistance.`);
          userInteractionState.delete(chatId);
        } catch (fallbackError) {
          console.error('❌ Even fallback failed:', fallbackError.message);
        }
      }
      console.log('🔍 ======================================');
    } else if (actionValue === 'back_to_pages') {
      // Back to page selection
      console.log('🔙 Back to page selection');
      try {
        const result = await sendPageSelectionMessage(chatId);
        if (result && result.success === false) {
          console.log('⚠️ Back to pages failed, sending simple text message');
          await sendMessage(chatId, "Please let me know which page you need help with: Dashboard, Jobs, Candidates, Clients, Calendar, or Claims.");
        }
      } catch (error) {
        console.error('❌ Error going back to pages:', error.message);
        // Always try to send fallback message
        try {
          await sendMessage(chatId, "Please let me know which page you need help with: Dashboard, Jobs, Candidates, Clients, Calendar, or Claims.");
        } catch (fallbackError) {
          console.error('❌ Even fallback message failed:', fallbackError.message);
        }
      }
    } else if (actionValue === 'custom_question') {
      // Enable custom question mode
      console.log('💬 Custom question mode enabled');
      await sendMessage(chatId, "Please go ahead and ask me anything about PM-Next! I'm here to help. 🤖");
      
      // Reset user state to allow normal bot interaction
      userInteractionState.delete(chatId);
    }
    
  } catch (error) {
    console.error('❌ ========== CARD INTERACTION ERROR ==========');
    console.error('❌ Error handling card interaction:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ ============================================');
    
    // Try to recover by clearing state and sending fallback message
    try {
      if (chatId) {
        console.log('🚨 Attempting error recovery for chat:', chatId);
        userInteractionState.delete(chatId);
        
        // Send recovery message if possible
        await sendMessage(chatId, "I encountered an issue. Please send me a message and I'll help you again! 🤖");
        console.log('✅ Error recovery message sent');
      }
    } catch (recoveryError) {
      console.error('❌ Error recovery failed:', recoveryError.message);
    }
    
    // Don't re-throw to prevent further issues
    console.log('🔄 Continuing despite card interaction error to prevent system lockup');
  } finally {
    const duration = Date.now() - startTime;
    console.log('🏁 CARD INTERACTION COMPLETED in', duration, 'ms at', new Date().toISOString());
  }
}



// Check if user is new to the conversation
function isNewConversation(chatId) {
  // Check if user has any previous conversation context
  const hasContext = conversationContext.has(chatId) && conversationContext.get(chatId).length > 0;
  const hasInteractionState = userInteractionState.has(chatId);
  
  return !hasContext && !hasInteractionState;
}

// Periodic cleanup to prevent memory leaks and stuck states
function cleanupStuckStates() {
  const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
  const STATE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  
  setInterval(() => {
    try {
      console.log('🧹 Running periodic cleanup...');
      const now = Date.now();
      let cleanedCount = 0;
      
      // Clean up old user interaction states
      for (const [chatId, state] of userInteractionState.entries()) {
        if (state.timestamp && (now - state.timestamp) > STATE_TIMEOUT) {
          userInteractionState.delete(chatId);
          cleanedCount++;
        }
      }
      
      // Clean up old conversation contexts
      for (const [chatId, context] of conversationContext.entries()) {
        if (context.length === 0 || !context.some(msg => msg.timestamp && (now - msg.timestamp) < STATE_TIMEOUT)) {
          conversationContext.delete(chatId);
          cleanedCount++;
        }
      }
      
      // Clean up processed events older than 1 hour
      const EVENT_TIMEOUT = 60 * 60 * 1000; // 1 hour
      for (const eventId of processedEvents) {
        // Event IDs contain timestamp, extract it
        const eventTimestamp = parseInt(eventId.split('_')[1] || '0');
        if (eventTimestamp && (now - eventTimestamp) > EVENT_TIMEOUT) {
          processedEvents.delete(eventId);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} stuck states and old data`);
      }
    } catch (error) {
      console.error('❌ Error during cleanup:', error.message);
    }
  }, CLEANUP_INTERVAL);
}

// Start cleanup on server initialization
cleanupStuckStates();

// Debug endpoint to test card interactions
app.post('/test-card-click', async (req, res) => {
  try {
    console.log('🧪 ========== TEST CARD CLICK ==========');
    console.log('🧪 Full request body:', JSON.stringify(req.body, null, 2));
    console.log('🧪 Request headers:', req.headers);
    console.log('🧪 Raw body type:', typeof req.body);
    console.log('🧪 Available keys:', Object.keys(req.body));
    
    res.json({ 
      success: true, 
      message: 'Test card click received',
      body: req.body,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in test endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test card button click simulation
app.post('/test-card-interaction', async (req, res) => {
  try {
    const { chatId, buttonValue = 'dashboard' } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }
    
    console.log('🧪 Testing card interaction simulation');
    console.log('🧪 Chat ID:', chatId);
    console.log('🧪 Button Value:', buttonValue);
    
    // Simulate the event that Lark would send when a button is clicked
    const mockCardEvent = {
      open_chat_id: chatId,
      open_id: 'test_user_' + Date.now(),
      action: {
        value: buttonValue,
        tag: 'button'
      },
      token: 'test_token',
      type: 'card.action'
    };
    
    console.log('🧪 Simulated event:', JSON.stringify(mockCardEvent, null, 2));
    
    // Process the card interaction
    const startTime = Date.now();
    await handleCardInteraction(mockCardEvent);
    const duration = Date.now() - startTime;
    
    console.log('🧪 Card interaction processing took:', duration + 'ms');
    
    res.json({
      success: true,
      message: 'Card interaction simulation completed',
      chatId: chatId,
      buttonValue: buttonValue,
      processingTimeMs: duration,
      simulatedEvent: mockCardEvent,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Card interaction simulation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});