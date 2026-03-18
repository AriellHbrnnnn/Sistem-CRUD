const admin = require('firebase-admin');
const path = require('path');

// Inisialisasi Firebase Admin SDK
// Pastikan file serviceAccountKey.json ada di root folder project
let serviceAccount;
try {
  serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
} catch (error) {
  console.error('⚠️  File serviceAccountKey.json tidak ditemukan!');
  console.error('   Download dari Firebase Console > Project Settings > Service Accounts');
  console.error('   Simpan sebagai serviceAccountKey.json di root folder project');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
