const express = require('express');
const { supabase, isConfigured } = require('../config/supabase');
const router = express.Router();

// Fallback in-memory notification store: caretakerProfileId -> Array<notification>
const caretakerNotificationsStore = new Map();

/**
 * @route   GET /api/caretaker/dashboard/:caretakerProfileId
 * @desc    Fetch caretaker dashboard showing all assigned patient profiles & medicine status
 */
router.get('/dashboard/:caretakerProfileId', async (req, res) => {
  const { caretakerProfileId } = req.params;
  const todayStr = new Date().toISOString().substring(0, 10);
  const now = new Date();

  if (isConfigured && supabase) {
    // Find all family profiles where caretaker_id == caretakerProfileId
    const { data: patients, error: patientErr } = await supabase
      .from('family_members')
      .select('*')
      .eq('caretaker_id', caretakerProfileId);

    if (patientErr) {
      return res.status(500).json({ success: false, error: patientErr.message });
    }

    const patientSummaries = [];

    for (const patient of patients || []) {
      // Get today's doses for patient
      const { data: doses } = await supabase
        .from('scheduled_doses')
        .select('*, medicines(name, dosage, instructions)')
        .eq('profile_id', patient.id)
        .eq('scheduled_date', todayStr)
        .order('scheduled_time', { ascending: true });

      const evaluatedDoses = (doses || []).map(d => {
        let status = d.status;
        if (status !== 'Taken') {
          const escTime = new Date(d.escalation_datetime);
          const schedTime = new Date(d.scheduled_datetime);
          if (now > escTime) status = 'Missed';
          else if (now > schedTime) status = 'Overdue';
          else status = 'Pending';
        }
        return {
          id: d.id,
          medicineName: d.medicines ? d.medicines.name : 'Medicine',
          dosage: d.medicines ? d.medicines.dosage : '1 tablet',
          scheduledTime: d.scheduled_time,
          status,
          takenAt: d.taken_at,
          escalated: d.escalated
        };
      });

      patientSummaries.push({
        patientProfileId: patient.id,
        patientName: patient.name,
        relationship: patient.relationship,
        age: patient.age,
        gender: patient.gender,
        bloodGroup: patient.blood_group,
        doses: evaluatedDoses,
        pendingCount: evaluatedDoses.filter(d => d.status === 'Pending').length,
        takenCount: evaluatedDoses.filter(d => d.status === 'Taken').length,
        overdueCount: evaluatedDoses.filter(d => d.status === 'Overdue').length,
        missedCount: evaluatedDoses.filter(d => d.status === 'Missed').length
      });
    }

    // Get notifications
    const { data: notifications } = await supabase
      .from('caretaker_notifications')
      .select('*')
      .eq('caretaker_profile_id', caretakerProfileId)
      .order('created_at', { ascending: false });

    return res.json({
      success: true,
      caretakerProfileId,
      assignedPatientsCount: patientSummaries.length,
      patients: patientSummaries,
      notifications: notifications || []
    });
  }

  // Memory fallback
  const notifs = caretakerNotificationsStore.get(caretakerProfileId) || [];
  res.json({
    success: true,
    caretakerProfileId,
    assignedPatientsCount: 0,
    patients: [],
    notifications: notifs
  });
});

/**
 * @route   GET /api/caretaker/notifications/:caretakerProfileId
 * @desc    Fetch unread escalation notifications for a caretaker
 */
router.get('/notifications/:caretakerProfileId', async (req, res) => {
  const { caretakerProfileId } = req.params;

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('caretaker_notifications')
      .select('*')
      .eq('caretaker_profile_id', caretakerProfileId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return res.json({ success: true, count: data.length, notifications: data });
    }
  }

  const notifs = caretakerNotificationsStore.get(caretakerProfileId) || [];
  res.json({ success: true, count: notifs.length, notifications: notifs });
});

module.exports = router;
