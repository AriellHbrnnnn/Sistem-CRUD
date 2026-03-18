const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function syncBills() {
  console.log('Starting sync of Bills to match Purchase Orders...');

  const poSnapshot = await db.collection('purchaseOrders').get();
  console.log(`Found ${poSnapshot.size} Purchase Orders.`);

  let updatedCount = 0;
  let noBillCount = 0;

  for (let doc of poSnapshot.docs) {
    const po = doc.data();
    const poId = doc.id;
    const targetStatus = po.status === 'received' ? 'paid' : 'unpaid';

    const billsSnapshot = await db.collection('bills').where('poId', '==', poId).get();

    if (billsSnapshot.empty) {
      console.log(`PO ${po.poNumber} (ID: ${poId}) has no associated bill.`);
      noBillCount++;
      continue;
    }

    const batch = db.batch();
    billsSnapshot.forEach(billDoc => {
      const billData = billDoc.data();
      if (billData.status !== targetStatus) {
        batch.update(billDoc.ref, { 
          status: targetStatus,
          updatedAt: new Date().toISOString()
        });
        updatedCount++;
        console.log(`Updating Bill ${billData.billNumber} to '${targetStatus}'.`);
      }
    });
    
    await batch.commit();
  }

  console.log(`\nSync finished. Updated ${updatedCount} bills. ${noBillCount} POs have no bills.`);
  process.exit(0);
}

syncBills().catch(console.error);
