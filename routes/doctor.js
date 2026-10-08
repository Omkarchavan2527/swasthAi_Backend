const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Active Doctor Sessions Store (token -> session)
const activeSessionsByToken = new Map();
const activeSessionsByOtp = new Map();

// Prescriptions Store (patientId -> Array of medicines/prescriptions)
const patientMedicines = new Map();

// Medical Records Store (patientId -> Array of records)
const patientRecords = new Map();

// Seed initial Patil family demo data matching React Doctor Webpage
patientMedicines.set('fam_2', [
  { id: 'med_1', patientId: 'fam_2', name: 'Thyronorm 50mcg', dosage: '50mcg', timing: 'Empty Stomach Morning', frequency: 'Daily', instructions: 'Wait 30 mins before breakfast', prescribedBy: 'Dr. Deshmukh', date: '2024-01-10' },
  { id: 'med_2', patientId: 'fam_2', name: 'Folvite 5mg', dosage: '5mg', timing: 'After Lunch', frequency: 'Daily', instructions: 'Take with water', prescribedBy: 'Dr. Deshmukh', date: '2024-01-15' }
]);

patientMedicines.set('1', [
  { id: 'm1', patientId: '1', name: 'Metformin 500mg', dosage: '500mg', timing: 'After Breakfast', frequency: 'Daily', instructions: 'Take with food', prescribedBy: 'Dr. Patil (MD)', date: '2024-05-01' },
  { id: 'm2', patientId: '1', name: 'Amlodipine 5mg', dosage: '5mg', timing: 'After Dinner', frequency: 'Daily', instructions: 'Take before sleep', prescribedBy: 'Dr. Patil (MD)', date: '2024-05-01' }
]);

patientRecords.set('fam_2', [
  { id: 'rec_1', patientId: 'fam_2', title: 'Routine Antenatal Checkup & Ultrasound', type: 'Doctor Visit', date: '2024-03-12', details: 'Fetal growth normal, 24 weeks gestation.', doctorName: 'Dr. Deshmukh', hospitalName: 'Baramati Hospital' },
  { id: 'rec_2', patientId: 'fam_2', title: 'Complete Blood Count (CBC) & Hb', type: 'Lab Report', date: '2024-03-10', details: 'Hb: 11.5 g/dL (Normal)', doctorName: 'Dr. Deshmukh', hospitalName: 'Baramati Diagnostic' }
]);

// Seed default active session matching React Webpage demo OTP 482731 & 492810
const defaultSession = {
  id: 'sess_demo_1',
  token: 'doc_access_demo_123',
  otp: '482731',
  patientId: 'fam_2',
  patientName: 'Sunita Patil',
  createdByPhone: '9876543210',
  createdTime: new Date().toISOString(),
  expiresTime: new Date(Date.now() + 120 * 60000).toISOString(),
  durationMinutes: 120,
  categories: {
    medicalHistory: true,
    currentMedicines: true,
    allergies: true,
    prescriptions: true,
    labReports: true,
    vaccinationHistory: true,
    healthTrends: true,
    privateNotes: false
  },
  isRevoked: false
};
activeSessionsByToken.set(defaultSession.token, defaultSession);
activeSessionsByOtp.set(defaultSession.otp, defaultSession);

/**
 * @route   POST /api/doctor/create-session
 * @desc    Generate Doctor Access Token & 6-digit OTP (for family app)
 */
router.post('/create-session', (req, res) => {
  const { patientId, patientName, durationMinutes, categories } = req.body;

  const token = `doc_access_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const duration = parseInt(durationMinutes) || 120;
  const created = new Date();
  const expires = new Date(created.getTime() + duration * 60000);

  const session = {
    id: `sess_${Date.now()}`,
    token,
    otp,
    patientId: patientId || 'fam_2',
    patientName: patientName || 'Sunita Patil',
    createdByPhone: '9876543210',
    createdTime: created.toISOString(),
    expiresTime: expires.toISOString(),
    durationMinutes: duration,
    categories: categories || {
      medicalHistory: true,
      currentMedicines: true,
      allergies: true,
      prescriptions: true,
      labReports: true,
      vaccinationHistory: true,
      healthTrends: true,
      privateNotes: false
    },
    isRevoked: false
  };

  activeSessionsByToken.set(token, session);
  activeSessionsByOtp.set(otp, session);

  res.status(201).json({
    success: true,
    message: 'Doctor Access Session & QR Token created.',
    session
  });
});

/**
 * @route   POST /api/doctor/verify-otp
 * @desc    Doctor Webpage enters token & 6-digit OTP to unlock patient medical records
 */
router.post('/verify-otp', (req, res) => {
  const { token, otp } = req.body;

  let session = null;

  if (token) {
    session = activeSessionsByToken.get(token.trim());
  }

  if (!session && otp) {
    session = activeSessionsByOtp.get(otp.trim());
  }

  // Fallback demo matching React Webpage (OTP: 482731 or 492810)
  if (!session && (otp === '482731' || otp === '492810')) {
    session = defaultSession;
  }

  if (!session) {
    return res.status(401).json({ success: false, error: 'Invalid or non-existent access session.' });
  }

  if (session.isRevoked) {
    return res.status(403).json({ success: false, error: 'Access revoked. This medical record sharing session has been invalidated by the family.' });
  }

  if (new Date() > new Date(session.expiresTime)) {
    return res.status(403).json({ success: false, error: 'Access Expired. This medical record sharing session has expired.' });
  }

  const patientId = session.patientId;
  const records = patientRecords.get(patientId) || [];
  const medicines = patientMedicines.get(patientId) || [];

  const totalCount = records.length + medicines.length;
  const aiSummary = `Based on the ${totalCount} authorized records shared: Patient ${session.patientName} has ${records.length} documented clinical visits and ${medicines.length} active daily prescriptions.`;

  res.json({
    success: true,
    message: 'Verification successful. Patient record access granted.',
    session,
    sharedData: {
      patient: {
        id: session.patientId,
        name: session.patientName,
        age: 41,
        gender: 'Female',
        bloodGroup: 'B+',
        allergies: ['Penicillin']
      },
      records,
      medicines,
      aiSummary,
      totalCount
    }
  });
});

/**
 * @route   POST /api/doctor/prescribe
 * @desc    Doctor posts & prescribes a new medicine directly to patient's medical profile
 */
router.post('/prescribe', (req, res) => {
  const { patientId, medicineName, dosage, timing, frequency, instructions, doctorName } = req.body;

  if (!patientId || !medicineName) {
    return res.status(400).json({ success: false, error: 'patientId and medicineName are required.' });
  }

  const newPrescription = {
    id: `med_${uuidv4().substring(0, 8)}`,
    patientId,
    name: medicineName,
    dosage: dosage || '1 tablet',
    timing: timing || 'After Food',
    frequency: frequency || 'Daily',
    instructions: instructions || 'Prescribed via Doctor Web Portal',
    prescribedBy: doctorName || 'Dr. Deshmukh',
    date: new Date().toISOString().substring(0, 10),
    takenToday: false
  };

  const list = patientMedicines.get(patientId) || [];
  list.unshift(newPrescription);
  patientMedicines.set(patientId, list);

  res.status(201).json({
    success: true,
    message: `Prescription for ${medicineName} successfully pushed to patient's account.`,
    prescription: newPrescription
  });
});

/**
 * @route   POST /api/doctor/revoke
 * @desc    Revoke doctor access session
 */
router.post('/revoke', (req, res) => {
  const { sessionId, token } = req.body;

  for (const [t, sess] of activeSessionsByToken.entries()) {
    if (sess.id === sessionId || t === token) {
      sess.isRevoked = true;
      res.json({ success: true, message: 'Access session revoked.' });
      return;
    }
  }

  res.status(404).json({ success: false, error: 'Session not found.' });
});

module.exports = router;
