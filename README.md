# 🚀 SwasthAI Backend REST API Server (with Supabase PostgreSQL & Storage)

A high-performance Node.js & Express REST API server for **SwasthAI** integrated with **Supabase Cloud PostgreSQL Database** & **Supabase Storage** for persistent data and medical file storage.

---

## 🗄️ Supabase PostgreSQL Setup Guide

### **Step 1: Get Supabase Credentials**
1. Log in to [supabase.com](https://supabase.com) and create a free project.
2. Go to **Project Settings** -> **API**.
3. Copy **Project URL** (`SUPABASE_URL`) and **anon / service_role API Key** (`SUPABASE_KEY`).

### **Step 2: Run Database & Storage Setup Script**
1. In your Supabase Dashboard, go to **SQL Editor**.
2. Open the [schema.sql](file:///c:/Users/admin/OneDrive/Desktop/swasthai_backend/schema.sql) file.
3. Paste and run the script. This creates:
   - `users` table
   - `family_members` table
   - `doctor_sessions` table
   - `prescriptions` table
   - `medical_records` table
   - `medical_records` Supabase Storage bucket for X-Rays, MRIs, and PDF reports.

### **Step 3: Add Environment Variables in Render.com**
On your Render Dashboard (Web Service -> Environment):
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=eyJhY...your-supabase-key
```

---

## 🌐 Complete REST API Endpoint Reference

### 1. **Authentication & Profile APIs** ([routes/auth.js](file:///c:/Users/admin/OneDrive/Desktop/swasthai_backend/routes/auth.js))
- **`POST /api/auth/signup`**: Registers patient in Supabase `users` table.
- **`POST /api/auth/login`**: Authenticates user via phone & OTP.

### 2. **Family Member Sync APIs** ([routes/family.js](file:///c:/Users/admin/OneDrive/Desktop/swasthai_backend/routes/family.js))
- **`GET /api/family/:userId`**: Returns family members from Supabase `family_members` table.
- **`POST /api/family/add`**: Inserts a new family member.

### 3. **Doctor Web Portal & Prescribing APIs** ([routes/doctor.js](file:///c:/Users/admin/OneDrive/Desktop/swasthai_backend/routes/doctor.js))
- **`POST /api/doctor/create-session`**: Generates 6-digit access OTP & token in Supabase `doctor_sessions` table.
- **`POST /api/doctor/verify-otp`**: Doctor Web Portal verifies OTP and unlocks patient history & AI summary.
- **`POST /api/doctor/prescribe`**: Doctor posts a new prescription directly to Supabase `prescriptions` table.

### 4. **Medical Records & Cloud File Upload APIs** ([routes/records.js](file:///c:/Users/admin/OneDrive/Desktop/swasthai_backend/routes/records.js))
- **`POST /api/records/upload`**: Uploads X-Ray / MRI / PDF report file to **Supabase Storage** bucket `medical_records` and saves metadata to Supabase `medical_records` table.
- **`GET /api/records/:patientId`**: Retrieves all medical records for a patient.

---

## 🛠️ Local Development

```bash
cd c:\Users\admin\OneDrive\Desktop\swasthai_backend
npm install
npm start
```
Server runs on **`http://localhost:5000`**.
