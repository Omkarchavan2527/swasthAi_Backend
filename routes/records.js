const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { supabase, isConfigured } = require('../config/supabase');
const router = express.Router();

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// In-memory fallback store: patientId -> Array<Record>
const recordsStore = new Map();

/**
 * Format record object consistently
 */
function formatRecord(r) {
  return {
    id: r.id,
    patientId: r.patient_id || r.patientId,
    memberId: r.patient_id || r.patientId,
    title: r.title,
    type: r.type || 'doctor_visit',
    date: r.date || new Date().toISOString().substring(0, 10),
    details: r.details || '',
    fileUrl: r.file_url || r.fileUrl || null,
    doctorName: r.doctor_name || r.doctorName || null,
    hospitalName: r.hospital_name || r.hospitalName || null,
    diagnosis: r.diagnosis || r.title || null,
    tags: Array.isArray(r.tags) ? r.tags : (r.type ? [r.type] : []),
    createdAt: r.created_at || r.createdAt || new Date().toISOString()
  };
}

/**
 * @route   POST /api/records/add
 * @desc    Save a medical record for a specific patient / family member (JSON)
 */
router.post('/add', async (req, res) => {
  try {
    const {
      patientId,
      userId,
      title,
      type,
      date,
      details,
      doctorName,
      hospitalName,
      diagnosis,
      tags,
      fileUrl
    } = req.body;

    if (!patientId || !title) {
      return res.status(400).json({ success: false, error: 'patientId and title are required.' });
    }

    const recordId = `rec_${uuidv4().substring(0, 8)}`;
    const record = {
      id: recordId,
      patient_id: patientId,
      title: title.trim(),
      type: type || 'Doctor Visit',
      date: date || new Date().toISOString().substring(0, 10),
      details: details || '',
      file_url: fileUrl || null,
      doctor_name: doctorName || '',
      hospital_name: hospitalName || ''
    };

    if (isConfigured && supabase) {
      try {
        const { data: savedRecord, error: saveErr } = await supabase
          .from('medical_records')
          .insert([record])
          .select()
          .single();

        if (!saveErr && savedRecord) {
          return res.status(201).json({
            success: true,
            message: 'Medical Record saved to Supabase Cloud Database.',
            record: formatRecord(savedRecord)
          });
        }

        if (saveErr) {
          console.warn('Supabase Medical Record Insert Warning:', saveErr.message);
        }
      } catch (dbErr) {
        console.warn('Supabase Medical Record Exception:', dbErr.message);
      }
    }

    // Fallback in-memory
    const pList = recordsStore.get(patientId) || [];
    pList.unshift(record);
    recordsStore.set(patientId, pList);

    res.status(201).json({
      success: true,
      message: 'Medical Record saved.',
      record: formatRecord(record)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   POST /api/records/upload
 * @desc    Upload X-Ray / MRI / PDF report file to Supabase Storage & save record (Multipart)
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
      try {
        const fileExt = file.originalname.split('.').pop();
        const filePath = `patient_${patientId}/${Date.now()}_${uuidv4().substring(0, 6)}.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from('medical_records')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true
          });

        if (!uploadErr) {
          const { data: publicUrlData } = supabase.storage.from('medical_records').getPublicUrl(filePath);
          fileUrl = publicUrlData?.publicUrl;
        }
      } catch (storageErr) {
        console.warn('Supabase Storage Upload Exception:', storageErr.message);
      }
    }

    const recordId = `rec_${uuidv4().substring(0, 8)}`;
    const record = {
      id: recordId,
      patient_id: patientId,
      title: title.trim(),
      type: type || 'Doctor Visit',
      date: date || new Date().toISOString().substring(0, 10),
      details: details || '',
      file_url: fileUrl,
      doctor_name: doctorName || '',
      hospital_name: hospitalName || ''
    };

    if (isConfigured && supabase) {
      try {
        const { data: savedRecord, error: saveErr } = await supabase
          .from('medical_records')
          .insert([record])
          .select()
          .single();

        if (!saveErr && savedRecord) {
          return res.status(201).json({
            success: true,
            message: 'Medical Record & File saved permanently to Supabase Cloud Storage & Database.',
            record: formatRecord(savedRecord)
          });
        }
      } catch (e) {
        console.warn('Supabase Record Save Error:', e.message);
      }
    }

    const pList = recordsStore.get(patientId) || [];
    pList.unshift(record);
    recordsStore.set(patientId, pList);

    res.status(201).json({
      success: true,
      message: 'Record saved.',
      record: formatRecord(record)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   GET /api/records/:patientId
 * @desc    Get all medical records for a specific patient / user
 */
router.get('/:patientId', async (req, res) => {
  const { patientId } = req.params;

  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('medical_records')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const formatted = data.map(formatRecord);
        return res.json({ success: true, count: formatted.length, records: formatted });
      }
    } catch (e) {
      console.warn('Supabase Records Fetch Warning:', e.message);
    }
  }

  const list = recordsStore.get(patientId) || [];
  res.json({ success: true, count: list.length, records: list.map(formatRecord) });
});

/**
 * @route   DELETE /api/records/:patientId/:recordId
 * @desc    Delete a medical record
 */
router.delete('/:patientId/:recordId', async (req, res) => {
  const { patientId, recordId } = req.params;

  if (isConfigured && supabase) {
    try {
      await supabase.from('medical_records').delete().eq('id', recordId);
      return res.json({ success: true, message: 'Medical record deleted successfully.' });
    } catch (_) {}
  }

  const list = recordsStore.get(patientId) || [];
  const updated = list.filter(r => r.id !== recordId);
  recordsStore.set(patientId, updated);

  res.json({ success: true, message: 'Medical record deleted successfully.' });
});

module.exports = router;
