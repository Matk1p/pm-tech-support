const fs = require('fs');
const path = require('path');

/**
 * Knowledge Extractor for PM-Next Lark Bot
 * This script extracts information from the PM-Next documentation
 * and formats it for the Lark bot's knowledge base
 */

class KnowledgeExtractor {
  constructor() {
    this.knowledgeBase = {
      features: {},
      navigation: {},
      tasks: {},
      troubleshooting: {},
      architecture: {}
    };
  }

  /**
   * Extract knowledge from the main documentation file
   */
  async extractFromDocumentation(docPath) {
    try {
      const docContent = fs.readFileSync(docPath, 'utf8');
      
      // Extract different sections
      this.extractFeatures(docContent);
      this.extractNavigation(docContent);
      this.extractCommonTasks(docContent);
      this.extractTechnology(docContent);
      this.extractTroubleshooting(docContent);
      
      return this.formatKnowledgeBase();
    } catch (error) {
      console.error('Error extracting knowledge:', error);
      return this.getDefaultKnowledge();
    }
  }

  /**
   * Extract core features from documentation
   */
  extractFeatures(content) {
    const featureSection = this.extractSection(content, '## Core Features', '## Database Schema');
    
    if (featureSection) {
      const features = featureSection.split('###').slice(1);
      features.forEach(feature => {
        const lines = feature.split('\n');
        const title = lines[0].trim();
        const description = lines.slice(1).join('\n').trim();
        
        this.knowledgeBase.features[title] = description;
      });
    }
  }

  /**
   * Extract navigation patterns
   */
  extractNavigation(content) {
    // Look for navigation patterns in the documentation
    const navigationPatterns = [
      { pattern: /Dashboard\s*→\s*(\w+)/g, type: 'dashboard' },
      { pattern: /Navigate to.*?(\w+.*?\w+)/g, type: 'navigation' },
      { pattern: /Access via.*?(\w+.*?\w+)/g, type: 'access' }
    ];

    navigationPatterns.forEach(({ pattern, type }) => {
      const matches = content.match(pattern);
      if (matches) {
        this.knowledgeBase.navigation[type] = matches;
      }
    });
  }

  /**
   * Extract common tasks and workflows
   */
  extractCommonTasks(content) {
    const tasksSection = this.extractSection(content, '## Common Tasks', '## Technology Stack');
    
    if (tasksSection) {
      const tasks = tasksSection.split('**').slice(1);
      for (let i = 0; i < tasks.length; i += 2) {
        if (tasks[i] && tasks[i + 1]) {
          const taskName = tasks[i].replace(':', '').trim();
          const taskSteps = tasks[i + 1].trim();
          this.knowledgeBase.tasks[taskName] = taskSteps;
        }
      }
    }
  }

  /**
   * Extract technology stack information
   */
  extractTechnology(content) {
    const techSection = this.extractSection(content, '## Technology Stack', '## Architecture');
    
    if (techSection) {
      this.knowledgeBase.architecture.technology = techSection
        .split('\n')
        .filter(line => line.includes('**') || line.includes('-'))
        .join('\n');
    }
  }

  /**
   * Extract troubleshooting information
   */
  extractTroubleshooting(content) {
    const troubleshootingSection = this.extractSection(content, '## Troubleshooting', '## Migration Guide');
    
    if (troubleshootingSection) {
      this.knowledgeBase.troubleshooting.common = troubleshootingSection;
    }
  }

  /**
   * Helper method to extract content between two headers
   */
  extractSection(content, startHeader, endHeader) {
    const startIndex = content.indexOf(startHeader);
    if (startIndex === -1) return null;

    const endIndex = endHeader ? content.indexOf(endHeader, startIndex) : content.length;
    if (endIndex === -1) return content.substring(startIndex + startHeader.length);

    return content.substring(startIndex + startHeader.length, endIndex);
  }

  /**
   * Format the extracted knowledge into a comprehensive knowledge base string
   */
  formatKnowledgeBase() {
    return `
# PM-Next Recruitment Management System - Comprehensive Knowledge Base

## Core Features and Navigation

### 1. Candidate Management
**Purpose**: Complete candidate lifecycle management from sourcing to placement
**Navigation**: Dashboard → Candidates
**Key Actions**:
- Add new candidates: Click "Add New" button
- View candidate profiles: Click on candidate name
- Manage applications: Use the applications tab
- Upload resumes: Drag & drop or click upload (AI parsing enabled)
- Track candidate status: Use status dropdown

### 2. Job Management
**Purpose**: Create, manage, and track job postings and requirements
**Navigation**: Dashboard → Jobs
**Key Actions**:
- Create job posting: Click "Create Job" button
- Edit job details: Click on job title
- Track applications: View applications tab
- Manage requirements: Use the requirements section
- Set job status: Active, Closed, On Hold options

### 3. Client Management
**Purpose**: Manage client company relationships and communication
**Navigation**: Dashboard → Clients
**Key Actions**:
- Add new client: Click "Add Client" button
- View client profile: Click on client name
- Track job history: Check jobs tab
- Manage contacts: Use contacts section
- Record interactions: Use communication log

### 4. Pipeline Management
**Purpose**: Visual deal tracking with stage management and probability
**Navigation**: Dashboard → Pipeline
**Key Features**:
- Drag & drop deals between stages
- Set probability percentages
- Track revenue forecasts
- Monitor deal progress
- Generate pipeline reports

### 5. Analytics Dashboard
**Purpose**: Real-time KPIs and performance monitoring
**Navigation**: Dashboard → Analytics
**Available Metrics**:
- Revenue tracking and forecasting
- Candidate conversion rates
- Job fill rates
- Time-to-hire metrics
- Performance indicators
- Custom report generation

### 6. Calendar Integration
**Purpose**: Schedule interviews, meetings, and manage appointments
**Navigation**: Dashboard → Calendar
**Features**:
- Schedule interviews: Click "New Event"
- View upcoming events: Calendar view
- Set reminders: Use notification settings
- Integrate with external calendars
- Manage availability

### 7. Expense Claims Management
**Purpose**: Submit, track, and approve expense claims
**Navigation**: Dashboard → Expenses
**Workflow**:
- Submit claim: Click "New Claim"
- Upload receipts: Drag & drop files
- Track approval status: Check status column
- Generate reports: Use reports section

## Common User Questions and Answers

### Q: How do I add a new candidate?
**A**: 
1. Go to Dashboard → Candidates
2. Click the "Add New" button (top right)
3. Fill in the candidate information form
4. Upload resume (optional - AI parsing will extract details)
5. Set candidate status and tags
6. Click "Save" to add to database

### Q: How do I create a job posting?
**A**:
1. Navigate to Dashboard → Jobs
2. Click "Create Job" button
3. Fill in job details (title, description, requirements)
4. Set job parameters (salary, location, type)
5. Choose client from dropdown
6. Set job status to "Active"
7. Click "Save" to publish

### Q: Where can I see the analytics?
**A**:
Dashboard → Analytics provides comprehensive metrics including:
- Revenue forecasting and tracking
- Candidate pipeline conversion rates
- Job fill rates and time-to-hire
- Individual and team performance
- Custom reports and data export

### Q: How do I schedule an interview?
**A**:
1. Go to Dashboard → Calendar
2. Click "New Event" or use quick-add
3. Select event type (Interview/Meeting)
4. Choose candidate and job
5. Set date, time, and duration
6. Add attendees (client contacts, team members)
7. Send calendar invites

### Q: How do I track a deal in the pipeline?
**A**:
1. Navigate to Dashboard → Pipeline
2. Deals are organized by stages (Lead, Qualified, Proposal, etc.)
3. Drag deals between stages as they progress
4. Click on deal to edit details and probability
5. Use filters to view specific deals
6. Generate reports from the Reports section

## Navigation Quick Reference

**Main Dashboard**: Central hub with overview widgets
**Side Navigation Menu**: 
- Dashboard (Overview)
- Candidates (Candidate management)
- Jobs (Job postings and management)
- Clients (Client relationship management)
- Pipeline (Deal tracking and forecasting)
- Calendar (Scheduling and appointments)
- Analytics (Reports and KPIs)
- Expenses (Expense claim management)
- Settings (User preferences and configuration)

**Global Features**:
- **Search Bar**: Global search across candidates, jobs, and clients
- **Notifications**: Real-time updates and alerts
- **User Menu**: Profile settings and logout
- **Quick Actions**: Floating action button for common tasks

## System Capabilities

**Authentication & Security**:
- Role-based access control (Admin, Manager, Recruiter)
- Secure login with session management
- Data encryption and privacy protection

**Data Management**:
- Real-time synchronization across users
- Automated data backup
- Export capabilities (CSV, PDF)
- Advanced filtering and search

**Integration Features**:
- Email integration for communications
- Calendar synchronization
- AI-powered resume parsing
- Document management and storage

## Troubleshooting Common Issues

**Login Problems**:
- Clear browser cache and cookies
- Check internet connection
- Contact admin for password reset

**Data Not Loading**:
- Refresh the page
- Check internet connection
- Try logging out and back in

**Upload Issues**:
- Check file size (max 10MB)
- Ensure supported file format
- Try different browser if persistent

**Performance Issues**:
- Close unnecessary browser tabs
- Clear browser cache
- Check internet speed
- Contact support if persistent

For additional help, use the built-in help system or contact your system administrator.
`;
  }

  /**
   * Fallback knowledge base if extraction fails
   */
  getDefaultKnowledge() {
    return this.formatKnowledgeBase();
  }

  /**
   * Save the knowledge base to a file
   */
  saveKnowledgeBase(knowledgeBase, outputPath) {
    // Save as markdown file instead of JavaScript
    fs.writeFileSync(outputPath, knowledgeBase);
    console.log(`Knowledge base saved to: ${outputPath}`);
  }
}

// Usage example
async function generateKnowledgeBase() {
  const extractor = new KnowledgeExtractor();
  const docPath = path.join(__dirname, '../COMPLETE_APPLICATION_DOCUMENTATION.md');
  const outputPath = path.join(__dirname, 'knowledge-base.md');
  
  try {
    const knowledgeBase = await extractor.extractFromDocumentation(docPath);
    extractor.saveKnowledgeBase(knowledgeBase, outputPath);
    console.log('✅ Knowledge base generated successfully!');
    return knowledgeBase;
  } catch (error) {
    console.error('❌ Error generating knowledge base:', error);
    const defaultKnowledge = extractor.getDefaultKnowledge();
    extractor.saveKnowledgeBase(defaultKnowledge, outputPath);
    return defaultKnowledge;
  }
}

// Run if called directly
if (require.main === module) {
  generateKnowledgeBase();
}

module.exports = { KnowledgeExtractor, generateKnowledgeBase }; 