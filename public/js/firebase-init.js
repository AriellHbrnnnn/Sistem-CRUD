// Firebase Client SDK Initialization
// Konfigurasi diambil dari server endpoint /api/config

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;

async function initFirebase() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();

    // Inisialisasi Firebase
    firebaseApp = firebase.initializeApp(config);
    firebaseAuth = firebase.auth();

    // Inisialisasi Firestore jika tersedia
    if (typeof firebase.firestore === 'function') {
      firebaseDb = firebase.firestore();
    }

    console.log('✅ Firebase berhasil diinisialisasi');
    return true;
  } catch (error) {
    console.error('❌ Gagal inisialisasi Firebase:', error);
    return false;
  }
}

// Helper: Get current user token
async function getCurrentToken() {
  const user = firebaseAuth?.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
}

// Helper: Check if user is logged in
function isLoggedIn() {
  return !!firebaseAuth?.currentUser;
}
