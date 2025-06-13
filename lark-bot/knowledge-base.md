# PM-Next Recruitment Management System - Knowledge Base

## System Overview

**PM-Next** is an enterprise-grade recruitment management system built with Next.js 15 and Supabase. It provides end-to-end recruitment lifecycle management for recruitment agencies, from candidate sourcing to placement and billing.

### Key Capabilities
- **Complete Recruitment Lifecycle**: Candidate tracking from initial contact to placement
- **Client Relationship Management**: Comprehensive client company profiles and engagement tracking
- **Job Management**: Full job posting lifecycle with requirements and application tracking
- **Pipeline Management**: Visual deal tracking with stage management and revenue forecasting
- **Financial Analytics**: Real-time KPIs, revenue tracking, and performance monitoring
- **Expense Management**: Complete expense claims workflow with approval system
- **Calendar Integration**: Interview scheduling and meeting management
- **AI-Powered Processing**: Resume parsing and candidate data extraction
- **Real-time Collaboration**: Live updates and notifications across the team

---

## Core Features & Modules

### 1. Candidate Management (`/candidates`)
**Purpose**: Complete candidate lifecycle management from sourcing to placement

**Key Features**:
- **Candidate Profiles**: Personal details, contact info, current position, PQE
- **Resume Management**: Upload, AI parsing with OpenAI, document storage
- **Status Tracking**: 17 predefined statuses from "Contacted" to "Placed"
- **Job Applications**: Link candidates to multiple jobs with individual statuses
- **Pipeline Stages**: Track progression through "Invoiced" and "Collected" stages
- **Tags & Categorization**: Flexible tagging system for candidate organization
- **Communication Logs**: Track all interactions with timestamps
- **Skills & Experience**: Detailed work experience, education, legal qualifications
- **Notes Management**: Rich text notes with timestamps and author tracking

**Navigation**: Dashboard → Candidates

**Key Actions**:
- Add new candidate: Click "Add New" → Fill form → AI resume parsing
- View candidate profile: Click candidate name → Full profile view
- Manage applications: Applications tab → Link to jobs → Set status
- Track pipeline: Monitor "Invoiced" and "Collected" stages
- Record communications: Communication tab → Log calls, emails, meetings

### 2. Job Management (`/jobs`)
**Purpose**: Create, manage, and track job postings with full lifecycle support

**Key Features**:
- **Job Creation**: Title, description, requirements, location, budget
- **Client Association**: Link jobs to client companies with relationship tracking
- **Budget Management**: Annual role budget with multi-currency support
- **Commission Structure**: RM, CM, CRM percentage allocation
- **Status Management**: Draft, Active, On Hold, Closed statuses
- **Candidate Tracking**: View all candidates applied to specific jobs
- **Pipeline Integration**: Revenue forecasting based on job budgets
- **Tags & Categories**: Flexible job categorization system

**Navigation**: Dashboard → Jobs

**Key Actions**:
- Create job: "Create Job" → Fill details → Set budget & commissions → Assign client
- Edit job details: Click job title → Edit form → Update requirements
- Track applications: Applications tab → View linked candidates → Manage statuses
- Monitor revenue: Budget × percentage signed = pipeline value

### 3. Client Management (`/clients`)
**Purpose**: Comprehensive client company relationship management

**Key Features**:
- **Company Profiles**: Name, description, industry, company size, locations
- **Contact Management**: Multiple contacts with roles and communication preferences
- **Financial Tracking**: Invoiced value, collected value, outstanding amounts
- **Job Portfolio**: All jobs associated with client company
- **Relationship Management**: Assigned CRM with interaction history
- **Terms & Agreements**: Terms of engagement and contract details
- **Multi-location Support**: Handle clients with multiple office locations
- **Revenue Analytics**: Per-client revenue analysis and forecasting

**Navigation**: Dashboard → Clients

**Key Actions**:
- Add client: "Add Client" → Company details → Contact info → Assign CRM
- View client profile: Click client name → Full company overview
- Track revenue: Financial tab → Invoiced/collected values
- Manage contacts: Contacts section → Add/edit contact persons

### 4. Pipeline & Analytics (`/dashboard`)
**Purpose**: Visual deal tracking with comprehensive performance analytics

**Key Features**:
- **Pipeline Management**: Drag-and-drop deals between stages
- **Revenue Forecasting**: Automatic calculations based on job budgets and probabilities
- **KPI Dashboard**: Real-time metrics and performance indicators
- **Stage Tracking**: "Invoiced" and "Collected" pipeline stages
- **Probability Management**: Set deal probability percentages
- **Financial Analytics**: Revenue trends, conversion rates, time-to-hire
- **Staff Performance**: Individual and team performance metrics
- **Date Range Filtering**: Flexible date range selection for analytics

**Navigation**: Dashboard (default landing page)

**Key Actions**:
- View KPIs: Dashboard → Real-time metrics display
- Analyze pipeline: Pipeline section → Filter by stages/staff
- Track revenue: Revenue charts → Trend analysis
- Monitor performance: Staff performance cards → Individual metrics

### 5. Expense Claims (`/claims`)
**Purpose**: Complete expense submission and approval workflow

**Key Features**:
- **Claim Submission**: Create expense claims with categories and amounts
- **Receipt Management**: Upload and attach receipts to claims
- **Approval Workflow**: Multi-level approval process with status tracking
- **Expense Categories**: Predefined categories (Travel, Meals, Office, etc.)
- **Multi-currency Support**: Handle expenses in different currencies
- **Reporting**: Generate expense reports by date, staff, category
- **Status Tracking**: Submitted, Approved, Rejected, Paid statuses

**Navigation**: Dashboard → Claims

### 6. Calendar Integration (`/calendar`)
**Purpose**: Interview scheduling and meeting management

**Key Features**:
- **Event Scheduling**: Create interviews, meetings, and appointments
- **Calendar Views**: Month, week, day views with event details
- **Candidate Integration**: Link events to specific candidates and jobs
- **Reminder System**: Automated reminders for upcoming events
- **Recurring Events**: Support for recurring meetings and interviews
- **Time Zone Support**: Handle multi-timezone scheduling

**Navigation**: Dashboard → Calendar

### 7. Communication Management
**Purpose**: Centralized logging of all candidate/client interactions

**Key Features**:
- **Interaction Logging**: Record calls, emails, meetings with details
- **Communication Types**: Phone, email, meeting, interview categories
- **Participant Tracking**: Link to candidates, clients, jobs
- **Outcome Recording**: Log meeting outcomes and next steps
- **Follow-up Management**: Schedule and track follow-up actions
- **Search & Filtering**: Find communications by date, type, participant

### 8. Staff Management (`/staff`)
**Purpose**: Team management with role-based access control

**Key Features**:
- **Staff Profiles**: Personal and professional information
- **Role Management**: Admin, Manager, Recruiter roles with permissions
- **Target Setting**: Individual and team performance targets
- **Performance Tracking**: KPIs, conversion rates, revenue tracking
- **Leave Management**: Time off requests and approval
- **Hierarchy Management**: Reporting structure and team organization

---

## Advanced Features

### 1. AI-Powered Resume Parsing
**Technology**: OpenAI GPT-4 integration
**Process**:
1. User uploads resume (PDF, DOC, DOCX)
2. File sent to OpenAI API for parsing
3. AI extracts: name, contact, experience, education, skills
4. Parsed data pre-fills candidate form
5. User reviews and confirms data

### 2. Real-time Updates
**Technology**: Supabase Realtime with WebSockets
**Features**:
- Live candidate status updates
- Pipeline changes across users
- New job notifications
- Chat-like collaboration

### 3. Advanced Analytics
**Capabilities**:
- Revenue forecasting with probability weighting
- Conversion rate analysis by stage
- Time-to-hire metrics
- Individual and team performance tracking
- Custom date range filtering
- Export to CSV/PDF

---

## Common User Questions

### Q: How do I add a new candidate?
**A**: 
1. Navigate to Dashboard → Candidates
2. Click "Add New" button (top right)
3. Fill in candidate details form
4. Upload resume (AI will auto-extract information)
5. Set candidate status and add tags
6. Link to jobs if applicable
7. Click "Save" to add to database

### Q: How do I create a job posting?
**A**:
1. Go to Dashboard → Jobs
2. Click "Create Job" button
3. Enter job title and description
4. Set annual budget and currency
5. Select client from dropdown
6. Assign staff (RM, CM, CRM) and set commission percentages
7. Set job status to "Active"
8. Click "Save" to publish

### Q: Where can I see analytics and KPIs?
**A**:
Dashboard provides comprehensive analytics:
- **Revenue Tracking**: Total and forecasted revenue
- **Pipeline Analysis**: Deals by stage with probabilities
- **Conversion Rates**: Candidate progression through stages
- **Performance Metrics**: Individual and team KPIs
- **Time-to-hire**: Average placement timeframes
- **Custom Reports**: Filter by date range, staff, or client

### Q: How do I track the recruitment pipeline?
**A**:
1. Navigate to Dashboard → Pipeline section
2. View deals organized by stages (Lead, Qualified, Proposal, etc.)
3. Filter by staff member or date range
4. Click on individual deals to see details
5. Update probability percentages as deals progress
6. Monitor revenue forecasts based on pipeline value

### Q: How do I schedule an interview?
**A**:
1. Go to Dashboard → Calendar
2. Click "New Event" or use quick-add
3. Select event type (Interview/Meeting)
4. Choose candidate and associated job
5. Set date, time, and duration
6. Add attendees (client contacts, team members)
7. Send calendar invites automatically

### Q: How do I submit an expense claim?
**A**:
1. Navigate to Dashboard → Claims
2. Click "New Claim" button
3. Select expense category (Travel, Meals, Office, etc.)
4. Enter amount and currency
5. Upload receipt photo or document
6. Add description and business justification
7. Submit for manager approval
8. Track approval status in claims list

### Q: How do I link a candidate to a job?
**A**:
1. Go to candidate profile or job profile
2. Click "Applications" or "Link to Job" button
3. Search and select the job/candidate
4. Set application status (Applied, Interviewing, etc.)
5. Set pipeline stage if applicable (Invoiced, Collected)
6. Save the relationship

### Q: How do I manage candidate statuses?
**A**:
Available statuses include:
- **Contacted**: Initial outreach made
- **Call Arranged**: Interview scheduled
- **Interviewing**: In interview process
- **CV Requested**: Requesting updated resume
- **CV Sent**: Resume submitted to client
- **Offer Received**: Client made offer
- **Offer Accepted**: Candidate accepted position
- **Invoiced**: Placement fee invoiced
- **Collected**: Payment received

Update status from candidate profile or applications view.

### Q: How do I generate reports?
**A**:
1. Dashboard → Analytics section
2. Select date range for reporting period
3. Choose report type (Revenue, Pipeline, Performance, Candidate reports)
4. Apply filters (staff, client, status)
5. Click "Export" for CSV/PDF download

---

## Troubleshooting Guide

### Diagnostic Follow-up Questions

When users report issues, ask these follow-up questions to gather specific information:

#### General Diagnostic Questions
- "What exactly happens when you try to [action]? Do you see any error messages?"
- "What browser are you using? (Chrome, Safari, Firefox, Edge)"
- "Have you tried refreshing the page or using a different browser?"
- "When did this issue start happening? Was it working before?"
- "Are you able to perform other actions in the system normally?"

#### File Upload Issues (Resumes, Receipts, Documents)
**Follow-up Questions**:
- "What file format are you trying to upload? (PDF, DOC, DOCX)"
- "What's the file size? (You can check by right-clicking the file → Properties)"
- "Do you see any specific error message when the upload fails?"
- "Does the upload start and then fail, or does it not start at all?"
- "Have you tried uploading a different file to test?"
- "Are you dragging and dropping or using the upload button?"

#### Candidate Management Issues
**Follow-up Questions**:
- "Are you trying to add a new candidate or edit an existing one?"
- "Which step in the process is not working? (Form filling, saving, resume upload, etc.)"
- "Do you see the candidate in the list but missing information?"
- "Are you getting any validation errors on the form?"
- "Did the AI resume parsing work, or did you skip that step?"

#### Job Creation/Management Issues
**Follow-up Questions**:
- "Are you trying to create a new job or edit an existing one?"
- "Which section is causing problems? (Basic info, budget, client selection, etc.)"
- "Is the client dropdown populated with options?"
- "Are you getting any error messages when saving?"
- "Does the job appear in the jobs list after creation?"

#### Pipeline/Analytics Issues
**Follow-up Questions**:
- "Are you not seeing any data, or is some data missing?"
- "What date range are you looking at?"
- "Are you filtering by specific staff members or viewing all?"
- "Do you see the pipeline stages but no deals in them?"
- "Are the KPI cards showing zero or not loading at all?"

#### Search/Filter Issues
**Follow-up Questions**:
- "What are you trying to search for specifically?"
- "Are you using the global search or filters on a specific page?"
- "Do you get no results, or wrong results?"
- "Are you searching by name, ID, or other criteria?"
- "Do you know the item exists in the system?"

#### Calendar/Scheduling Issues
**Follow-up Questions**:
- "Are you trying to create a new event or view existing ones?"
- "Is the calendar completely blank or just missing some events?"
- "Are you selecting a candidate and job when creating the event?"
- "Do you get an error when trying to save the event?"
- "Are other people's events showing up correctly?"

#### Login/Authentication Issues
**Follow-up Questions**:
- "Are you getting a specific error message when logging in?"
- "Are you using the correct email address for your account?"
- "Have you tried the 'Forgot Password' option?"
- "Were you able to log in before, or is this your first time?"
- "Are you accessing the correct URL for the system?"

### Common Issues & Solutions

#### Login Problems
**Symptoms**: Cannot login, "Invalid credentials" error
**Initial Response**: "I can help you troubleshoot the login issue. Let me ask a few questions to understand what's happening:"
**Follow-up Questions**: Use Login/Authentication diagnostic questions above
**Solutions**:
1. Clear browser cache and cookies
2. Check internet connection stability
3. Verify email address is correct
4. Use "Forgot Password" if needed
5. Contact admin for account status check

#### Data Not Loading
**Symptoms**: Blank pages, loading spinners don't disappear
**Initial Response**: "Let me help you figure out why the data isn't loading. Can you tell me:"
**Follow-up Questions**: Use General diagnostic questions above
**Solutions**:
1. Refresh the page (Ctrl+F5 or Cmd+Shift+R)
2. Check browser console for errors (F12)
3. Verify internet connection
4. Try different browser or incognito mode
5. Check system status

#### File Upload Issues
**Symptoms**: Resume upload fails, documents not appearing, "Upload error" message
**Initial Response**: "I can help troubleshoot the file upload issue. To better assist you, could you tell me:"
**Follow-up Questions**: Use File Upload diagnostic questions above
**Solutions**:
1. Check file size (max 10MB)
2. Verify file format (PDF, DOC, DOCX supported for resumes)
3. Try different file if corrupted
4. Check internet connection during upload
5. Use different browser if persistent
6. Try using upload button instead of drag-and-drop

**Escalation Scenarios**:
- If user confirms correct file format and size but upload still fails to start
- If user has tried different browsers and files without success
- If upload appears successful but files don't appear in the system
- If user reports the issue is blocking their daily work

**Escalation Response for Upload Issues**:
"Based on your feedback (PDF file, 5MB, no error messages, upload doesn't start at all, tried different files), this appears to be a technical issue with the upload functionality that requires direct investigation by our technical team. Let me connect you with live support who can examine your account settings and server logs.

[Use Live Support Escalation Response template]"

#### Performance Issues
**Symptoms**: Slow page loading, laggy interface
**Initial Response**: "I can help improve the system performance. Let me understand your setup:"
**Follow-up Questions**: Use General diagnostic questions above plus browser/device info
**Solutions**:
1. Close unnecessary browser tabs
2. Clear browser cache and cookies
3. Check internet speed (minimum 10 Mbps recommended)
4. Disable browser extensions temporarily
5. Try different browser or device

### Response Template for Issues

When a user reports a problem, use this format:

1. **Acknowledge the issue**: "I understand you're having trouble with [specific feature]."

2. **Ask diagnostic questions**: "To help me provide the best solution, could you tell me:"
   - [2-3 most relevant follow-up questions from above]

3. **Provide initial guidance**: "While I gather this information, here are some quick things you can try:"
   - [1-2 most common solutions]

4. **Offer escalation**: "If these steps don't resolve the issue, please let me know the answers to my questions above, and I can provide more specific guidance."

### Escalation Keywords

If users mention these terms, prioritize immediate escalation:
- "urgent"
- "can't work"
- "system down"
- "data lost"
- "corruption"
- "security breach"
- "payment issue"

### When to Escalate to Live Support

Escalate to live support when:
1. **User has tried suggested solutions** and they don't work
2. **Multiple follow-up attempts** haven't resolved the issue
3. **Technical issues** beyond basic troubleshooting (server errors, data corruption, etc.)
4. **Urgent business impact** issues
5. **User expresses frustration** or requests human help
6. **Complex configuration** or setup issues
7. **Issues affecting multiple users** or system-wide problems

### Live Support Escalation Response

When escalating, use this template:

"I understand this issue is affecting your work and the troubleshooting steps haven't resolved it. Let me connect you with our live support team who can provide immediate assistance.

**For Live Support:**
🔗 **Join our PM-Next Support Chat**: [PM-Next Live Support Group](https://applink.larksuite.com/client/chat/chatter/add_by_link?link_token=3ddsabad-9efa-4856-ad86-a3974dk05ek2)

Or contact our support team directly:
📧 **Email**: support@pm-next.com
📞 **Phone**: +1-XXX-XXX-XXXX (Business hours: 9 AM - 6 PM)
💬 **Live Chat**: Available in the PM-Next application (click the help icon)

**What to mention when contacting support:**
- Your issue: [brief description]
- Steps you've already tried: [list the troubleshooting steps]
- Your browser and system information
- Screenshots of any error messages (if applicable)

Our live support team will be able to look at your specific setup and provide personalized assistance. They typically respond within 15-30 minutes during business hours."

### Auto-Escalation Triggers

Automatically suggest live support if:
- User says "still not working" after trying solutions
- User asks "can I talk to someone" or similar
- User mentions they "need urgent help"
- User provides answers to diagnostic questions but issue persists
- User seems frustrated with repeated troubleshooting attempts

---

## Navigation Quick Reference

**Main Dashboard**: Central hub with overview of all activities
**Side Navigation Menu**: 
- Dashboard (Overview and KPIs)
- Candidates (Candidate management)
- Jobs (Job postings and management)
- Clients (Client relationship management)
- Calendar (Scheduling and appointments)
- Claims (Expense management)
- Leave (Leave requests and management)

**Global Features**:
- **Search Bar**: Global search across candidates, jobs, and clients
- **Notifications**: Real-time updates and alerts
- **User Menu**: Profile settings and logout
- **Quick Actions**: Floating action button for common tasks

## Technology Stack

**Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui
**Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
**State Management**: Redux Toolkit with RTK Query
**AI Integration**: OpenAI GPT-4 for resume parsing
**External Services**: Resend for emails

## AI Assistant Behavior Guidelines

### When Users Report Issues
1. **ALWAYS ask follow-up questions** instead of giving generic solutions immediately
2. **Use the diagnostic questions** provided in the troubleshooting section
3. **Ask 2-3 specific questions** to understand the problem better
4. **Acknowledge the user's frustration** and show you want to help
5. **Provide 1-2 quick initial steps** they can try while gathering more info

### Example Response Pattern
Instead of: "Here are some troubleshooting steps..."

Use: "I understand you're having trouble with [feature]. To help me provide the best solution, could you tell me:
- [Specific diagnostic question 1]
- [Specific diagnostic question 2]
- [Specific diagnostic question 3]

While I gather this information, you could try [1 quick step]. Let me know what you find!"

### When Troubleshooting Fails
If user has provided diagnostic information but the issue persists, respond with:

"Thank you for providing those details. Based on what you've told me:
- [Summarize their situation]
- [Acknowledge steps they've tried]

This appears to be a technical issue that requires direct investigation. Let me connect you with our live support team who can examine your specific setup and provide hands-on assistance.

[Use Live Support Escalation Response template]"

### Tone and Approach
- **Be conversational and helpful**
- **Ask one question at a time if the issue is complex**
- **Use the user's exact terminology** when referring back to their issue
- **Provide step-by-step guidance** with clear navigation paths
- **Always offer to help further** based on their responses

### Handling User Responses
- **Parse structured responses**: If user provides numbered/bulleted answers, extract the content even from complex message formats
- **Maintain conversation context**: Remember what diagnostic questions you asked and relate answers back to them
- **Acknowledge all provided information**: Show you understood their responses before proceeding
- **If unclear**: Ask for clarification rather than assuming

### Context Awareness
- **Remember the conversation flow**: Keep track of what issue the user reported and what questions you asked
- **Connect follow-up messages**: If user says "how do I solve this issue" after providing diagnostic info, relate it back to their original problem
- **Summarize before escalating**: Review what the user has told you and what hasn't worked

This knowledge base provides comprehensive guidance for using the PM-Next recruitment management system effectively. 