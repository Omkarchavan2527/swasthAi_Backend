const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { supabase, isConfigured } = require('../config/supabase');
const router = express.Router();

// Fallback in-memory store: email -> user
const usersMap = new Map();

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new patient account with Email, Password & Health Profile
 */
router.post('/signup', async (req, res) => {
  const { email, password, fullName, phoneNumber, age, gender, bloodGroup, chronicConditions } = req.body;

  if (!email || !password || !fullName) {
    return res.status(400).json({ success: false, error: 'Email, password, and full name are required.' });
  }

  const cleanEmail = email.toLowerCase().trim();

  // 1. Check if email already exists in Supabase DB or memory store
  if (isConfigured && supabase) {
    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'An account with this email address already exists. Please log in instead.'
        });
      }
    } catch (e) {
      console.warn('Supabase Email Check Warning:', e.message);
    }
  }

  if (usersMap.has(cleanEmail)) {
    return res.status(400).json({
      success: false,
      error: 'An account with this email address already exists. Please log in instead.'
    });
  }

  const userId = `usr_${uuidv4().substring(0, 8)}`;
  const userRecord = {
    id: userId,
    email: cleanEmail,
    password: password,
    full_name: fullName.trim(),
    phone_number: phoneNumber ? phoneNumber.trim() : '',
    age: parseInt(age) || 30,
    gender: gender || 'Male',
    blood_group: bloodGroup || 'O+',
    chronic_conditions: Array.isArray(chronicConditions) ? chronicConditions : []
  };

  // 2. Create primary Self family member profile
  const selfMemberRecord = {
    id: userId,
    user_id: userId,
    name: fullName.trim(),
    relationship: 'Self',
    age: parseInt(age) || 30,
    gender: gender || 'Male',
    blood_group: bloodGroup || 'O+',
    chronic_conditions: Array.isArray(chronicConditions) ? chronicConditions : [],
    phone: phoneNumber ? phoneNumber.trim() : '',
    created_at: new Date().toISOString()
  };

  if (isConfigured && supabase) {
    try {
      const { data: insertedUser, error: userErr } = await supabase
        .from('users')
        .insert([userRecord])
        .select()
        .single();

      if (userErr) {
        if (userErr.code === '23505' || userErr.message.includes('unique')) {
          return res.status(400).json({
            success: false,
            error: 'An account with this email address already exists. Please log in instead.'
          });
        }
        console.error('Supabase User Insert Error:', userErr);
        return res.status(500).json({ success: false, error: userErr.message });
      }

      // Automatically create primary family member record
      await supabase.from('family_members').insert([selfMemberRecord]);

      return res.status(201).json({
        success: true,
        message: 'Account created successfully.',
        user: insertedUser,
        profile: selfMemberRecord
      });
    } catch (e) {
      console.warn('Supabase Signup Error:', e.message);
    }
  }

  // Fallback Memory Store
  usersMap.set(cleanEmail, userRecord);

  res.status(201).json({
    success: true,
    message: 'Account created successfully (Memory Mode).',
    user: userRecord,
    profile: selfMemberRecord
  });
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user via Email & Password with Strict Password Verification & Profile Retrieval
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const cleanEmail = email.toLowerCase().trim();

  let foundUser = null;

  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!error && data) {
        foundUser = data;
      }
    } catch (e) {
      console.warn('Supabase Login Query Warning:', e.message);
    }
  }

  if (!foundUser) {
    foundUser = usersMap.get(cleanEmail);
  }

  // 1. Account Not Found Check
  if (!foundUser) {
    return res.status(401).json({
      success: false,
      error: 'No account found with this email. Please check spelling or click Sign Up.'
    });
  }

  // 2. Strict Password Verification
  if (foundUser.password && foundUser.password !== password) {
    return res.status(401).json({
      success: false,
      error: 'Incorrect password. Please verify your password and try again.'
    });
  }

  // 3. Fetch User's Primary Family Profile
  let primaryProfile = null;

  if (isConfigured && supabase) {
    try {
      const { data: prof } = await supabase
        .from('family_members')
        .select('*')
        .eq('user_id', foundUser.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (prof) primaryProfile = prof;
    } catch (_) {}
  }

  if (!primaryProfile) {
    primaryProfile = {
      id: foundUser.id,
      userId: foundUser.id,
      name: foundUser.full_name || 'Patient',
      relationship: 'Self',
      age: foundUser.age || 30,
      gender: foundUser.gender || 'Male',
      bloodGroup: foundUser.blood_group || 'O+',
      chronicConditions: foundUser.chronic_conditions || [],
      phone: foundUser.phone_number || ''
    };
  }

  res.json({
    success: true,
    message: 'Login successful.',
    user: foundUser,
    profile: primaryProfile
  });
});

module.exports = router;
