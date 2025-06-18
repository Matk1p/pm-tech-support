# PM-Next Recruitment Management System - Comprehensive Knowledge Base

## Important Instructions for AI Assistant

**Feature Availability**: When users ask about features marked with 🚧 **NOT IMPLEMENTED YET**, respond that the feature is not currently available in the system. Do not provide detailed instructions for unavailable features. Instead, acknowledge their interest and let them know the feature needs to be developed.

**Available Features**: All features not marked as "Not Implemented Yet" are fully functional and you can provide complete guidance on their usage.

## Core Features and Navigation

### 1. Dashboard ✅ **FULLY IMPLEMENTED**
**Purpose**: Central hub with comprehensive analytics, KPIs, and role-based data visualization
**Navigation**: Main page after login
**Key Features**:
- Role-based access control (RBAC) with different views for Admin, Manager, Recruiter
- Real-time KPI tracking (revenue, pipeline values, candidate metrics)
- Staff filtering capabilities for managers and admins
- Time-based filtering (Last Week, Last Month, Last 3 Months, etc.)
- Financial pipeline breakdown with currency conversion
- Candidate stage tracking and detailed analytics
- Target overview with quarterly/yearly views
- Interactive charts and data visualization
- Pipeline value calculations based on job assignments
- Clickable pipeline stages for detailed candidate breakdowns

### 2. Jobs Management ✅ **FULLY IMPLEMENTED**
**Purpose**: Complete job lifecycle management with candidate assignment
**Navigation**: Dashboard → Jobs
**Key Features**:
- Create and edit job postings with comprehensive details (budget, location, requirements)
- Assign candidates to jobs with pipeline stage tracking
- RBAC-based job visibility and editing permissions
- Advanced filtering by status, role manager, job type, location, and search
- Candidate-to-job assignment with status tracking and pipeline management
- Budget management with multi-currency support
- Percentage signed tracking for revenue calculations
- Integration with candidate management system
- Mobile-responsive job details view with split-screen layout
- Server-side pagination for performance
- Job deletion with proper cleanup
- Candidate count tracking per job

### 3. Candidates Management ✅ **FULLY IMPLEMENTED**
**Purpose**: Complete candidate lifecycle from sourcing to placement
**Navigation**: Dashboard → Candidates
**Key Features**:
- Add candidates manually or via resume upload with AI parsing
- Bulk import functionality for multiple candidates
- Advanced search and filtering by candidate manager
- Job assignment tracking through CandidateJobs relationship
- Resume processing and automatic data extraction using OpenAI
- Candidate notes and communication history
- RBAC-based candidate visibility
- Mobile-responsive candidate profiles
- Integration with job assignment system
- Detailed candidate profile pages with education, work experience, and languages
- Job assignment management with status updates
- Additional resume upload capability

### 4. Clients Management ✅ **FULLY IMPLEMENTED**
**Purpose**: Client relationship management with job tracking
**Navigation**: Dashboard → Clients
**Key Features**:
- Client company profile management
- Parent company grouping and organization
- Job history tracking for each client
- Financial value calculations per client with currency conversion
- Currency conversion for international clients
- Advanced search and filtering capabilities
- Client details with comprehensive information display
- RBAC-based client access control
- Client creation and editing with full form validation

### 5. Calendar System ✅ **FULLY IMPLEMENTED**
**Purpose**: Comprehensive scheduling and event management
**Navigation**: Dashboard → Calendar
**Key Features**:
- Interactive calendar with month/week/day views using react-big-calendar
- Multiple event types: Leave requests, Candidate meetings, Client meetings
- Event creation and editing with detailed information
- Leave request approval workflow for managers
- Integration with candidate and client systems
- Mobile-responsive calendar interface
- Event filtering by type
- Staff selection for event assignment
- Real-time synchronization with external calendar systems

### 6. Claims Management ✅ **FULLY IMPLEMENTED**
**Purpose**: Expense claims submission and approval system
**Navigation**: Dashboard → Claims
**Key Features**:
- Submit expense claims with receipt uploads
- Multiple claim types supported (defined in CLAIM_TYPES)
- Approval workflow for managers and admins
- Currency support for international expenses
- Claims summary by staff and location
- Historical claims tracking with date filtering
- Receipt management and viewing
- RBAC-based approval permissions
- Meeting-based expense claims integration

### 7. Analytics Dashboard 🚧 **NOT IMPLEMENTED YET**
**Status**: There is no separate analytics page - analytics functionality is integrated into the main Dashboard
**Note**: The Dashboard provides comprehensive analytics, but there's no dedicated Analytics page as shown in the navigation menu. Users asking about the Analytics page should be informed it's not implemented yet.

## Pipeline Management System ✅ **FULLY INTEGRATED**

**Pipeline Stages Available**:
- **Status-Based Stages**: Contacted, CV Sent, Interviewing, Offer Received, Offer Accepted
- **Financial Pipeline Stages**: Invoiced, Collected
- **Additional Statuses**: Call Arranged, CV Requested, No Response, Candidate Not Interested, Failed Interview, Received Offer But Rejected, CV Sent But Rejected, Candidate Not Suitable, Mapped, Standby, Candidate Not Looking Out

**Current Implementation**: 
- Pipeline tracking is fully integrated into the Jobs and Dashboard systems
- Financial pipeline calculations with real-time value tracking
- Candidate-job assignments with pipeline stage management
- Revenue forecasting based on job budgets and percentages
- Interactive pipeline stage clicking for detailed breakdowns
- RBAC-filtered pipeline analytics
- Real-time pipeline value calculations with currency conversion

**Available Features**:
- Drag-and-drop-like pipeline management through job assignments
- Financial value tracking at each pipeline stage
- Pipeline stage filtering and detailed candidate lists
- Probability-based revenue calculations
- Staff role breakdown (CM/RM/CRM) in pipeline analytics

## Navigation Structure (Actual Implementation)

**Available Pages**:
- **Dashboard** (✅ Main analytics and overview)
- **Jobs** (✅ Job management with candidate assignment)  
- **Clients** (✅ Client relationship management)
- **Calendar** (✅ Event and leave management)
- **Claims** (✅ Expense claims system)
- **Candidates** (✅ Candidate management with job assignments)
- **Analytics** (🚧 Not implemented - navigation exists but no page)

**Hidden/Additional Pages**:
- **Leave** (✅ Separate leave management page, not in main navigation)
- **Auth Debug** (✅ Development/debugging page)
- **Candidate Detail Pages** (✅ Individual candidate profiles with comprehensive data)

**Authentication Pages**:
- **Login** (✅ User authentication)
- **Forgot Password** (✅ Password recovery)
- **Reset Password** (✅ Password reset functionality)
- **Auth Code Error** (✅ Authentication error handling)

## System Capabilities ✅ **FULLY IMPLEMENTED**

**Authentication & Security**:
- Role-based access control (Admin, Manager, Recruiter)
- Secure authentication with Supabase
- Permission-based UI components (CreateButton, EditButton, DeleteButton, ApproveButton)
- Protected routes and API endpoints
- Staff-based data filtering

**Data Management**:
- Real-time database operations with Supabase
- RBAC-filtered data queries
- Advanced search and filtering across all modules
- File upload and document management
- Currency conversion and multi-currency support
- Server-side pagination for performance
- Data export capabilities

**Integration Features**:
- AI-powered resume parsing using OpenAI
- Email integration capabilities
- Calendar synchronization with external systems
- Bulk import functionality
- PDF generation capabilities
- Real-time notifications and updates

**Technical Implementation**:
- Next.js 14 with TypeScript
- RTK Query for state management and caching
- Supabase for database and authentication
- Tailwind CSS for styling
- Mobile-responsive design with adaptive layouts
- Advanced filtering and pagination
- Real-time data synchronization

## Common User Questions and Answers

### Q: How do I add a new candidate?
**A**: 
1. Go to Dashboard → Candidates
2. Click "Add New" button
3. Choose to add manually or upload resume for AI parsing
4. Fill in candidate information (AI will pre-populate from resume)
5. Save to add to the system
6. Assign to jobs through the Jobs page candidate assignment feature or via the candidate detail page

### Q: How do I create a job posting?
**A**:
1. Navigate to Dashboard → Jobs  
2. Click "Create Job" button
3. Fill in comprehensive job details (title, description, requirements, budget)
4. Set job parameters (location, type, role manager, currency)
5. Assign candidates directly from the job page using the Candidates tab
6. Track pipeline progress through the candidate assignments

### Q: How do I assign candidates to jobs?
**A**:
1. **From Jobs page**: Select a job → Go to Candidates tab → Click "Add Candidate" or "Add Existing"
2. **From Candidate profile**: Go to candidate detail page → Use job assignment section → Select job and status
3. Set the appropriate pipeline stage (Contacted, CV Sent, Interviewing, etc.)
4. Track progress by updating the status as the candidate moves through stages

### Q: Where can I see analytics and reports?
**A**: 
Analytics are integrated into the main Dashboard. There is no separate Analytics page currently. The Dashboard provides:
- Real-time KPIs and metrics with role-based filtering
- Financial pipeline tracking with clickable stages
- Candidate conversion analytics by pipeline stage
- Role-based performance data (CM/RM/CRM breakdowns)
- Time-filtered reporting with multiple date ranges
- Revenue forecasting and targets with currency conversion
- Interactive pipeline stage details with candidate breakdowns

### Q: How do I manage expense claims?
**A**:
1. Go to Dashboard → Claims
2. Click "Submit New Claim" 
3. Select claim type and upload receipt
4. Fill in expense details with appropriate currency
5. Submit for approval
6. Managers can approve/reject from the approval tab
7. Track claim status and history with date filtering

### Q: How do I schedule meetings or manage leave?
**A**:
1. Navigate to Dashboard → Calendar
2. Click on date/time slot or "New Event"
3. Select event type (Leave, Meeting with Candidate, Meeting with Client)
4. Fill in details and attendees
5. For leave requests, managers can approve/reject from the calendar or approval section
6. Events integrate with candidate and client records

### Q: How does the permission system work?
**A**:
- **Admin**: Full access to all features and data across all staff
- **Manager**: Can view team data, approve requests, manage assignments for their team
- **Recruiter**: Limited to assigned candidates/jobs, can create and edit own records
- UI automatically adapts based on user permissions
- Data is filtered automatically based on role and staff assignments
- Permission buttons (Create/Edit/Delete/Approve) show only when user has appropriate access

### Q: What are the pipeline stages and how do they work?
**A**:
The system uses two types of pipeline tracking:
- **Status-based stages**: Contacted → CV Sent → Interviewing → Offer Received → Offer Accepted
- **Financial stages**: Invoiced → Collected
- Each candidate-job assignment can have a status and pipeline stage
- Financial calculations are based on job budget × percentage signed
- Pipeline stages are clickable in the Dashboard for detailed candidate breakdowns
- Revenue forecasting uses probability percentages for each stage

## Mobile Responsiveness ✅ **FULLY IMPLEMENTED**

All pages are mobile-responsive with:
- Adaptive navigation and layouts
- Touch-friendly interfaces with proper touch targets
- Mobile-optimized data tables with horizontal scrolling
- Responsive modals and forms
- Mobile-specific calendar interfaces
- Sidebar navigation that collapses on mobile
- Mobile-first responsive design approach

## Troubleshooting Common Issues

**Login Problems**:
- Check authentication with Supabase
- Verify user permissions and role assignment
- Contact admin for role-based access issues
- Clear browser cache if authentication persists

**Data Not Loading**:
- Check internet connection
- Verify RBAC permissions for data access
- Try refreshing the page
- Check browser console for permission errors
- Verify staff assignments are correct

**Upload Issues**:
- Verify file size limits (typically 10MB max)
- Check supported file formats (PDF, DOC, DOCX for resumes)
- Ensure proper permissions for file uploads
- Check internet connection stability

**Permission Issues**:
- Contact admin to verify user role assignment
- Check if user has access to specific features
- Verify staff assignment for data visibility
- Ensure proper RBAC configuration

**Pipeline/Financial Data Issues**:
- Verify job budgets and percentage signed are set correctly
- Check currency conversion rates are up to date
- Ensure candidate-job assignments have proper pipeline stages
- Verify staff roles (CM/RM/CRM) are assigned correctly

For additional help, contact your system administrator or check the application logs for detailed error information. 