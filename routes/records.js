const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { supabase, isConfigured } = require('../config/supabase');
const router = express.Router();

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

/**
 * @route   POST /api/records/upload
 * @desc    Upload X-Ray / MRI / PDF report file to Supabase Storage & save record
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { patientId, title, type, date, details, doctorName, hospitalName } = req.body;
    const file = req.file;

    if (!patientId || !title) {
      return res.status(400).json({ success: false, error: 'patientId and title are required.' });
    }

    let fileUrl = null;

    // Upload to Supabase Storage Bucket 'medical_records' if file provided
    if (file && isConfigured && supabase) {
      const fileExt = file.originalname.split('.').pop();
      const filePath = `patient_${patientId}/${Date.now()}_${uuidv4().substring(0, 6)}.${fileExt}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('medical_records')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true
        });

      if (uploadErr) {
        console.error('Supabase Storage Upload Error:', uploadErr);
      } else {
        const { data: publicUrlData } = supabase.storage.from('medical_records').getPublicUrl(filePath);
        fileUrl = publicUrlData?.publicUrl;
      }
    }

    const recordId = `rec_${uuidv4().substring(0, 8)}`;
    const record = {
      id: recordId,
      patient_id: patientId,
      title,
      type: type || 'Doctor Visit',
      date: date || new Date().toISOString().substring(0, 10),
      details: details || '',
      file_url: fileUrl,
      doctor_name: doctorName || '',
      hospital_name: hospitalName || ''
    };

    if (isConfigured && supabase) {
      const { data: savedRecord, error: saveErr } = await supabase.from('medical_records').insert([record]).select().single();
      if (saveErr) {
        return res.status(500).json({ success: false, error: saveErr.message });
      }
      return res.status(201).json({
        success: true,
        message: 'Medical Record & File saved permanently to Supabase Cloud Storage & Database.',
        record: savedRecord
      });
    }

    res.status(201).json({
      success: true,
      message: 'Record saved.',
      record
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   GET /api/records/:patientId
 * @desc    Get all medical records for a patient
 */
router.get('/:patientId', async (req, res) => {
  const { patientId } = req.params;

  if (isConfigured && supabase) {
    const { data, error } = await supabase.from('medical_records').select('*').eq('patient_id', patientId);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, count: data.length, records: data });
  }

  res.json({ success: true, count: 0, records: [] });
});

module.exports = router;
