const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const familyRoutes = require('./routes/family');
const doctorRoutes = require('./routes/doctor');
const recordsRoutes = require('./routes/records');
const medicinesRoutes = require('./routes/medicines');
const caretakerRoutes = require('./routes/caretaker');

const { isConfigured, supabase } = require('./config/supabase');

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
    version: '2.0.0'
  });
});

// Register Routes
app.use('/api/auth', authRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/medicines', medicinesRoutes);
app.use('/api/caretaker', caretakerRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/records', recordsRoutes);

// Server-side Background Caretaker Escalation Job Loop
function startCaretakerEscalationJob() {
  console.log('⏰ Starting Caretaker Escalation Background Job (Running every 30s)...');

  setInterval(async () => {
    try {
      if (!isConfigured || !supabase) return;

      const now = new Date();
      // Find doses where status is not 'Taken', escalated is false, and grace period (escalation_datetime) has elapsed
      const { data: overdueDoses, error } = await supabase
        .from('scheduled_doses')
        .select('*, family_members!scheduled_doses_profile_id_fkey(name, caretaker_id), medicines(name)')
        .neq('status', 'Taken')
        .eq('escalated', false)
        .lte('escalation_datetime', now.toISOString());

      if (error || !overdueDoses || overdueDoses.length === 0) return;

      for (const dose of overdueDoses) {
        // Recheck DB status atomically immediately before sending escalation!
        const { data: recheck } = await supabase
          .from('scheduled_doses')
          .select('status')
          .eq('id', dose.id)
          .single();

        if (recheck && recheck.status === 'Taken') continue; // User took medicine just before job execution!

        const profile = dose.family_members;
        if (!profile || !profile.caretaker_id) continue; // No assigned caretaker

        const patientName = profile.name || 'Patient';
        const medicineName = dose.medicines ? dose.medicines.name : 'Scheduled Medicine';
        const scheduledTime = dose.scheduled_time || '08:00';
        const caretakerProfileId = profile.caretaker_id;

        const notifMessage = `${patientName} has not confirmed taking ${medicineName}, scheduled for ${scheduledTime}.`;

        // Mark dose as escalated & Missed
        await supabase
          .from('scheduled_doses')
          .update({
            status: 'Missed',
            escalated: true,
            escalated_at: now.toISOString()
          })
          .eq('id', dose.id);

        // Insert notification for caretaker
        await supabase
          .from('caretaker_notifications')
          .insert([{
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            caretaker_profile_id: caretakerProfileId,
            patient_profile_id: dose.profile_id,
            medicine_id: dose.medicine_id,
            dose_id: dose.id,
            patient_name: patientName,
            medicine_name: medicineName,
            scheduled_time: scheduledTime,
            message: notifMessage,
            status: 'Unread'
          }]);

        console.log(`🚨 Caretaker Escalation Triggered: ${notifMessage}`);
      }
    } catch (err) {
      console.error('Error in Caretaker Escalation Job:', err.message);
    }
  }, 30000);
}

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

  startCaretakerEscalationJob();
});
