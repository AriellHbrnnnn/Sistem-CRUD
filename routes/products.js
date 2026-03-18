const express = require('express');
const router = express.Router();
const { db } = require('../firebase-config');
const { requireAuth, requireAdminAuth } = require('../middleware/auth');

// Collection reference
const productsCollection = db.collection('products');

// GET /api/products - Ambil semua produk (semua role)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { category, search, sortBy = 'createdAt', order = 'desc' } = req.query;

    let query = productsCollection;

    // Filter by category
    if (category && category !== 'all') {
      query = query.where('category', '==', category);
    }

    // Sort
    query = query.orderBy(sortBy, order);

    const snapshot = await query.get();
    let products = [];

    snapshot.forEach(doc => {
      products.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Search filter (client-side karena Firestore tidak support full-text search)
    if (search) {
      const searchLower = search.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(searchLower) ||
        p.sku.toLowerCase().includes(searchLower) ||
        (p.description && p.description.toLowerCase().includes(searchLower))
      );
    }

    res.json({
      success: true,
      data: products,
      total: products.length
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data produk.'
    });
  }
});

// GET /api/products/stats - Statistik produk (semua role)
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const snapshot = await productsCollection.get();
    let totalProducts = 0;
    let totalValue = 0;
    let lowStock = 0;
    const categories = new Set();

    snapshot.forEach(doc => {
      const data = doc.data();
      totalProducts++;
      totalValue += (data.price || 0) * (data.stock || 0);
      if ((data.stock || 0) <= 10) lowStock++;
      if (data.category) categories.add(data.category);
    });

    res.json({
      success: true,
      data: {
        totalProducts,
        totalValue,
        lowStock,
        totalCategories: categories.size,
        categories: Array.from(categories)
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil statistik.'
    });
  }
});

// GET /api/products/:id - Ambil satu produk
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await productsCollection.doc(req.params.id).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan.'
      });
    }

    res.json({
      success: true,
      data: {
        id: doc.id,
        ...doc.data()
      }
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil detail produk.'
    });
  }
});

// POST /api/products - Tambah produk baru (admin only)
router.post('/', requireAdminAuth, async (req, res) => {
  try {
    const { name, sku, category, price, stock, description, unit } = req.body;

    if (!name || !sku || !category || price === undefined || stock === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Nama, SKU, kategori, harga, dan stok wajib diisi.'
      });
    }

    // Cek SKU unik
    const existingSku = await productsCollection.where('sku', '==', sku).get();
    if (!existingSku.empty) {
      return res.status(400).json({
        success: false,
        message: 'SKU sudah digunakan produk lain.'
      });
    }

    const productData = {
      name,
      sku,
      category,
      price: Number(price),
      stock: Number(stock),
      description: description || '',
      unit: unit || 'pcs',
      createdBy: req.user.uid,
      createdByName: req.userData?.displayName || 'Unknown',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await productsCollection.add(productData);

    res.status(201).json({
      success: true,
      message: 'Produk berhasil ditambahkan.',
      data: {
        id: docRef.id,
        ...productData
      }
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal menambahkan produk.'
    });
  }
});

// PUT /api/products/:id - Update produk (admin only)
router.put('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { name, sku, category, price, stock, description, unit } = req.body;

    const docRef = productsCollection.doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan.'
      });
    }

    // Cek SKU unik (jika diubah)
    if (sku && sku !== doc.data().sku) {
      const existingSku = await productsCollection.where('sku', '==', sku).get();
      if (!existingSku.empty) {
        return res.status(400).json({
          success: false,
          message: 'SKU sudah digunakan produk lain.'
        });
      }
    }

    const updateData = {
      ...(name && { name }),
      ...(sku && { sku }),
      ...(category && { category }),
      ...(price !== undefined && { price: Number(price) }),
      ...(stock !== undefined && { stock: Number(stock) }),
      ...(description !== undefined && { description }),
      ...(unit && { unit }),
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.uid
    };

    await docRef.update(updateData);

    const updated = await docRef.get();

    res.json({
      success: true,
      message: 'Produk berhasil diperbarui.',
      data: {
        id: updated.id,
        ...updated.data()
      }
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal memperbarui produk.'
    });
  }
});

// DELETE /api/products/:id - Hapus produk (admin only)
router.delete('/:id', requireAdminAuth, async (req, res) => {
  try {
    const docRef = productsCollection.doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan.'
      });
    }

    await docRef.delete();

    res.json({
      success: true,
      message: 'Produk berhasil dihapus.'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal menghapus produk.'
    });
  }
});

module.exports = router;
