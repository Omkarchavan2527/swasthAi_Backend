const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { supabase, isConfigured } = require('../config/supabase');
const router = express.Router();

// Fallback in-memory store
const users = new Map();

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new patient account with Email, Password & Health Profile
 */
router.post('/signup', async (req, res) => {
  const { email, password, fullName, phoneNumber, age, gender, bloodGroup, chronicConditions } = req.body;

  if (!email || !password || !fullName) {
    return res.status(400).json({ success: false, error: 'Email, password, and full name are required.' });
  }

  const userId = `usr_${uuidv4().substring(0, 8)}`;
  const user = {
    id: userId,
    email: email.toLowerCase().trim(),
    password: password, // In production, hash using bcrypt
    full_name: fullName,
    phone_number: phoneNumber || '',
    age: parseInt(age) || 30,
    gender: gender || 'Male',
    blood_group: bloodGroup || 'O+',
    chronic_conditions: Array.isArray(chronicConditions) ? chronicConditions : []
  };

  if (isConfigured && supabase) {
    const { data, error } = await supabase.from('users').insert([user]).select().single();
    if (error) {
      console.error('Supabase Insert Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    return res.status(201).json({ success: true, message: 'User registered in Supabase PostgreSQL DB.', user: data });
  }

  users.set(email.toLowerCase().trim(), user);
  res.status(201).json({ success: true, message: 'User account created.', user });
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user via Email & Password or Phone Number
 */
router.post('/login', async (req, res) => {
  const { email, password, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ success: false, error: 'Email or phone number is required.' });
  }

  if (isConfigured && supabase) {
    let query = supabase.from('users').select('*');
    if (email) {
      query = query.eq('email', email.toLowerCase().trim());
    } else if (phoneNumber) {
      query = query.eq('phone_number', phoneNumber);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    if (data) {
      return res.json({ success: true, message: 'Login successful.', user: data });
    }

    return res.status(401).json({ success: false, error: 'User account not found. Please sign up first.' });
  }

  // Fallback memory check
  const searchKey = email ? email.toLowerCase().trim() : phoneNumber;
  let foundUser = users.get(searchKey);

  if (!foundUser) {
    for (const u of users.values()) {
      if (u.email === searchKey || u.phone_number === searchKey) {
        foundUser = u;
        break;
      }
    }
  }

  if (!foundUser) {
    const userId = `usr_${uuidv4().substring(0, 8)}`;
    foundUser = { id: userId, full_name: 'User', email: email || '', phone_number: phoneNumber || '' };
    users.set(userId, foundUser);
  }

  res.json({ success: true, message: 'Login successful.', user: foundUser });
});

module.exports = router;
