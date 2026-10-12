const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { supabase, isConfigured } = require('../config/supabase');
const router = express.Router();

// Fallback in-memory stores
const medicinesStore = new Map(); // profileId -> Map<medId, med>
const scheduledDosesStore = new Map(); // profileId -> Array<dose>

/**
 * Format medicine object
 */
function formatMedicine(m) {
  return {
    id: m.id,
    profileId: m.profile_id || m.profileId,
    userId: m.user_id || m.userId,
    name: m.name,
    dosage: m.dosage || '1 tablet',
    frequency: m.frequency || 'Daily',
    scheduledTimes: Array.isArray(m.scheduled_times) ? m.scheduled_times : (Array.isArray(m.scheduledTimes) ? m.scheduledTimes : ['08:00']),
    startDate: m.start_date || m.startDate || new Date().toISOString().substring(0, 10),
    endDate: m.end_date || m.endDate || null,
    instructions: m.instructions || '',
    reminderEnabled: m.reminder_enabled !== undefined ? m.reminder_enabled : (m.reminderEnabled !== undefined ? m.reminderEnabled : true),
    reminderBeforeMinutes: parseInt(m.reminder_before_minutes || m.reminderBeforeMinutes) || 15,
    gracePeriodMinutes: parseInt(m.grace_period_minutes || m.gracePeriodMinutes) || 15,
    prescribedBy: m.prescribed_by || m.prescribedBy || null,
    createdAt: m.created_at || m.createdAt || new Date().toISOString()
  };
}

/**
 * Helper to generate scheduled dose records for today
 */
function generateDosesForToday(medicine) {
  const todayStr = new Date().toISOString().substring(0, 10);
  const times = medicine.scheduledTimes && medicine.scheduledTimes.length > 0 ? medicine.scheduledTimes : ['08:00'];
  const doses = [];

  times.forEach(t => {
    const timeClean = t.trim();
    const doseId = `dose_${medicine.id}_${todayStr}_${timeClean.replace(':', '')}`;

    // Construct ISO datetimes
    const [hh, mm] = timeClean.split(':').map(Number);
    const scheduledDt = new Date();
    scheduledDt.setHours(hh || 8, mm || 0, 0, 0);

    const remDt = new Date(scheduledDt.getTime() - (medicine.reminderBeforeMinutes || 15) * 60000);
    const escDt = new Date(scheduledDt.getTime() + (medicine.gracePeriodMinutes || 15) * 60000);

    doses.push({
      id: doseId,
      medicine_id: medicine.id,
      profile_id: medicine.profileId,
      user_id: medicine.userId,
      scheduled_date: todayStr,
      scheduled_time: timeClean,
      scheduled_datetime: scheduledDt.toISOString(),
      reminder_datetime: remDt.toISOString(),
      escalation_datetime: escDt.toISOString(),
      status: 'Pending',
      taken_at: null,
      escalated: false,
      escalated_at: null,
      created_at: new Date().toISOString()
    });
  });

  return doses;
}

/**
 * @route   GET /api/medicines/:profileId
 * @desc    Get all medicines belonging to a specific profile
 */
router.get('/:profileId', async (req, res) => {
  const { profileId } = req.params;

  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('medicines')
        .select('*')
        .or(`profile_id.eq.${profileId},user_id.eq.${profileId}`)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const formatted = data.map(formatMedicine);
        return res.json({ success: true, count: formatted.length, medicines: formatted });
      }
    } catch (e) {
      console.warn('Supabase medicines query warning:', e.message);
    }
  }

  const medMap = medicinesStore.get(profileId) || new Map();
  const list = Array.from(medMap.values()).map(formatMedicine);
  res.json({ success: true, count: list.length, medicines: list });
});

/**
 * @route   POST /api/medicines/add
 * @desc    Add a new medicine schedule for a profile
 */
router.post('/add', async (req, res) => {
  const {
    profileId,
    userId,
    name,
    dosage,
    frequency,
    scheduledTimes,
    startDate,
    endDate,
    instructions,
    reminderEnabled,
    reminderBeforeMinutes,
    gracePeriodMinutes,
    prescribedBy
  } = req.body;

  if (!profileId || !name) {
    return res.status(400).json({ success: false, error: 'profileId and medicine name are required.' });
  }

  const medicineId = `med_${uuidv4().substring(0, 8)}`;
  const cleanTimes = Array.isArray(scheduledTimes) && scheduledTimes.length > 0 ? scheduledTimes : ['08:00'];

  let actualUserId = userId || 'usr_default';

  // Resolve actual user_id from database if possible
  if (isConfigured && supabase) {
    try {
      // 1. Check if profileId is already in family_members
      const { data: member } = await supabase
        .from('family_members')
        .select('id, user_id')
        .eq('id', profileId)
        .maybeSingle();

      if (member && member.user_id) {
        actualUserId = member.user_id;
      } else {
        // 2. Check if profileId is directly a user in users table
        const { data: user } = await supabase
          .from('users')
          .select('id, full_name, age, gender, blood_group, chronic_conditions')
          .eq('id', profileId)
          .maybeSingle();

        if (user && user.id) {
          actualUserId = user.id;
          // Ensure family_members has a self record for this user
          await supabase.from('family_members').upsert([{
            id: user.id,
            user_id: user.id,
            name: user.full_name || 'Primary Patient',
            relationship: 'Self',
            age: user.age || 30,
            gender: user.gender || 'Male',
            blood_group: user.blood_group || 'O+',
            chronic_conditions: user.chronic_conditions || []
          }]);
        } else if (userId) {
          // Check if userId is valid in users
          const { data: uCheck } = await supabase
            .from('users')
            .select('id')
            .eq('id', userId)
            .maybeSingle();

          if (uCheck && uCheck.id) {
            actualUserId = uCheck.id;
            // Ensure family_members has an entry for profileId
            await supabase.from('family_members').upsert([{
              id: profileId,
              user_id: actualUserId,
              name: 'Family Member',
              relationship: 'Family',
              age: 25,
              gender: 'Other',
              blood_group: 'O+'
            }]);
          }
        }
      }
    } catch (e) {
      console.warn('Foreign key pre-check warning in medicines add:', e.message);
    }
  }

  const newMed = {
    id: medicineId,
    profile_id: profileId,
    user_id: actualUserId,
    name: name.trim(),
    dosage: dosage || '1 tablet',
    frequency: frequency || 'Daily',
    scheduled_times: cleanTimes,
    start_date: startDate || new Date().toISOString().substring(0, 10),
    end_date: endDate || null,
    instructions: instructions || '',
    reminder_enabled: reminderEnabled !== undefined ? Boolean(reminderEnabled) : true,
    reminder_before_minutes: parseInt(reminderBeforeMinutes) || 15,
    grace_period_minutes: parseInt(gracePeriodMinutes) || 15,
    prescribed_by: prescribedBy || null,
    created_at: new Date().toISOString()
  };

  const formattedMed = formatMedicine(newMed);
  const newDoses = generateDosesForToday(formattedMed);

  if (isConfigured && supabase) {
    try {
      const { data: medData, error: medErr } = await supabase
        .from('medicines')
        .insert([newMed])
        .select()
        .single();

      if (!medErr && medData) {
        if (newDoses.length > 0) {
          await supabase.from('scheduled_doses').insert(newDoses);
        }

        return res.status(201).json({
          success: true,
          message: 'Medicine and scheduled doses created.',
          medicine: formatMedicine(medData),
          doses: newDoses
        });
      }

      if (medErr) {
        console.warn('Supabase Medicine Insert Error:', medErr.message);
      }
    } catch (dbEx) {
      console.warn('Supabase Medicine Insert Exception:', dbEx.message);
    }
  }

  // Memory fallback
  const medMap = medicinesStore.get(profileId) || new Map();
  medMap.set(medicineId, newMed);
  medicinesStore.set(profileId, medMap);

  const existingDoses = scheduledDosesStore.get(profileId) || [];
  const updatedDoses = [...existingDoses, ...newDoses];
  scheduledDosesStore.set(profileId, updatedDoses);

  res.status(201).json({
    success: true,
    message: 'Medicine and scheduled doses created.',
    medicine: formattedMed,
    doses: newDoses
  });
});

/**
 * @route   GET /api/medicines/doses/:profileId
 * @desc    Get all scheduled doses for a profile for today with current statuses
 */
router.get('/doses/:profileId', async (req, res) => {
  const { profileId } = req.params;
  const todayStr = new Date().toISOString().substring(0, 10);
  const now = new Date();

  if (isConfigured && supabase) {
    const { data: doses, error } = await supabase
      .from('scheduled_doses')
      .select('*, medicines(name, dosage, instructions, reminder_before_minutes, grace_period_minutes)')
      .eq('profile_id', profileId)
      .eq('scheduled_date', todayStr)
      .order('scheduled_time', { ascending: true });

    if (!error && doses && doses.length > 0) {
      // Dynamic status recalculation
      const evaluated = doses.map(d => {
        let currentStatus = d.status;
        if (currentStatus !== 'Taken') {
          const schedTime = new Date(d.scheduled_datetime);
          const escTime = new Date(d.escalation_datetime);
          if (now > escTime) {
            currentStatus = 'Missed';
          } else if (now > schedTime) {
            currentStatus = 'Overdue';
          } else {
            currentStatus = 'Pending';
          }
        }
        return { ...d, status: currentStatus };
      });
      return res.json({ success: true, count: evaluated.length, doses: evaluated });
    }

    // Auto-generate today's doses from active medicines if not yet generated
    try {
      const { data: profileMeds } = await supabase
        .from('medicines')
        .select('*')
        .or(`profile_id.eq.${profileId},user_id.eq.${profileId}`);

      if (profileMeds && profileMeds.length > 0) {
        let allGenerated = [];
        for (const med of profileMeds) {
          const gen = generateDosesForToday(formatMedicine(med));
          allGenerated.push(...gen);
        }
        if (allGenerated.length > 0) {
          try {
            await supabase.from('scheduled_doses').insert(allGenerated);
          } catch (_) {}

          return res.json({
            success: true,
            count: allGenerated.length,
            doses: allGenerated.map(d => ({
              ...d,
              medicines: {
                name: d.medicine_name,
                dosage: d.dosage,
                instructions: d.instructions,
                reminder_before_minutes: 15,
                grace_period_minutes: 15
              }
            }))
          });
        }
      }
    } catch (_) {}
  }

  // Fallback memory check
  const doses = scheduledDosesStore.get(profileId) || [];
  let todayDoses = doses.filter(d => d.scheduled_date === todayStr);

  if (todayDoses.length === 0) {
    const medMap = medicinesStore.get(profileId) || new Map();
    for (const med of medMap.values()) {
      const gen = generateDosesForToday(formatMedicine(med));
      todayDoses.push(...gen);
    }
    scheduledDosesStore.set(profileId, todayDoses);
  }

  const evaluated = todayDoses.map(d => {
    let currentStatus = d.status;
    if (currentStatus !== 'Taken') {
      const schedTime = new Date(d.scheduled_datetime);
      const escTime = new Date(d.escalation_datetime);
      if (now > escTime) {
        currentStatus = 'Missed';
      } else if (now > schedTime) {
        currentStatus = 'Overdue';
      } else {
        currentStatus = 'Pending';
      }
    }
    return { ...d, status: currentStatus };
  });

  res.json({ success: true, count: evaluated.length, doses: evaluated });
});

/**
 * @route   POST /api/medicines/dose/take
 * @desc    Mark a specific scheduled dose as TAKEN with timestamp (atomic update)
 */
router.post('/dose/take', async (req, res) => {
  const { doseId, profileId } = req.body;

  if (!doseId) {
    return res.status(400).json({ success: false, error: 'doseId is required.' });
  }

  const takenAt = new Date().toISOString();

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('scheduled_doses')
      .update({
        status: 'Taken',
        taken_at: takenAt,
        escalated: false // Cancel any pending escalation
      })
      .eq('id', doseId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({
      success: true,
      message: 'Medicine dose marked as taken.',
      dose: data,
      takenAt
    });
  }

  // Fallback memory update
  if (profileId) {
    const doses = scheduledDosesStore.get(profileId) || [];
    const target = doses.find(d => d.id === doseId);
    if (target) {
      target.status = 'Taken';
      target.taken_at = takenAt;
      target.escalated = false;
      return res.json({
        success: true,
        message: 'Medicine dose marked as taken.',
        dose: target,
        takenAt
      });
    }
  }

  res.json({
    success: true,
    message: 'Medicine dose marked as taken.',
    dose: { id: doseId, status: 'Taken', taken_at: takenAt }
  });
});

/**
 * @route   DELETE /api/medicines/:profileId/:medicineId
 * @desc    Delete a medicine configuration
 */
router.delete('/:profileId/:medicineId', async (req, res) => {
  const { profileId, medicineId } = req.params;

  if (isConfigured && supabase) {
    await supabase.from('medicines').delete().eq('id', medicineId);
    await supabase.from('scheduled_doses').delete().eq('medicine_id', medicineId);
    return res.json({ success: true, message: 'Medicine deleted successfully.' });
  }

  const medMap = medicinesStore.get(profileId);
  if (medMap) {
    medMap.delete(medicineId);
  }

  res.json({ success: true, message: 'Medicine deleted successfully.' });
});

module.exports = router;
