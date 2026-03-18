const express = require('express');
const router = express.Router();
const { db } = require('../firebase-config');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Get All Suppliers
router.get('/', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('suppliers').orderBy('createdAt', 'desc').get();
    const suppliers = [];
    snapshot.forEach(doc => suppliers.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: suppliers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create Supplier
router.post('/', verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, contactPerson, email, phone, address, notes } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Nama supplier wajib diisi' });
    }

    const supplierData = {
      name, contactPerson: contactPerson || '',
      email: email || '', phone: phone || '',
      address: address || '', notes: notes || '',
      totalPO: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };

    const docRef = await db.collection('suppliers').add(supplierData);
    res.json({ success: true, data: { id: docRef.id, ...supplierData }, message: 'Supplier berhasil ditambahkan' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Supplier
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await db.collection('suppliers').doc(req.params.id).update({
      ...req.body, updatedAt: new Date().toISOString()
    });
    res.json({ success: true, message: 'Supplier berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Supplier
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await db.collection('suppliers').doc(req.params.id).delete();
    res.json({ success: true, message: 'Supplier berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
