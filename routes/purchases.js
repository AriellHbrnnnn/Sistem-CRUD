const express = require('express');
const router = express.Router();
const { db } = require('../firebase-config');
const { verifyToken, isAdmin } = require('../middleware/auth');

// ============ PURCHASE ORDERS ============

// Get All Purchase Orders
router.get('/orders', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('purchaseOrders').orderBy('createdAt', 'desc').get();
    const orders = [];
    snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Purchase Stats
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const poSnap = await db.collection('purchaseOrders').get();
    const billsSnap = await db.collection('bills').get();

    let totalPurchase = 0, received = 0, shipped = 0, poWaiting = 0;
    poSnap.forEach(doc => {
      const d = doc.data();
      totalPurchase += d.total || 0;
      if (d.status === 'received') received++;
      else if (d.status === 'shipped') shipped++;
      else if (d.status === 'pending') poWaiting++;
    });

    let totalBills = 0, billPaid = 0, billUnpaid = 0;
    billsSnap.forEach(doc => {
      const d = doc.data();
      totalBills += d.total || 0;
      if (d.status === 'paid') billPaid++;
      else billUnpaid++;
    });

    res.json({
      success: true,
      data: {
        totalPO: poSnap.size, totalPurchase, received, shipped, pending: poWaiting,
        totalBillsCount: billsSnap.size, totalBills, billPaid, billUnpaid
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create Purchase Order
router.post('/orders', verifyToken, isAdmin, async (req, res) => {
  try {
    const { poNumber, supplierName, items, total, status, notes } = req.body;
    if (!poNumber || !supplierName || !total) {
      return res.status(400).json({ success: false, message: 'Nomor PO, supplier, dan total wajib diisi' });
    }

    const poData = {
      poNumber, supplierName, items: items || [],
      total: Number(total), status: status || 'pending',
      notes: notes || '', createdBy: req.user.uid,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };

    const docRef = await db.collection('purchaseOrders').add(poData);

    // Auto-create bill
    const initialBillStatus = (status === 'received') ? 'paid' : 'unpaid';
    const billData = {
      billNumber: poNumber.replace('PO-', 'BIL-'),
      supplierName, total: Number(total),
      status: initialBillStatus, poId: docRef.id,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };
    await db.collection('bills').add(billData);

    res.json({ success: true, data: { id: docRef.id, ...poData }, message: 'Purchase Order berhasil dibuat' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Purchase Order
router.put('/orders/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await db.collection('purchaseOrders').doc(req.params.id).update({
      ...req.body, updatedAt: new Date().toISOString()
    });

    // Auto-sync bill status if PO status is changed
    if (status) {
      const billsSnapshot = await db.collection('bills').where('poId', '==', req.params.id).get();
      if (!billsSnapshot.empty) {
        const batch = db.batch();
        const newBillStatus = status === 'received' ? 'paid' : 'unpaid';
        billsSnapshot.forEach(doc => {
          batch.update(doc.ref, { status: newBillStatus, updatedAt: new Date().toISOString() });
        });
        await batch.commit();
      }
    }

    res.json({ success: true, message: 'Purchase Order berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Purchase Order
router.delete('/orders/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await db.collection('purchaseOrders').doc(req.params.id).delete();
    res.json({ success: true, message: 'Purchase Order berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ BILLS ============

// Get All Bills
router.get('/bills', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('bills').orderBy('createdAt', 'desc').get();
    const bills = [];
    snapshot.forEach(doc => bills.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: bills });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Bill Status
router.put('/bills/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await db.collection('bills').doc(req.params.id).update({
      ...req.body, updatedAt: new Date().toISOString()
    });
    res.json({ success: true, message: 'Tagihan berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
