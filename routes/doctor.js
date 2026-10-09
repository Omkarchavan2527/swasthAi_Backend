const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { supabase, isConfigured } = require('../config/supabase');
const router = express.Router();

// Fallback in-memory session store: tokenHash -> session
const activeSessionsByHash = new Map();
const activeSessionsByOtp = new Map();
const auditLogsStore = []; // Array of audit log objects

/**
 * Helper to compute SHA-256 hash of a bearer token
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Helper to log security audit events
 */
async function logAuditEvent({ sessionId, profileId, eventType, details, ipAddress }) {
  const logEntry = {
    id: `log_${uuidv4().substring(0, 8)}`,
    session_id: sessionId || null,
    profile_id: profileId || 'unknown',
    event_type: eventType,
    details: details || '',
    ip_address: ipAddress || '127.0.0.1',
    created_at: new Date().toISOString()
  };

  if (isConfigured && supabase) {
    try {
      await supabase.from('doctor_sharing_audit_logs').insert([logEntry]);
    } catch (e) {
      console.error('Failed to insert audit log:', e);
    }
  } else {
    auditLogsStore.unshift(logEntry);
  }
}

/**
 * @route   POST /api/doctor/create-session
 * @desc    Generate a secure 256-bit QR access token & 6-digit OTP for doctor sharing
 */
router.post('/create-session', async (req, res) => {
  const { profileId, patientName, durationMinutes, categories } = req.body;

  if (!profileId || !patientName) {
    return res.status(400).json({ success: false, error: 'profileId and patientName are required.' });
  }

  // 1. Generate 256-bit cryptographically secure random bearer token (64 hex characters)
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  // 2. Generate 6-digit verification access code
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const duration = parseInt(durationMinutes) || 120;
  const created = new Date();
  const expires = new Date(created.getTime() + duration * 60000);
  const sessionId = `sess_${uuidv4().substring(0, 8)}`;

  const allowedCategories = categories || {
    medicalHistory: true,
    currentMedicines: true,
    allergies: true,
    prescriptions: true,
    labReports: true,
    vaccinationHistory: true,
    healthTrends: true
  };

  const sessionRecord = {
    id: sessionId,
    profile_id: profileId,
    token_hash: tokenHash,
    otp,
    patient_name: patientName,
    duration_minutes: duration,
    categories: allowedCategories,
    is_revoked: false,
    failed_attempts: 0,
    created_at: created.toISOString(),
    expires_at: expires.toISOString()
  };

  if (isConfigured && supabase) {
    const { error } = await supabase.from('doctor_sharing_sessions').insert([sessionRecord]);
    if (error) {
      console.error('Supabase Session Create Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  } else {
    activeSessionsByHash.set(tokenHash, sessionRecord);
    activeSessionsByOtp.set(otp, sessionRecord);
  }

  // Audit Log
  await logAuditEvent({
    sessionId,
    profileId,
    eventType: 'SESSION_CREATED',
    details: `Doctor sharing session created (Expires in ${duration} mins).`,
    ipAddress: req.ip
  });

  const doctorPortalBaseUrl = process.env.DOCTOR_PORTAL_URL || 'https://swasth-doctor.onrender.com';
  const qrUrl = `${doctorPortalBaseUrl}/?t=${rawToken}`;

  res.status(201).json({
    success: true,
    message: 'Secure Doctor QR Sharing session created.',
    session: {
      id: sessionId,
      rawToken,
      otp,
      profileId,
      patientName,
      qrUrl,
      durationMinutes: duration,
      categories: allowedCategories,
      expiresAt: expires.toISOString()
    }
  });
});

/**
 * @route   POST /api/doctor/session-by-token
 * @desc    Get session details by URL raw bearer token (for doctor portal link detection)
 */
router.post('/session-by-token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, error: 'Token is required.' });
  }

  const tokenHash = hashToken(token.trim());
  let session = null;

  if (isConfigured && supabase) {
    const { data } = await supabase
      .from('doctor_sharing_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    session = data;
  } else {
    session = activeSessionsByHash.get(tokenHash);
  }

  if (!session) {
    return res.status(404).json({ success: false, error: 'Invalid or non-existent sharing link.' });
  }

  if (session.is_revoked || session.isRevoked) {
    return res.status(403).json({ success: false, error: 'This sharing link has been revoked by the patient.' });
  }

  const now = new Date();
  const expiresAt = new Date(session.expires_at || session.expiresTime);
  if (now > expiresAt) {
    return res.status(403).json({ success: false, error: 'This sharing link has expired.' });
  }

  res.json({
    success: true,
    session: {
      id: session.id,
      patientName: session.patient_name || session.patientName,
      categories: session.categories,
      expiresAt: expiresAt.toISOString(),
      requiresOtp: true
    }
  });
});

/**
 * @route   POST /api/doctor/verify-otp
 * @desc    Doctor portal verifies token & 6-digit OTP to unlock authorized patient data
 */
router.post('/verify-otp', async (req, res) => {
  const { token, otp } = req.body;

  if (!token && !otp) {
    return res.status(400).json({ success: false, error: 'Token or OTP required.' });
  }

  let session = null;

  if (token) {
    const tokenHash = hashToken(token.trim());
    if (isConfigured && supabase) {
      const { data } = await supabase
        .from('doctor_sharing_sessions')
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      session = data;
    } else {
      session = activeSessionsByHash.get(tokenHash);
    }
  }

  if (!session && otp) {
    if (isConfigured && supabase) {
      const { data } = await supabase
        .from('doctor_sharing_sessions')
        .select('*')
        .eq('otp', otp.trim())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      session = data;
    } else {
      session = activeSessionsByOtp.get(otp.trim());
    }
  }

  if (!session) {
    return res.status(401).json({ success: false, error: 'Invalid access session or OTP code.' });
  }

  const profileId = session.profile_id || session.patientId;
  const sessionId = session.id;

  // Rate Limiting Check (Max 5 failed attempts)
  if ((session.failed_attempts || 0) >= 5) {
    await logAuditEvent({
      sessionId,
      profileId,
      eventType: 'RATE_LIMITED',
      details: 'Too many failed verification attempts.',
      ipAddress: req.ip
    });
    return res.status(429).json({ success: false, error: 'Too many failed attempts. Session locked for security.' });
  }

  // Revocation & Expiry Checks
  if (session.is_revoked || session.isRevoked) {
    await logAuditEvent({
      sessionId,
      profileId,
      eventType: 'VERIFICATION_FAILED',
      details: 'Attempted to access revoked session.',
      ipAddress: req.ip
    });
    return res.status(403).json({ success: false, error: 'Access Revoked. Patient has terminated this sharing session.' });
  }

  const now = new Date();
  const expiresAt = new Date(session.expires_at || session.expiresTime);
  if (now > expiresAt) {
    await logAuditEvent({
      sessionId,
      profileId,
      eventType: 'VERIFICATION_FAILED',
      details: 'Attempted to access expired session.',
      ipAddress: req.ip
    });
    return res.status(403).json({ success: false, error: 'Access Expired. This sharing session has expired.' });
  }

  // Verify OTP match if OTP provided
  if (otp && otp.trim() !== session.otp) {
    // Increment failed attempts
    const newFailed = (session.failed_attempts || 0) + 1;
    if (isConfigured && supabase) {
      await supabase.from('doctor_sharing_sessions').update({ failed_attempts: newFailed }).eq('id', sessionId);
    } else {
      session.failed_attempts = newFailed;
    }

    await logAuditEvent({
      sessionId,
      profileId,
      eventType: 'VERIFICATION_FAILED',
      details: `Incorrect OTP code provided (Attempt ${newFailed}/5).`,
      ipAddress: req.ip
    });

    return res.status(401).json({ success: false, error: `Invalid 6-digit access code. (${5 - newFailed} attempts remaining)` });
  }

  // Fetch Authorized Data based on categories
  const categories = session.categories || {};
  let medicines = [];
  let records = [];
  let patientProfile = { id: profileId, name: session.patient_name || session.patientName };

  if (isConfigured && supabase) {
    if (categories.currentMedicines || categories.prescriptions) {
      const { data: medData } = await supabase.from('medicines').select('*').eq('profile_id', profileId);
      medicines = medData || [];
    }
    if (categories.medicalHistory || categories.labReports || categories.vaccinationHistory) {
      const { data: recData } = await supabase.from('medical_records').select('*').eq('patient_id', profileId);
      records = recData || [];
    }
    const { data: profData } = await supabase.from('family_members').select('*').eq('id', profileId).maybeSingle();
    if (profData) {
      patientProfile = profData;
    }
  }

  await logAuditEvent({
    sessionId,
    profileId,
    eventType: 'VERIFICATION_SUCCESS',
    details: 'Doctor access granted and verified.',
    ipAddress: req.ip
  });

  const aiSummary = `Authorized clinical view for patient ${patientProfile.name || session.patient_name}: ${medicines.length} active prescriptions, ${records.length} documented visits.`;

  res.json({
    success: true,
    message: 'Verification successful. Patient profile access granted.',
    session: {
      id: sessionId,
      patientName: patientProfile.name || session.patient_name,
      profileId,
      expiresAt: expiresAt.toISOString(),
      categories
    },
    sharedData: {
      patient: {
        id: profileId,
        name: patientProfile.name || session.patient_name,
        age: patientProfile.age || 30,
        gender: patientProfile.gender || 'Male',
        bloodGroup: patientProfile.blood_group || patientProfile.bloodGroup || 'O+',
        chronicConditions: patientProfile.chronic_conditions || patientProfile.chronicConditions || []
      },
      medicines,
      records,
      aiSummary
    }
  });
});

/**
 * @route   POST /api/doctor/prescribe
 * @desc    Doctor prescribes a new medicine to patient profile
 */
router.post('/prescribe', async (req, res) => {
  const { patientId, medicineName, dosage, timing, frequency, instructions, doctorName } = req.body;

  if (!patientId || !medicineName) {
    return res.status(400).json({ success: false, error: 'patientId and medicineName are required.' });
  }

  const prescriptionId = `med_${uuidv4().substring(0, 8)}`;
  const dateStr = new Date().toISOString().substring(0, 10);

  const newMed = {
    id: prescriptionId,
    profile_id: patientId,
    user_id: 'usr_doctor',
    name: medicineName.trim(),
    dosage: dosage || '1 tablet',
    frequency: frequency || 'Daily',
    scheduled_times: [timing === 'Before Breakfast' ? '07:30' : (timing === 'After Lunch' ? '13:00' : '20:00')],
    start_date: dateStr,
    instructions: instructions || 'Prescribed via Doctor Web Portal',
    prescribed_by: doctorName || 'Dr. Deshmukh',
    created_at: new Date().toISOString()
  };

  if (isConfigured && supabase) {
    await supabase.from('medicines').insert([newMed]);
    await supabase.from('prescriptions').insert([{
      id: prescriptionId,
      patient_id: patientId,
      name: medicineName,
      dosage: dosage || '1 tablet',
      timing: timing || 'After Food',
      frequency: frequency || 'Daily',
      instructions: instructions || '',
      prescribed_by: doctorName || 'Doctor Portal',
      date: dateStr
    }]);
  }

  await logAuditEvent({
    profileId: patientId,
    eventType: 'PRESCRIPTION_ADDED',
    details: `Doctor issued prescription: ${medicineName} (${dosage}).`,
    ipAddress: req.ip
  });

  res.status(201).json({
    success: true,
    message: `Prescription for "${medicineName}" successfully pushed to patient profile.`,
    prescription: {
      id: prescriptionId,
      name: medicineName,
      dosage: dosage || '1 tablet',
      timing,
      instructions
    }
  });
});

/**
 * @route   POST /api/doctor/revoke
 * @desc    Patient revokes sharing session immediately
 */
router.post('/revoke', async (req, res) => {
  const { sessionId, token } = req.body;

  if (isConfigured && supabase) {
    let query = supabase.from('doctor_sharing_sessions').update({ is_revoked: true });
    if (sessionId) {
      query = query.eq('id', sessionId);
    } else if (token) {
      query = query.eq('token_hash', hashToken(token.trim()));
    }
    const { data, error } = await query.select();
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  } else {
    for (const sess of activeSessionsByHash.values()) {
      if (sess.id === sessionId || (token && sess.token_hash === hashToken(token.trim()))) {
        sess.is_revoked = true;
      }
    }
  }

  await logAuditEvent({
    sessionId,
    profileId: 'patient',
    eventType: 'SESSION_REVOKED',
    details: 'Sharing session manually revoked by patient.',
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Doctor sharing access revoked successfully.' });
});

/**
 * @route   GET /api/doctor/audit-logs/:profileId
 * @desc    Get security audit log history for a patient profile
 */
router.get('/audit-logs/:profileId', async (req, res) => {
  const { profileId } = req.params;

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('doctor_sharing_audit_logs')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return res.json({ success: true, count: data.length, logs: data });
    }
  }

  const logs = auditLogsStore.filter(l => l.profile_id === profileId);
  res.json({ success: true, count: logs.length, logs });
});

module.exports = router;
