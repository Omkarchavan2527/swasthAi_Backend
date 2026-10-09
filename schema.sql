-- ========================================================
-- SwasthAI Supabase PostgreSQL Database Schema
-- Updated Production Schema for Multi-User Profile & Caretaker Architecture
-- ========================================================

-- 1. Users Table (Account Owners)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    email TEXT UNIQUE,
    password TEXT,
    age INT DEFAULT 25,
    gender TEXT DEFAULT 'Male',
    blood_group TEXT DEFAULT 'O+',
    chronic_conditions TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2. Family Members Table (Profiles)
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
    caretaker_id TEXT REFERENCES family_members(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    CONSTRAINT unique_user_family_member UNIQUE (user_id, name, relationship)
);

-- 3. Medicines Table (Profile-Specific)
CREATE TABLE IF NOT EXISTS medicines (
    id TEXT PRIMARY KEY,
    profile_id TEXT REFERENCES family_members(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dosage TEXT DEFAULT '1 tablet',
    frequency TEXT DEFAULT 'Daily',
    scheduled_times TEXT[] DEFAULT ARRAY['08:00'],
    start_date TEXT,
    end_date TEXT,
    instructions TEXT,
    reminder_enabled BOOLEAN DEFAULT TRUE,
    reminder_before_minutes INT DEFAULT 15,
    grace_period_minutes INT DEFAULT 15,
    prescribed_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 4. Scheduled Doses Table
CREATE TABLE IF NOT EXISTS scheduled_doses (
    id TEXT PRIMARY KEY,
    medicine_id TEXT REFERENCES medicines(id) ON DELETE CASCADE,
    profile_id TEXT REFERENCES family_members(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    scheduled_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    reminder_datetime TIMESTAMP WITH TIME ZONE,
    escalation_datetime TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'Pending', -- 'Pending', 'Taken', 'Overdue', 'Missed'
    taken_at TIMESTAMP WITH TIME ZONE,
    escalated BOOLEAN DEFAULT FALSE,
    escalated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 5. Caretaker Escalation Notifications Table
CREATE TABLE IF NOT EXISTS caretaker_notifications (
    id TEXT PRIMARY KEY,
    caretaker_profile_id TEXT REFERENCES family_members(id) ON DELETE CASCADE,
    patient_profile_id TEXT REFERENCES family_members(id) ON DELETE CASCADE,
    medicine_id TEXT REFERENCES medicines(id) ON DELETE CASCADE,
    dose_id TEXT REFERENCES scheduled_doses(id) ON DELETE CASCADE,
    patient_name TEXT NOT NULL,
    medicine_name TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'Unread',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 6. Secure Doctor Sharing Sessions Table
CREATE TABLE IF NOT EXISTS doctor_sharing_sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT REFERENCES family_members(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    otp TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    duration_minutes INT DEFAULT 120,
    categories JSONB NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    failed_attempts INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 7. Doctor Sharing Audit Logs Table
CREATE TABLE IF NOT EXISTS doctor_sharing_audit_logs (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES doctor_sharing_sessions(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'SESSION_CREATED', 'VERIFICATION_SUCCESS', 'VERIFICATION_FAILED', 'RECORDS_ACCESSED', 'PRESCRIPTION_ADDED', 'SESSION_REVOKED'
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 8. Prescriptions Table
CREATE TABLE IF NOT EXISTS prescriptions (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT DEFAULT '1 tablet',
    timing TEXT DEFAULT 'After Food',
    frequency TEXT DEFAULT 'Daily',
    instructions TEXT,
    prescribed_by TEXT DEFAULT 'Doctor',
    date TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 9. Medical Records Table
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

-- Storage Bucket Setup for Medical Records
INSERT INTO storage.buckets (id, name, public) 
VALUES ('medical_records', 'medical_records', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Medical Files Access" ON storage.objects
FOR ALL USING (bucket_id = 'medical_records');
