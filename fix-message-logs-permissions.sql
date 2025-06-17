-- Fix permissions for message_logs table
-- Run this in your Supabase SQL Editor

-- Grant necessary permissions to authenticated and anon roles
GRANT ALL ON support.message_logs TO authenticated;
GRANT ALL ON support.message_logs TO anon;

-- Enable RLS (Row Level Security)
ALTER TABLE support.message_logs ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for the message_logs table
-- Policy 1: Allow reading all message logs
CREATE POLICY "Allow read access to message_logs" ON support.message_logs
    FOR SELECT USING (true);

-- Policy 2: Allow inserting message logs 
CREATE POLICY "Allow insert access to message_logs" ON support.message_logs
    FOR INSERT WITH CHECK (true);

-- Policy 3: Allow updating message logs (for satisfaction ratings, etc.)
CREATE POLICY "Allow update access to message_logs" ON support.message_logs
    FOR UPDATE USING (true);

-- Grant usage on the schema
GRANT USAGE ON SCHEMA support TO authenticated;
GRANT USAGE ON SCHEMA support TO anon; 