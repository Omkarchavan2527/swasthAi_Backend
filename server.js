const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const familyRoutes = require('./routes/family');
const doctorRoutes = require('./routes/doctor');
const recordsRoutes = require('./routes/records');
const { isConfigured } = require('./config/supabase');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS & JSON Parser
app.use(cors({ origin: '*' }));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    server: 'SwasthAI Express REST API Backend Server',
    database: isConfigured ? 'Supabase PostgreSQL Cloud DB' : 'Fallback Local DB Mode',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Register Routes
app.use('/api/auth', authRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/records', recordsRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found.' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SwasthAI Backend Server running on port ${PORT}`);
  console.log(`🗄️ Database: ${isConfigured ? "Supabase Cloud DB Connected" : "Fallback Local Mode"}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);
});
