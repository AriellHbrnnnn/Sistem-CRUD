const express = require('express');
const router = express.Router();
const { db } = require('../firebase-config');
const { verifyToken, isAdmin } = require('../middleware/auth');

// ============ SALES ORDERS ============

// Get All Sales Orders
router.get('/orders', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('salesOrders').orderBy('createdAt', 'desc').get();
    const orders = [];
    snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Sales Stats
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const ordersSnap = await db.collection('salesOrders').get();
    const invoicesSnap = await db.collection('invoices').get();

    let totalSales = 0, completed = 0, processing = 0, pending = 0;
    ordersSnap.forEach(doc => {
      const d = doc.data();
      totalSales += d.total || 0;
      if (d.status === 'completed') completed++;
      else if (d.status === 'processing') processing++;
      else if (d.status === 'pending') pending++;
    });

    let totalInvoice = 0, paid = 0, unpaid = 0;
    invoicesSnap.forEach(doc => {
      const d = doc.data();
      totalInvoice += d.total || 0;
      if (d.status === 'paid') paid++;
      else unpaid++;
    });

    res.json({
      success: true,
      data: {
        totalOrders: ordersSnap.size, totalSales, completed, processing, pending,
        totalInvoices: invoicesSnap.size, totalInvoice, paid, unpaid
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create Sales Order
router.post('/orders', verifyToken, isAdmin, async (req, res) => {
  try {
    const { orderNumber, items, total, status, notes } = req.body;
    if (!orderNumber || !items || !items.length || total === undefined) {
      return res.status(400).json({ success: false, message: 'Nomor order, produk, dan total wajib diisi' });
    }

    // Validasi stok produk backend
    for (const item of items) {
      const productSnap = await db.collection('products').doc(item.productId).get();
      if (!productSnap.exists) {
        return res.status(400).json({ success: false, message: `Produk dengan ID ${item.productId} tidak ditemukan.` });
      }
      const pData = productSnap.data();
      if ((pData.stock || 0) < item.qty) {
        return res.status(400).json({ success: false, message: `Stok tidak mencukupi untuk "${pData.name}". Sisa stok: ${pData.stock || 0}` });
      }
    }

    const orderData = {
      orderNumber, items: items || [],
      total: Number(total), status: status || 'pending',
      notes: notes || '', createdBy: req.user.uid,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };

    const docRef = await db.collection('salesOrders').add(orderData);

    // Auto-create invoice
    const initialInvoiceStatus = (status === 'completed') ? 'paid' : 'unpaid';
    const invoiceData = {
      invoiceNumber: orderNumber.replace('SO-', 'INV-'),
      items: items || [],
      total: Number(total),
      status: initialInvoiceStatus,
      orderId: docRef.id,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };
    await db.collection('invoices').add(invoiceData);

    res.json({ success: true, data: { id: docRef.id, ...orderData }, message: 'Pesanan berhasil dibuat' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Sales Order
router.put('/orders/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    await db.collection('salesOrders').doc(id).update(updates);

    // Sync invoice status
    if (req.body.status) {
      const invoicesRef = db.collection('invoices');
      const snapshot = await invoicesRef.where('orderId', '==', id).get();

      if (!snapshot.empty) {
        const batch = db.batch();
        const newInvoiceStatus = (req.body.status === 'completed') ? 'paid' : 'unpaid';

        snapshot.forEach(doc => {
          batch.update(doc.ref, {
            status: newInvoiceStatus,
            updatedAt: new Date().toISOString()
          });
        });
        await batch.commit();
      }
    }

    res.json({ success: true, message: 'Pesanan berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Sales Order
router.delete('/orders/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await db.collection('salesOrders').doc(req.params.id).delete();
    res.json({ success: true, message: 'Pesanan berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ INVOICES ============

// Get All Invoices
router.get('/invoices', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('invoices').orderBy('createdAt', 'desc').get();
    const invoices = [];
    snapshot.forEach(doc => invoices.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Invoice Status
router.put('/invoices/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await db.collection('invoices').doc(req.params.id).update({
      ...req.body, updatedAt: new Date().toISOString()
    });
    res.json({ success: true, message: 'Invoice berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
