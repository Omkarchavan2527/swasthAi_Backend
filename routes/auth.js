const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// In-memory data store (Replace with MongoDB/PostgreSQL connection)
const users = new Map();

// Default demo user
users.set('1', {
  id: '1',
  fullName: 'Rajesh Patil',
  phoneNumber: '9876543210',
  email: 'rajesh@example.com',
  age: 45,
  gender: 'Male',
  bloodGroup: 'O+',
  chronicConditions: ['Hypertension', 'Diabetes'],
  createdAt: new Date().toISOString()
});

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new patient account & primary profile
 */
router.post('/signup', (req, res) => {
  const { fullName, phoneNumber, email, age, gender, bloodGroup, chronicConditions } = req.body;

  if (!fullName || !phoneNumber) {
    return res.status(400).json({ success: false, error: 'Full name and phone number are required.' });
  }

  const userId = `usr_${uuidv4().substring(0, 8)}`;
  const user = {
    id: userId,
    fullName,
    phoneNumber,
    email: email || '',
    age: parseInt(age) || 25,
    gender: gender || 'Male',
    bloodGroup: bloodGroup || 'O+',
    chronicConditions: Array.isArray(chronicConditions) ? chronicConditions : [],
    createdAt: new Date().toISOString()
  };

  users.set(userId, user);

  res.status(201).json({
    success: true,
    message: 'User account created successfully.',
    user
  });
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user via phone number and OTP
 */
router.post('/login', (req, res) => {
  const { phoneNumber, otp } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: 'Phone number is required.' });
  }

  // Find user by phone number
  let foundUser = null;
  for (const user of users.values()) {
    if (user.phoneNumber === phoneNumber) {
      foundUser = user;
      break;
    }
  }

  if (!foundUser) {
    // Create guest profile if not existing
    const userId = `usr_${uuidv4().substring(0, 8)}`;
    foundUser = {
      id: userId,
      fullName: 'User ' + phoneNumber.slice(-4),
      phoneNumber,
      email: '',
      age: 30,
      gender: 'Male',
      bloodGroup: 'O+',
      chronicConditions: [],
      createdAt: new Date().toISOString()
    };
    users.set(userId, foundUser);
  }

  res.json({
    success: true,
    message: 'Login successful.',
    user: foundUser
  });
});

/**
 * @route   GET /api/auth/profile/:id
 * @desc    Get user profile by ID
 */
router.get('/profile/:id', (req, res) => {
  const user = users.get(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User profile not found.' });
  }
  res.json({ success: true, user });
});

module.exports = router;
