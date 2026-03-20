const admin = require('firebase-admin');
const path = require('path');

// Inisialisasi Firebase Admin SDK
// Pastikan file serviceAccountKey.json ada di root folder project
// ATAU gunakan environment variable FIREBASE_SERVICE_ACCOUNT_KEY

let serviceAccount;

// Try loading dari file dulu
try {
  serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
  console.log('✅ Firebase loaded from serviceAccountKey.json');
} catch (error) {
  // If file doesn't exist, try environment variable (untuk Vercel)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      console.log('✅ Firebase loaded from environment variable');
    } catch (e) {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON');
      process.exit(1);
    }
  } else {
    console.error('⚠️  File serviceAccountKey.json tidak ditemukan!');
    console.error('   Option 1: Download dari Firebase Console > Project Settings > Service Accounts');
    console.error('   Option 2: Set environment variable FIREBASE_SERVICE_ACCOUNT_KEY di Vercel');
    console.error('   For Vercel: Copy seluruh isi JSON serviceAccountKey.json,');
    console.error('   paste di Vercel Project Settings > Environment Variables as FIREBASE_SERVICE_ACCOUNT_KEY');
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
