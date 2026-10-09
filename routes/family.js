const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { supabase, isConfigured } = require('../config/supabase');
const router = express.Router();

// Local fallback store: userId -> Map<memberId, member>
const familyMembersStore = new Map();

/**
 * Helper to normalize family member object
 */
function formatMember(m) {
  return {
    id: m.id,
    userId: m.user_id || m.userId,
    name: m.name,
    age: parseInt(m.age) || 25,
    gender: m.gender || 'Male',
    relationship: m.relationship || 'Family',
    bloodGroup: m.blood_group || m.bloodGroup || 'O+',
    chronicConditions: Array.isArray(m.chronic_conditions) ? m.chronic_conditions : (Array.isArray(m.chronicConditions) ? m.chronicConditions : []),
    phone: m.phone || '',
    caretakerId: m.caretaker_id || m.caretakerId || null,
    createdAt: m.created_at || m.createdAt || new Date().toISOString()
  };
}

/**
 * @route   GET /api/family/:userId
 * @desc    Fetch all family member profiles for a specific user
 */
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('family_members')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      const formatted = data.map(formatMember);
      return res.json({ success: true, count: formatted.length, members: formatted });
    }
  }

  // Fallback memory check
  const userMap = familyMembersStore.get(userId) || new Map();
  const members = Array.from(userMap.values()).map(formatMember);
  res.json({ success: true, count: members.length, members });
});

/**
 * @route   POST /api/family/add
 * @desc    Add a new family member profile (with duplicate prevention)
 */
router.post('/add', async (req, res) => {
  const { userId, name, age, gender, relationship, bloodGroup, chronicConditions, phone, caretakerId } = req.body;

  if (!userId || !name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'UserId and profile name are required.' });
  }

  const cleanName = name.trim();
  const cleanRel = (relationship || 'Family').trim();

  // Deduplication check: Check if exact member with same name & relationship already exists for this user
  if (isConfigured && supabase) {
    const { data: existing } = await supabase
      .from('family_members')
      .select('*')
      .eq('user_id', userId)
      .ilike('name', cleanName)
      .eq('relationship', cleanRel)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Profile already exists. Using existing record.',
        member: formatMember(existing)
      });
    }
  } else {
    const userMap = familyMembersStore.get(userId) || new Map();
    for (const m of userMap.values()) {
      if (m.name.toLowerCase() === cleanName.toLowerCase() && m.relationship === cleanRel) {
        return res.status(200).json({
          success: true,
          message: 'Profile already exists. Using existing record.',
          member: formatMember(m)
        });
      }
    }
  }

  const memberId = `mem_${uuidv4().substring(0, 8)}`;
  const newMember = {
    id: memberId,
    user_id: userId,
    name: cleanName,
    relationship: cleanRel,
    age: parseInt(age) || 25,
    gender: gender || 'Male',
    blood_group: bloodGroup || 'O+',
    chronic_conditions: Array.isArray(chronicConditions) ? chronicConditions : [],
    phone: phone || '',
    caretaker_id: caretakerId || null,
    created_at: new Date().toISOString()
  };

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('family_members')
      .insert([newMember])
      .select()
      .single();

    if (error) {
      console.error('Supabase Family Insert Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(201).json({
      success: true,
      message: 'Family member profile created successfully.',
      member: formatMember(data)
    });
  }

  const userMap = familyMembersStore.get(userId) || new Map();
  userMap.set(memberId, newMember);
  familyMembersStore.set(userId, userMap);

  res.status(201).json({
    success: true,
    message: 'Family member profile created successfully.',
    member: formatMember(newMember)
  });
});

/**
 * @route   PUT /api/family/update/:memberId
 * @desc    Update existing family member profile
 */
router.put('/update/:memberId', async (req, res) => {
  const { memberId } = req.params;
  const { userId, name, age, gender, relationship, bloodGroup, chronicConditions, phone, caretakerId } = req.body;

  const updates = {
    name,
    age: age ? parseInt(age) : undefined,
    gender,
    relationship,
    blood_group: bloodGroup,
    chronic_conditions: Array.isArray(chronicConditions) ? chronicConditions : undefined,
    phone,
    caretaker_id: caretakerId
  };

  // Remove undefined properties
  Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('family_members')
      .update(updates)
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, message: 'Profile updated.', member: formatMember(data) });
  }

  if (userId) {
    const userMap = familyMembersStore.get(userId);
    if (userMap && userMap.has(memberId)) {
      const existing = userMap.get(memberId);
      const updated = { ...existing, ...updates };
      userMap.set(memberId, updated);
      return res.json({ success: true, message: 'Profile updated.', member: formatMember(updated) });
    }
  }

  res.status(404).json({ success: false, error: 'Profile not found.' });
});

/**
 * @route   POST /api/family/assign-caretaker
 * @desc    Designate another family profile as caretaker
 */
router.post('/assign-caretaker', async (req, res) => {
  const { patientProfileId, caretakerProfileId, userId } = req.body;

  if (!patientProfileId) {
    return res.status(400).json({ success: false, error: 'patientProfileId is required.' });
  }

  if (patientProfileId === caretakerProfileId) {
    return res.status(400).json({ success: false, error: 'A profile cannot be assigned as its own caretaker.' });
  }

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('family_members')
      .update({ caretaker_id: caretakerProfileId || null })
      .eq('id', patientProfileId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({
      success: true,
      message: caretakerProfileId ? 'Caretaker assigned successfully.' : 'Caretaker removed.',
      member: formatMember(data)
    });
  }

  if (userId) {
    const userMap = familyMembersStore.get(userId);
    if (userMap && userMap.has(patientProfileId)) {
      const existing = userMap.get(patientProfileId);
      existing.caretaker_id = caretakerProfileId || null;
      userMap.set(patientProfileId, existing);
      return res.json({
        success: true,
        message: caretakerProfileId ? 'Caretaker assigned successfully.' : 'Caretaker removed.',
        member: formatMember(existing)
      });
    }
  }

  res.json({ success: true, message: 'Caretaker updated.' });
});

/**
 * @route   DELETE /api/family/:userId/:memberId
 * @desc    Delete a family member profile
 */
router.delete('/:userId/:memberId', async (req, res) => {
  const { userId, memberId } = req.params;

  if (isConfigured && supabase) {
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('id', memberId)
      .eq('user_id', userId);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, message: 'Family member profile deleted.' });
  }

  const userMap = familyMembersStore.get(userId);
  if (userMap) {
    userMap.delete(memberId);
  }

  res.json({ success: true, message: 'Family member profile deleted.' });
});

module.exports = router;
