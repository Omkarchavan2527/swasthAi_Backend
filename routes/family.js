const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Family Members store (userId -> Array of members)
const familyMembers = new Map();

// Seed initial Patil family demo data
familyMembers.set('1', [
  { id: '1', userId: '1', name: 'Rajesh Patil', age: 45, gender: 'Male', relationship: 'Self', bloodGroup: 'O+', chronicConditions: ['Hypertension', 'Diabetes'], phone: '9876543210' },
  { id: '2', userId: '1', name: 'Sunita Patil', age: 41, gender: 'Female', relationship: 'Spouse', bloodGroup: 'B+', chronicConditions: [], phone: '9876543211' },
  { id: '3', userId: '1', name: 'Amit Patil', age: 16, gender: 'Male', relationship: 'Son', bloodGroup: 'A+', chronicConditions: [], phone: '9876543212' },
  { id: '4', userId: '1', name: 'Priya Patil', age: 12, gender: 'Female', relationship: 'Daughter', bloodGroup: 'AB+', chronicConditions: [], phone: '9876543213' },
  { id: '5', userId: '1', name: 'Baba Patil', age: 68, gender: 'Male', relationship: 'Father', bloodGroup: 'O+', chronicConditions: ['Hypertension'], phone: '9876543214' }
]);

/**
 * @route   GET /api/family/:userId
 * @desc    Fetch all family members for a specific user
 */
router.get('/:userId', (req, res) => {
  const members = familyMembers.get(req.params.userId) || [];
  res.json({ success: true, count: members.length, members });
});

/**
 * @route   POST /api/family/add
 * @desc    Add a new family member profile
 */
router.post('/add', (req, res) => {
  const { userId, name, age, gender, relationship, bloodGroup, chronicConditions, phone } = req.body;

  if (!userId || !name) {
    return res.status(400).json({ success: false, error: 'UserId and name are required.' });
  }

  const member = {
    id: `mem_${uuidv4().substring(0, 8)}`,
    userId,
    name,
    age: parseInt(age) || 25,
    gender: gender || 'Male',
    relationship: relationship || 'Family',
    bloodGroup: bloodGroup || 'O+',
    chronicConditions: Array.isArray(chronicConditions) ? chronicConditions : [],
    phone: phone || ''
  };

  const list = familyMembers.get(userId) || [];
  list.push(member);
  familyMembers.set(userId, list);

  res.status(201).json({ success: true, message: 'Family member added.', member });
});

/**
 * @route   DELETE /api/family/:userId/:memberId
 * @desc    Delete a family member profile
 */
router.delete('/:userId/:memberId', (req, res) => {
  const { userId, memberId } = req.params;
  let list = familyMembers.get(userId) || [];
  list = list.filter(m => m.id !== memberId);
  familyMembers.set(userId, list);

  res.json({ success: true, message: 'Family member deleted successfully.' });
});

module.exports = router;
