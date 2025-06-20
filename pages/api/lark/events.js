// Next.js API Route for Lark Webhooks - Complete Bot Implementation
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { Client } from '@larksuiteoapi/node-sdk';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Validate environment variables
function validateEnvironment() {
  const required = ['LARK_APP_ID', 'LARK_APP_SECRET', 'OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing);
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return true;
}

// Initialize clients with validation
validateEnvironment();

const larkClient = new Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  loggerLevel: 'warn'
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// In-memory storage (consider using external storage for production)
const processedEvents = new Set();
const conversationContext = new Map();
const responseCache = new Map();
const ticketCollectionState = new Map();

// Constants and configurations
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const KNOWLEDGE_BASE_TABLE = 'knowledge_base';
const SUPPORT_TICKETS_TABLE = 'support_tickets';

// FAQ responses
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

const PM_NEXT_KNOWLEDGE = `You are a helpful assistant for the PM-Next Recruitment Management System. 

Key features of PM-Next:
1. **Dashboard**: Overview of activities, statistics, and key metrics
2. **Jobs**: Create, manage, and track job postings and requirements
3. **Candidates**: Manage candidate profiles, resumes, and application stages
4. **Clients**: Handle client companies and contact information
5. **Calendar**: Schedule interviews and manage appointments
6. **Claims**: Track billing, invoices, and commission payments

Common workflows:
- Adding candidates: Candidates → Add New → Fill details → Save
- Creating jobs: Jobs → Create New → Fill requirements → Publish
- Scheduling interviews: Calendar → Schedule → Select participants → Confirm
- Client management: Clients → Add/Edit → Update information → Save

Always provide specific, actionable steps when helping users.`;

export default async function handler(req, res) {
  // Handle GET requests (for health checks and verification)
  if (req.method === 'GET') {
    try {
      // Test Lark client initialization
      const clientStatus = larkClient ? 'initialized' : 'not initialized';
      
      return res.status(200).json({ 
        status: 'ok',
        message: 'Lark webhook endpoint is active',
        timestamp: new Date().toISOString(),
        endpoint: '/api/lark/events',
        methods: ['GET', 'POST'],
        larkClient: clientStatus,
        environmentCheck: {
          hasLarkAppId: !!process.env.LARK_APP_ID,
          hasLarkAppSecret: !!process.env.LARK_APP_SECRET,
          hasOpenAIKey: !!process.env.OPENAI_API_KEY,
          hasSupabaseUrl: !!process.env.SUPABASE_URL,
          hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY
        }
      });
    } catch (error) {
      console.error('❌ Health check error:', error);
      return res.status(500).json({ 
        status: 'error',
        message: 'Health check failed',
        error: error.message 
      });
    }
  }

  // Handle POST requests (webhook events)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📨 Webhook received:', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      timestamp: new Date().toISOString()
    });

    const body = req.body;
    const header = body.header;
    const event = body.event;

    // Immediate response to prevent Lark timeout
    if (!res.headersSent) {
      res.status(200).json({ 
        success: true,
        timestamp: new Date().toISOString(),
        processed: true
      });
    }

    // Check if we have required fields
    if (!header || !event) {
      console.log('❌ Missing header or event data:', { hasHeader: !!header, hasEvent: !!event });
      return;
    }

    console.log('📝 Event received:', {
      eventType: header?.event_type,
      eventId: header?.event_id,
      hasMessage: !!event.message
    });

    // Handle message events
    if (header?.event_type === 'im.message.receive_v1' && event) {
      const eventId = header.event_id;
      
      // Check for duplicates
      if (processedEvents.has(eventId)) {
        console.log('🔄 Duplicate event skipped:', eventId);
        return;
      }
      
      processedEvents.add(eventId);
      
      // Process in background with proper error handling
      setImmediate(async () => {
        try {
          console.log('🚀 Starting message processing for event:', eventId);
          await processMessage(event);
          console.log('✅ Message processing completed for event:', eventId);
        } catch (error) {
          console.error('❌ Background message processing failed:', {
            eventId: eventId,
            message: error.message,
            name: error.name,
            stack: error.stack?.split('\n').slice(0, 5)
          });
        }
      });
    } else {
      console.log('⏭️ Non-message event or missing data:', {
        eventType: header?.event_type,
        hasEvent: !!event,
        hasMessage: !!event?.message
      });
    }

      } catch (error) {
      console.error('❌ Webhook error:', error);
      console.error('❌ Error stack:', error.stack);
      
      // Still return success to prevent Lark retries
      if (!res.headersSent) {
        res.status(200).json({ 
          success: false, 
          error: 'Processing error',
          timestamp: new Date().toISOString()
        });
      }
    }
}

// Process message in background
async function processMessage(event) {
  try {
    const chatId = event.message?.chat_id;
    const messageContent = event.message?.content;
    const senderId = event.sender?.sender_id?.user_id;
    
    console.log('🔍 Processing message:', {
      chatId: chatId,
      hasContent: !!messageContent,
      senderId: senderId,
      messageType: event.message?.message_type
    });

    if (!chatId || !messageContent) {
      console.log('❌ Missing required data:', { 
        hasChatId: !!chatId, 
        hasMessageContent: !!messageContent 
      });
      return;
    }

    // Extract message text
    let contentObj;
    try {
      contentObj = JSON.parse(messageContent);
    } catch (parseError) {
      console.error('❌ Failed to parse message content:', parseError);
      console.log('📄 Raw content:', messageContent);
      return;
    }
    
    const userMessage = extractTextFromMessage(contentObj);
    console.log('💬 User message extracted:', userMessage);
    
    if (!userMessage.trim()) {
      console.log('⚠️ Empty message after extraction');
      return;
    }

    // Check if user is in ticket creation flow
    if (ticketCollectionState.has(chatId)) {
      console.log('🎫 Processing ticket flow');
      const ticketResponse = await handleTicketCreationFlow(chatId, userMessage, ticketCollectionState.get(chatId), senderId);
      if (ticketResponse) {
        await sendMessageToLark(chatId, ticketResponse);
        return;
      }
    }

    // Generate AI response
    console.log('🤖 Generating AI response for:', userMessage);
    const aiResponseData = await generateAIResponse(userMessage, chatId, senderId);
    
    if (aiResponseData) {
      const aiResponse = typeof aiResponseData === 'string' ? aiResponseData : aiResponseData.response;
      
      if (aiResponse) {
        console.log('📤 Sending response:', aiResponse.substring(0, 100) + '...');
        await sendMessageToLark(chatId, aiResponse);
        console.log('✅ Response sent successfully');
      } else {
        console.log('⚠️ No response content to send');
      }
    } else {
      console.log('⚠️ No AI response generated');
    }

  } catch (error) {
    console.error('❌ Message processing error:', error);
    console.error('❌ Full error stack:', error.stack);
    
    try {
      await sendMessageToLark(event.message.chat_id, 'I encountered an issue processing your message. Please try again or contact support.');
    } catch (fallbackError) {
      console.error('❌ Fallback message failed:', fallbackError);
    }
  }
}

// Generate AI response with full logic
async function generateAIResponse(userMessage, chatId, senderId = null) {
  try {
    // Check for greeting/restart patterns
    const greetingPatterns = [
      /^(hi|hello|hey|start|restart|help|menu)$/i,
      /^(what can you do|what do you do|help me)$/i
    ];
    
    if (greetingPatterns.some(pattern => pattern.test(userMessage.trim()))) {
      return `Welcome to PM-Next Support Bot!

I can help you with:
**Dashboard** - Overview and analytics
**Jobs** - Job posting and management
**Candidates** - Candidate profiles and management
**Clients** - Client and company management
**Calendar** - Interview scheduling and calendar management
**Claims** - Billing and financial tracking

Please tell me what you need help with, and I'll provide detailed guidance!`;
    }

    // Check if should escalate to ticket
    if (shouldEscalateToTicket([], userMessage)) {
      const category = categorizeIssue(userMessage);
      return await startTicketCreation(chatId, userMessage, category, senderId);
    }

    // Check cache first
    const cachedResponse = getCachedResponse(userMessage);
    if (cachedResponse) {
      return {
        response: cachedResponse,
        responseType: 'cached',
        cacheHit: true
      };
    }

    // Generate AI response
    const models = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    const selectedModel = process.env.OPENAI_MODEL || models[0];
    
    const messages = [
      {
        role: 'system',
        content: `You are a helpful assistant for the PM-Next Recruitment Management System. 
        Your role is to help users navigate and understand how to use the application effectively.
        
        Use this knowledge base about PM-Next:
        ${PM_NEXT_KNOWLEDGE}
        
        Always be helpful, specific, and provide actionable steps when possible.`
      },
      {
        role: 'user',
        content: userMessage
      }
    ];

    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: messages,
      max_tokens: 800,
      temperature: 0.7,
      stream: false
    });

    const response = completion.choices[0].message.content;
    
    // Cache the response
    setCachedResponse(userMessage, response);
    
    return {
      response,
      responseType: 'ai_generated'
    };

  } catch (error) {
    console.error('❌ AI generation error:', error);
    
    if (error.message.includes('timeout')) {
      return 'I apologize for the delay. The system is taking longer than usual to respond. Please try asking your question again.';
    } else if (error.message.includes('rate limit')) {
      return 'I\'m currently experiencing high demand. Please wait a moment and try again.';
    } else {
      return 'I encountered a technical issue while processing your request. Please try rephrasing your question or contact our support team for immediate assistance.';
    }
  }
}

// Helper functions
function extractTextFromMessage(contentObj) {
  if (typeof contentObj === 'string') {
    return contentObj;
  }
  
  if (contentObj.text) {
    return contentObj.text;
  }
  
  if (Array.isArray(contentObj)) {
    return contentObj.map(item => item.text || '').join(' ');
  }
  
  return '';
}

function getCachedResponse(message) {
  const patterns = [
    /how.*add.*candidate/i,
    /how.*create.*job/i,
    /login.*problem/i
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(message)) {
      const cached = responseCache.get(pattern.toString());
      if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
        return cached.response;
      }
    }
  }
  return null;
}

function setCachedResponse(message, response) {
  const patterns = [
    /how.*add.*candidate/i,
    /how.*create.*job/i,
    /login.*problem/i
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(message)) {
      responseCache.set(pattern.toString(), {
        response,
        timestamp: Date.now()
      });
      break;
    }
  }
}

function shouldEscalateToTicket(context, userMessage) {
  const escalationTriggers = [
    /not working/i,
    /broken/i,
    /error/i,
    /bug/i,
    /can't/i,
    /cannot/i,
    /unable/i,
    /doesn't work/i,
    /won't work/i,
    /issue/i,
    /problem/i
  ];
  
  return escalationTriggers.some(trigger => trigger.test(userMessage));
}

function categorizeIssue(message) {
  if (/login|password|access|authentication/i.test(message)) {
    return 'Authentication';
  } else if (/candidate|resume|profile/i.test(message)) {
    return 'Candidate Management';
  } else if (/job|posting|create/i.test(message)) {
    return 'Job Management';
  } else if (/calendar|schedule|interview/i.test(message)) {
    return 'Calendar/Scheduling';
  } else if (/client|company/i.test(message)) {
    return 'Client Management';
  } else if (/claims|billing|payment/i.test(message)) {
    return 'Claims/Billing';
  } else {
    return 'General';
  }
}

async function startTicketCreation(chatId, userMessage, category, senderId = null) {
  try {
    // Store initial ticket state
    ticketCollectionState.set(chatId, {
      step: 'awaiting_description',
      category: category,
      initialMessage: userMessage,
      senderId: senderId,
      timestamp: Date.now()
    });
    
    return `I can see you're experiencing an issue. I'd like to create a support ticket to get you proper assistance.

**Issue Category**: ${category}
**Your Message**: "${userMessage}"

To help our support team assist you better, could you please provide:
1. What specific steps you were trying to perform?
2. What error message (if any) did you see?
3. When did this issue start occurring?

Please describe the details, and I'll create a support ticket for you.`;

  } catch (error) {
    console.error('❌ Ticket creation error:', error);
    return 'I encountered an issue while trying to create a support ticket. Please contact our support team directly or try again later.';
  }
}

async function handleTicketCreationFlow(chatId, userMessage, ticketState, senderId = null) {
  try {
    if (ticketState.step === 'awaiting_description') {
      // Create the ticket with collected information
      const ticketData = {
        user_id: senderId || 'unknown',
        category: ticketState.category,
        subject: `${ticketState.category} Issue`,
        description: `Initial Message: ${ticketState.initialMessage}\n\nAdditional Details: ${userMessage}`,
        status: 'open',
        priority: 'medium',
        chat_id: chatId,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from(SUPPORT_TICKETS_TABLE)
        .insert([ticketData])
        .select();

      if (error) {
        console.error('❌ Error creating ticket:', error);
        ticketCollectionState.delete(chatId);
        return 'I encountered an error while creating your support ticket. Please contact our support team directly.';
      }

      const ticketNumber = data[0].id;
      ticketCollectionState.delete(chatId);
      
      return `**Support Ticket Created Successfully!**

**Ticket Number**: #${ticketNumber}
**Category**: ${ticketState.category}
**Status**: Open

Your ticket has been submitted to our support team. They will review your issue and get back to you as soon as possible.

You can reference this ticket number (#${ticketNumber}) in any future communications about this issue.

Is there anything else I can help you with in the meantime?`;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Ticket flow error:', error);
    ticketCollectionState.delete(chatId);
    return 'I encountered an error during the ticket creation process. Please contact our support team directly.';
  }
}

// Generate fast FAQ answers
async function getFastFAQAnswer(pageKey, faqQuestion) {
  try {
    const context = `Page: ${pageKey}, Question: ${faqQuestion}`;
    
    // Use context to provide more specific answers
    if (pageKey === 'jobs' && faqQuestion.includes('create')) {
      return `**Creating a New Job Posting:**

1. **Navigate**: Dashboard → Jobs → "Create New Job"
2. **Basic Information**: Job Title, Client/Company, Location
3. **Job Details**: Description, Requirements, Salary Range
4. **Settings**: Status (Active/Draft), Visibility, Application Deadline
5. **Save**: Click "Save" or "Publish" to make it live

**Pro Tips:**
- Use clear, specific job titles
- Include salary range to attract better candidates
- Set realistic requirements
- Preview before publishing`;
    }
    
    if (pageKey === 'candidates' && faqQuestion.includes('add')) {
      return `**Adding a New Candidate:**

1. **Navigate**: Go to Candidates section
2. **Click**: "Add New Candidate" or "+" button
3. **Fill Details**: Name, Email, Phone, Position of Interest
4. **Upload Resume**: PDF, DOC, or DOCX format (max 10MB)
5. **Additional Info**: Skills, Experience Level, Notes
6. **Save**: Click "Save Candidate"

**Common Issues:**
- Make sure all required fields (*) are filled
- Check file format and size for resume uploads
- Ensure email format is valid`;
    }
    
    // Fallback to OpenAI for complex questions
    const messages = [
      {
        role: 'system',
        content: `You are a PM-Next support expert. Provide a helpful, specific answer about ${pageKey} features. Keep responses practical and actionable.`
      },
      {
        role: 'user',
        content: faqQuestion
      }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 300,
      temperature: 0.3
    });

    return completion.choices[0].message.content;
    
  } catch (error) {
    console.error('❌ FAQ generation error:', error);
    return 'I apologize, but I encountered an issue generating a detailed answer. Please try asking your question in a different way, or I can create a support ticket to get you personalized help.';
  }
}

// Send text message to Lark
async function sendMessageToLark(chatId, message) {
  console.log('[DEBUG] sendMessageToLark function called:', {
    chatId: chatId?.substring(0, 10) + '...',
    messageLength: message?.length,
    timestamp: new Date().toISOString()
  });

  let retries = 3;
  
  console.log('Attempting to send message:', {
    chatId: chatId,
    messageLength: message?.length,
    hasLarkClient: !!larkClient
  });

  console.log('[DEBUG] Proceeding directly to message sending...');

  while (retries > 0) {
    try {
      if (!larkClient) {
        throw new Error('Lark client not initialized');
      }

      const messageData = {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: message }),
        uuid: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      console.log('Calling Lark API with:', {
        receive_id: messageData.receive_id,
        msg_type: messageData.msg_type,
        uuid: messageData.uuid,
        contentPreview: messageData.content.substring(0, 100) + '...'
      });

      console.log('[DEBUG] Starting Promise.race with 5 second timeout...');
      
      // Add timeout wrapper to prevent hanging
      const callWithTimeout = (promise, timeoutMs) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => 
            setTimeout(() => {
              console.log('[DEBUG] API call timed out after', timeoutMs, 'ms');
              reject(new Error('API call timeout'));
            }, timeoutMs)
          )
        ]);
      };

      console.log('[DEBUG] Starting Promise.race with 5 second timeout...');
      
      try {
        const result = await callWithTimeout(
          larkClient.im.message.create({
            params: { receive_id_type: 'chat_id' },
            data: messageData
          }),
          5000 // Reduced to 5 second timeout
        );

        console.log('[DEBUG] API call completed, processing result...');
        console.log('Lark API response:', {
          code: result.code,
          msg: result.msg,
          messageId: result.data?.message_id
        });

        if (result.code === 0) {
          console.log('Message sent successfully to Lark');
          return result;
        } else {
          console.error('Message sending failed with Lark error:');
          console.error('- Error Code:', result.code);
          console.error('- Error Message:', result.msg);
          console.error('- Error Data:', result.data);
          
          if (result.code === 230002) {
            console.error('SOLUTION: Bot not in chat. Add bot to the chat/conversation first.');
            console.error('   Chat ID:', chatId);
          }
          
          throw new Error(`Lark API error: ${result.code} - ${result.msg}`);
        }
      } catch (timeoutError) {
        console.log('[DEBUG] Main API call failed, trying simple test message...');
        
        // Try sending a simple test message
        const simpleData = {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text: 'Test message' }),
          uuid: `test_${Date.now()}`
        };
        
        try {
          const testResult = await callWithTimeout(
            larkClient.im.message.create({
              params: { receive_id_type: 'chat_id' },
              data: simpleData
            }),
            3000 // 3 second timeout for test
          );
          
          console.log('[DEBUG] Test message succeeded:', testResult.code);
          throw new Error('Original message content may be too long or contain problematic characters');
        } catch (testError) {
          console.log('[DEBUG] Test message also failed:', testError.message);
          throw timeoutError;
        }
      }
    } catch (error) {
      retries--;
      console.error(`Message sending error (${retries} retries left):`, {
        message: error.message,
        chatId: chatId,
        errorType: error.constructor.name
      });
      
      if (retries === 0) {
        console.error('All message retries failed, giving up');
        throw error;
      }
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
    }
  }
}

// Disable body parsing for larger payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}; 