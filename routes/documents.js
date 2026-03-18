const express = require('express');
const router = express.Router();
const { db } = require('../firebase-config');
const { verifyToken, isAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Get All Documents
router.get('/', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('documents').orderBy('createdAt', 'desc').get();
    const documents = [];
    snapshot.forEach(doc => documents.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Upload Document
router.post('/', verifyToken, isAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File tidak ditemukan' });
    }

    const { customName } = req.body;
    const fileName = customName || req.file.originalname;
    const fileSize = (req.file.size / 1024).toFixed(2) + ' KB';
    const fileUrl = `/uploads/${req.file.filename}`;

    const documentData = {
      name: fileName,
      type: path.extname(req.file.originalname).substring(1).toUpperCase() || 'FILE',
      size: fileSize,
      url: fileUrl,
      uploaderId: req.user.uid,
      uploaderName: req.user.displayName || 'Admin',
      createdAt: new Date().toISOString()
    };

    const docRef = await db.collection('documents').add(documentData);
    res.json({ success: true, data: { id: docRef.id, ...documentData }, message: 'Dokumen berhasil diunggah' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Document
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    // Optionally delete from filesystem too, but keeping it simple for now as requested
    await db.collection('documents').doc(req.params.id).delete();
    res.json({ success: true, message: 'Dokumen berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
