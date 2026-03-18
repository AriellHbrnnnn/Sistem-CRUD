const express = require('express');
const router = express.Router();
const { db } = require('../firebase-config');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Get All Customers
router.get('/', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('customers').orderBy('createdAt', 'desc').get();
    const customers = [];
    snapshot.forEach(doc => customers.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: customers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create Customer
router.post('/', verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, email, phone, address, notes } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi' });
    }

    const customerData = {
      name, email: email || '', phone: phone || '',
      address: address || '', notes: notes || '',
      totalOrders: 0, totalSpent: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };

    const docRef = await db.collection('customers').add(customerData);
    res.json({ success: true, data: { id: docRef.id, ...customerData }, message: 'Pelanggan berhasil ditambahkan' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Customer
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await db.collection('customers').doc(req.params.id).update({
      ...req.body, updatedAt: new Date().toISOString()
    });
    res.json({ success: true, message: 'Pelanggan berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Customer
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await db.collection('customers').doc(req.params.id).delete();
    res.json({ success: true, message: 'Pelanggan berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
