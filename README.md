# 🚀 SwasthAI Backend REST API Server

A lightweight, high-performance Node.js & Express REST API server for **SwasthAI** handling User Registration/Auth, Family Member Sync, Doctor OTP Access Verification, and Doctor Web Portal Prescribing.

---

## 📁 Backend Directory Structure

```
swasthai_backend/
├── package.json
├── server.js               # Main Express Server Entry
├── routes/
│   ├── auth.js             # User Signup, Login & Health Profile APIs
│   ├── family.js           # Family Member Sync & CRUD APIs
│   └── doctor.js           # Doctor OTP Access & Web Portal Prescribing APIs
└── README.md               # API Documentation & Deployment Guide
```

---

## 🌐 Complete REST API Endpoint Reference

### 1. **Authentication & Profile APIs**
- **`POST /api/auth/signup`**
  - **Body**: `{ "fullName": "Rajesh Patil", "phoneNumber": "9876543210", "email": "rajesh@example.com", "age": 45, "gender": "Male", "bloodGroup": "O+", "chronicConditions": ["Hypertension"] }`
  - **Description**: Registers new user and initializes primary health profile.
- **`POST /api/auth/login`**
  - **Body**: `{ "phoneNumber": "9876543210", "otp": "123456" }`
  - **Description**: Authenticates user via phone & OTP.
- **`GET /api/auth/profile/:id`**
  - **Description**: Retrieves patient user profile details.

### 2. **Family Member Sync APIs**
- **`GET /api/family/:userId`**
  - **Description**: Returns all family members for a specific patient.
- **`POST /api/family/add`**
  - **Body**: `{ "userId": "1", "name": "Sunita Patil", "age": 41, "gender": "Female", "relationship": "Spouse", "bloodGroup": "B+" }`
  - **Description**: Adds a new family member profile.
- **`DELETE /api/family/:userId/:memberId`**
  - **Description**: Deletes a family member profile.

### 3. **Doctor Web Portal & Prescribing APIs**
- **`POST /api/doctor/generate-otp`**
  - **Body**: `{ "userId": "1", "patientName": "Rajesh Patil", "durationMinutes": 60 }`
  - **Description**: Patient app generates a 6-digit access OTP with expiration timestamp.
- **`POST /api/doctor/verify-otp`**
  - **Body**: `{ "otp": "492810" }`
  - **Description**: Doctor Web Portal enters 6-digit OTP to unlock patient medical records.
- **`POST /api/doctor/prescribe`**
  - **Body**: `{ "userId": "1", "medicineName": "Amoxicillin", "dosage": "500mg", "timing": "After Lunch", "frequency": "Daily", "instructions": "Take twice daily after food", "doctorName": "Dr. Patil (MD)" }`
  - **Description**: Doctor prescribes new medicine directly into patient profile.
- **`GET /api/doctor/prescriptions/:userId`**
  - **Description**: Retrieves active prescriptions for patient.

---

## 🛠️ How to Run Locally

```bash
# 1. Navigate to backend directory
cd c:\Users\admin\OneDrive\Desktop\swasthai_backend

# 2. Install dependencies
npm install

# 3. Start backend server
npm start
```
Server runs on **`http://localhost:5000`**. Test health endpoint at **`http://localhost:5000/api/health`**.

---

## ☁️ How to Deploy to Free Cloud Servers

### **Option A: Render.com (Recommended Free Hosting)**
1. Create a free account at [render.com](https://render.com).
2. Click **New +** -> **Web Service** -> Connect your GitHub repository containing `swasthai_backend`.
3. Set **Start Command**: `node server.js`.
4. Render will generate a free HTTPS API URL: `https://swasthai-backend.onrender.com`.

### **Option B: Vercel**
1. Install Vercel CLI: `npm i -g vercel`.
2. Inside `swasthai_backend/`, run: `vercel`.

---

## 📱 Connecting Server API URL to Flutter App

In `swasthai_flutter/lib/services/cloud_sync_service.dart`, set your deployed API URL:
```dart
const String backendApiUrl = 'https://swasthai-backend.onrender.com/api';
```
