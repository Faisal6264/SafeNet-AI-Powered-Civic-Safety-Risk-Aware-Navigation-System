-- Supabase Schema for SafeNet MVP

-- Create the hazards table
CREATE TABLE hazards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    confirmations INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: For a true production app, you should enable Row Level Security (RLS).
-- For this hackathon MVP, if you enable RLS, you MUST run these policies to allow the public anonymous key to interact with the table:
--
-- ALTER TABLE hazards ENABLE ROW LEVEL SECURITY;
-- 
-- CREATE POLICY "Allow public select on active hazards" 
-- ON hazards FOR SELECT USING (status = 'active');
-- 
-- CREATE POLICY "Allow public insert" 
-- ON hazards FOR INSERT WITH CHECK (true);
-- 
-- CREATE POLICY "Allow public update of confirmations" 
-- ON hazards FOR UPDATE USING (true) WITH CHECK (true);
