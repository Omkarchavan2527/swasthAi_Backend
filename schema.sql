-- ========================================================
-- SwasthAI Supabase PostgreSQL Database Schema
-- Copy and paste this script into your Supabase SQL Editor
-- ========================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    email TEXT,
    age INT DEFAULT 25,
    gender TEXT DEFAULT 'Male',
    blood_group TEXT DEFAULT 'O+',
    chronic_conditions TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2. Family Members Table
CREATE TABLE IF NOT EXISTS family_members (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    age INT DEFAULT 25,
    gender TEXT DEFAULT 'Male',
    blood_group TEXT DEFAULT 'O+',
    chronic_conditions TEXT[],
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3. Doctor Sessions Table
CREATE TABLE IF NOT EXISTS doctor_sessions (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    otp TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    duration_minutes INT DEFAULT 120,
    categories JSONB,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 4. Prescriptions Table
CREATE TABLE IF NOT EXISTS prescriptions (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT DEFAULT '1 tablet',
    timing TEXT DEFAULT 'After Food',
    frequency TEXT DEFAULT 'Daily',
    instructions TEXT,
    prescribed_by TEXT DEFAULT 'Dr. Deshmukh',
    date TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 5. Medical Records Table
CREATE TABLE IF NOT EXISTS medical_records (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'Doctor Visit',
    date TEXT NOT NULL,
    details TEXT,
    file_url TEXT,
    doctor_name TEXT,
    hospital_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create Storage Bucket for Medical Files (X-Rays, MRIs, PDFs)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('medical_records', 'medical_records', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy allowing Public Access for Medical Files
CREATE POLICY "Public Medical Files Access" ON storage.objects
FOR ALL USING (bucket_id = 'medical_records');
