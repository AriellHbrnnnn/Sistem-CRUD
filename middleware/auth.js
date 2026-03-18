const { auth, db } = require('../firebase-config');

// Verifikasi Firebase ID Token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Token tidak ditemukan. Silakan login terlebih dahulu.'
    });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;

    // Ambil data user dari Firestore untuk mendapatkan role
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (userDoc.exists) {
      req.userRole = userDoc.data().role || 'user';
      req.userData = userDoc.data();
    } else {
      req.userRole = 'user';
    }

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({
      success: false,
      message: 'Token tidak valid atau sudah expired.'
    });
  }
};

// Middleware: Hanya admin yang bisa akses
const requireAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak. Hanya admin yang bisa melakukan aksi ini.'
    });
  }
  next();
};

// Gabungan: Verifikasi token + pastikan user terautentikasi
const requireAuth = [verifyToken];

// Gabungan: Verifikasi token + pastikan user adalah admin
const requireAdminAuth = [verifyToken, requireAdmin];

module.exports = {
  verifyToken,
  requireAdmin,
  isAdmin: requireAdmin,
  requireAuth,
  requireAdminAuth
};
