const express = require('express');
const router = express.Router();
const { auth, db } = require('../firebase-config');
const { requireAuth, requireAdminAuth } = require('../middleware/auth');

// POST /api/auth/register - Register user baru
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, dan nama lengkap wajib diisi.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password minimal 6 karakter.'
      });
    }

    // Buat user di Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName
    });

    // Cek apakah ini user pertama (jadikan admin)
    const usersSnapshot = await db.collection('users').get();
    const role = usersSnapshot.empty ? 'admin' : 'user';

    // Simpan data user di Firestore
    await db.collection('users').doc(userRecord.uid).set({
      email,
      displayName,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: `User berhasil didaftarkan${role === 'admin' ? ' sebagai Admin' : ''}.`,
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        role
      }
    });
  } catch (error) {
    console.error('Register error:', error);

    let message = 'Gagal mendaftarkan user.';
    if (error.code === 'auth/email-already-exists') {
      message = 'Email sudah terdaftar.';
    } else if (error.code === 'auth/invalid-email') {
      message = 'Format email tidak valid.';
    }

    res.status(400).json({
      success: false,
      message,
      error: error.message
    });
  }
});

// GET /api/auth/me - Get current user profile
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan.'
      });
    }

    res.json({
      success: true,
      data: {
        uid: req.user.uid,
        ...userDoc.data()
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data profile.'
    });
  }
});

// GET /api/auth/users - Get semua user (admin only)
router.get('/users', requireAdminAuth, async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
    const users = [];

    usersSnapshot.forEach(doc => {
      users.push({
        uid: doc.id,
        ...doc.data()
      });
    });

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data users.'
    });
  }
});

// PUT /api/auth/set-role - Ubah role user (admin only)
router.put('/set-role', requireAdminAuth, async (req, res) => {
  try {
    const { uid, role } = req.body;

    if (!uid || !role) {
      return res.status(400).json({
        success: false,
        message: 'UID dan role wajib diisi.'
      });
    }

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role harus "admin" atau "user".'
      });
    }

    // Jangan izinkan admin mengubah role dirinya sendiri
    if (uid === req.user.uid) {
      return res.status(400).json({
        success: false,
        message: 'Tidak bisa mengubah role diri sendiri.'
      });
    }

    await db.collection('users').doc(uid).update({
      role,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `Role berhasil diubah menjadi ${role}.`
    });
  } catch (error) {
    console.error('Set role error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengubah role user.'
    });
  }
});

// DELETE /api/auth/users/:uid - Hapus user (admin only)
router.delete('/users/:uid', requireAdminAuth, async (req, res) => {
  try {
    const { uid } = req.params;

    if (uid === req.user.uid) {
      return res.status(400).json({
        success: false,
        message: 'Tidak bisa menghapus akun sendiri.'
      });
    }

    // Hapus dari Firebase Auth
    await auth.deleteUser(uid);

    // Hapus dari Firestore
    await db.collection('users').doc(uid).delete();

    res.json({
      success: true,
      message: 'User berhasil dihapus.'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal menghapus user.'
    });
  }
});

module.exports = router;
