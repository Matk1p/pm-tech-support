-- Fix RLS policies for knowledge_base table in support schema
-- Run these commands in your Supabase SQL Editor

-- 1. Check current RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'support' AND tablename = 'knowledge_base';

-- 2. Create policies to allow operations for anonymous users
-- Allow anonymous users to read from knowledge_base
CREATE POLICY "Allow anonymous read access" ON support.knowledge_base
    FOR SELECT USING (true);

-- Allow anonymous users to insert into knowledge_base
CREATE POLICY "Allow anonymous insert access" ON support.knowledge_base
    FOR INSERT WITH CHECK (true);

-- Allow anonymous users to update knowledge_base
CREATE POLICY "Allow anonymous update access" ON support.knowledge_base
    FOR UPDATE USING (true);

-- Allow anonymous users to delete from knowledge_base (for testing)
CREATE POLICY "Allow anonymous delete access" ON support.knowledge_base
    FOR DELETE USING (true);

-- 3. Alternative: If you want to disable RLS entirely for this table
-- ALTER TABLE support.knowledge_base DISABLE ROW LEVEL SECURITY;

-- 4. Check if policies were created successfully
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'support' AND tablename = 'knowledge_base';

-- 5. For production, you might want more restrictive policies like:
-- 
-- -- Only allow reading active entries
-- CREATE POLICY "Allow read active entries" ON support.knowledge_base
--     FOR SELECT USING (is_active = true);
-- 
-- -- Only allow insert with proper validation
-- CREATE POLICY "Allow authenticated insert" ON support.knowledge_base
--     FOR INSERT WITH CHECK (
--         question IS NOT NULL AND 
--         answer IS NOT NULL AND 
--         length(question) > 5 AND 
--         length(answer) > 10
--     ); 