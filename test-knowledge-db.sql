-- Test data for knowledge_base table
-- Run this in your Supabase SQL editor to add test entries

INSERT INTO support.knowledge_base (question, answer, category, is_active, created_at) VALUES
('How do I export candidate data to CSV?', 
 'To export candidate data: 1) Go to Candidates page, 2) Click the "Export" button in the top right, 3) Select "CSV Format", 4) Choose your date range and filters, 5) Click "Download". The file will download to your computer.',
 'candidate_management', 
 true, 
 NOW()),

('Why is my dashboard loading slowly?', 
 'Dashboard performance issues can be caused by: 1) Large amounts of data being loaded, 2) Slow internet connection, 3) Browser cache issues. Try: Clear your browser cache, Check your internet speed, Contact support if the issue persists.',
 'system_performance', 
 true, 
 NOW()),

('How do I set up automated email notifications for new applications?', 
 'To enable automated notifications: 1) Go to Settings → Notifications, 2) Toggle "Email Notifications" ON, 3) Select "New Applications", 4) Choose notification frequency (Instant/Daily/Weekly), 5) Save settings. You will now receive emails when candidates apply.',
 'job_management', 
 true, 
 NOW()),

('Can I customize the interview scheduling form?', 
 'Yes! Interview forms are customizable: 1) Navigate to Settings → Interview Templates, 2) Click "Create New Template" or edit existing, 3) Add/remove fields as needed, 4) Set required fields, 5) Save template. The new form will be available when scheduling interviews.',
 'general', 
 true, 
 NOW()),

('How do I recover deleted candidate profiles?', 
 'Deleted profiles can be recovered within 30 days: 1) Go to Candidates → Archive, 2) Use the search to find the deleted profile, 3) Click the "Restore" button, 4) Confirm restoration. Note: After 30 days, profiles are permanently deleted and cannot be recovered.',
 'candidate_management', 
 true, 
 NOW());

-- Also add one inactive entry to test filtering
INSERT INTO support.knowledge_base (question, answer, category, is_active, created_at) VALUES
('This should not appear in results', 
 'This is an inactive entry that should be filtered out.',
 'test', 
 false, 
 NOW()); 