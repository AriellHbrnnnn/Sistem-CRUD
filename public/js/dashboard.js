// ===========================================
// Dashboard Logic - Enhanced with Real-Time Data
// ===========================================

let currentUser = null;
let currentRole = 'user';

// Data Arrays
let allProducts = [];
let allSalesOrders = [];
let allInvoices = [];
let allPurchaseOrders = [];
let allBills = [];

let allSuppliers = [];
let allDocuments = [];

let deleteTargetId = null;
let deleteTargetCollection = null; // products, salesOrders, customers, etc.
let firestoreUnsubscribes = {};
let chartInstances = {};

// ============ INITIALIZATION ============

document.addEventListener('DOMContentLoaded', async () => {
  await initFirebase();

  firebaseAuth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = '/';
      return;
    }

    try {
      const profile = await API.auth.getProfile();
      currentUser = profile.data;
      currentRole = currentUser.role || 'user';

      updateUserInfo();
      setupRBAC();
      // Load initial HTTP data or wait for real-time
      setupRealtimeListeners();
      initCharts();

      document.getElementById('loadingOverlay').classList.add('hidden');
      document.getElementById('dashboardApp').style.display = 'flex';
    } catch (error) {
      console.error('Dashboard init error:', error);
      showToast('Error', 'Gagal memuat dashboard. Silakan login ulang.', 'error');
      setTimeout(() => {
        firebaseAuth.signOut();
        window.location.href = '/';
      }, 2000);
    }
  });
});

function updateUserInfo() {
  const initials = currentUser.displayName
    ? currentUser.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';
  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userName').textContent = currentUser.displayName || 'User';
  document.getElementById('userRoleBadge').textContent = currentRole.toUpperCase();
  document.getElementById('pageSubtitle').textContent = `Selamat datang, ${currentUser.displayName || 'User'}`;
}

function setupRBAC() {
  if (currentRole === 'admin') {
    document.body.classList.add('is-admin');
  } else {
    document.body.classList.remove('is-admin');
  }
}

// ============ DROPDOWN NAVIGATION ============

function toggleDropdown(btn) {
  const dropdown = btn.closest('.nav-dropdown');
  const isOpen = dropdown.classList.contains('open');

  // Close all other dropdowns
  document.querySelectorAll('.nav-dropdown.open').forEach(d => {
    if (d !== dropdown) d.classList.remove('open');
  });

  dropdown.classList.toggle('open');
}

// ============ NAVIGATION ============

const sectionMap = {
  'overview': { id: 'sectionOverview', title: 'Dashboard', subtitle: 'Ringkasan data inventaris' },
  'products': { id: 'sectionProducts', title: 'Semua Produk', subtitle: 'Kelola semua produk inventaris' },
  'stock': { id: 'sectionStock', title: 'Stok Barang', subtitle: 'Monitor level stok real-time' },
  'categories': { id: 'sectionCategories', title: 'Kategori', subtitle: 'Kelola kategori produk' },
  'sales-orders': { id: 'sectionSalesOrders', title: 'Pesanan Penjualan', subtitle: 'Kelola pesanan masuk' },
  'invoices': { id: 'sectionInvoices', title: 'Invoice', subtitle: 'Kelola invoice penjualan' },
  'customers': { id: 'sectionCustomers', title: 'Pelanggan', subtitle: 'Database pelanggan' },
  'purchase-orders': { id: 'sectionPurchaseOrders', title: 'Purchase Order', subtitle: 'Kelola pembelian barang' },
  'suppliers': { id: 'sectionSuppliers', title: 'Supplier', subtitle: 'Database supplier' },
  'bills': { id: 'sectionBills', title: 'Tagihan', subtitle: 'Tagihan pembelian' },
  'reports': { id: 'sectionReports', title: 'Reports', subtitle: 'Laporan dan analisis bisnis' },
  'documents': { id: 'sectionDocuments', title: 'Documents', subtitle: 'Kelola dokumen bisnis' },
  'integrations': { id: 'sectionIntegrations', title: 'Integrations', subtitle: 'Integrasi dengan layanan lain' },
  'channels': { id: 'sectionChannels', title: 'Active Channels', subtitle: 'Channel penjualan aktif' },
  'users': { id: 'sectionUsers', title: 'Kelola User', subtitle: 'Manajemen pengguna sistem' },
};

function showSection(section) {
  // Hide all sections
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));

  const config = sectionMap[section];
  if (!config) return;

  const el = document.getElementById(config.id);
  if (el) el.classList.add('active');

  // Update nav active state
  document.querySelectorAll('.nav-item, .nav-sub-item').forEach(item => item.classList.remove('active'));
  const activeNav = document.querySelector(`[data-section="${section}"]`);
  if (activeNav) {
    activeNav.classList.add('active');
    // Open parent dropdown if it's a sub-item
    const parentDropdown = activeNav.closest('.nav-dropdown');
    if (parentDropdown) parentDropdown.classList.add('open');
  }

  // Update header
  document.getElementById('pageTitle').textContent = config.title;
  document.getElementById('pageSubtitle').textContent = config.subtitle;

  // Load section specific data triggers
  if (section === 'users' && currentRole === 'admin') loadUsers();
  if (section === 'stock') renderStockSection();
  if (section === 'categories') renderCategoriesSection();
  if (section === 'integrations') renderIntegrations();
  if (section === 'channels') renderChannels();

  closeSidebar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

// ============ REAL-TIME LISTENERS ============

function setupRealtimeListeners() {
  if (!firebaseDb) return;
  Object.values(firestoreUnsubscribes).forEach(unsub => unsub());

  // Products
  firestoreUnsubscribes.products = firebaseDb.collection('products').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderProducts();
    let lowStock = 0; const categories = new Set();
    allProducts.forEach(p => { if ((p.stock || 0) <= 10) lowStock++; if (p.category) categories.add(p.category); });
    updateStats({ totalProducts: allProducts.length, lowStock, totalCategories: categories.size });
    updateCategoryFilter(); updateDashboardCharts();
  });

  // Sales Orders
  firestoreUnsubscribes.salesOrders = firebaseDb.collection('salesOrders').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allSalesOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Hitung total sales real-time untuk dashboard utama
    let totalAllTimeSales = 0;
    allSalesOrders.forEach(o => {
      // Hanya hitung yang berstatus 'completed'
      if (o.status === 'completed') {
        totalAllTimeSales += (o.total || 0);
      }
    });
    document.getElementById('statValue').textContent = formatRupiah(totalAllTimeSales);
    
    renderSalesOrders(); updateSalesChart(); updateReportSalesChart();
  });

  // Invoices
  firestoreUnsubscribes.invoices = firebaseDb.collection('invoices').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allInvoices = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderInvoices();
  });

  // Purchase Orders
  firestoreUnsubscribes.purchaseOrders = firebaseDb.collection('purchaseOrders').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allPurchaseOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPurchaseOrders(); updateSalesChart(); updateReportPurchaseChart();
  });

  // Bills
  firestoreUnsubscribes.bills = firebaseDb.collection('bills').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allBills = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderBills();
  });



  // Suppliers
  firestoreUnsubscribes.suppliers = firebaseDb.collection('suppliers').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allSuppliers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderSuppliers(); populateSuppliersDropdown();
  });

  // Documents
  firestoreUnsubscribes.documents = firebaseDb.collection('documents').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allDocuments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderDocuments();
  });
}

function updateStats(stats) {
  document.getElementById('statTotal').textContent = stats.totalProducts || 0;
  document.getElementById('statLowStock').textContent = stats.lowStock || 0;
  document.getElementById('statCategories').textContent = stats.totalCategories || 0;
}

// ============ RENDERERS ============

function renderProducts(products = null) {
  const data = products || allProducts;
  renderRecentProducts(data.slice(0, 5));
  renderAllProducts(data);
}

function renderRecentProducts(products) {
  const tbody = document.getElementById('recentProductsBody');
  if (!products.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">📭</div><h3>Belum ada produk</h3></div></td></tr>`; return; }
  tbody.innerHTML = products.map(p => createProductRow(p)).join('');
}

function renderAllProducts(products) {
  const tbody = document.getElementById('allProductsBody');
  if (!products.length) { tbody.innerHTML = `<tr><td colspan="7"><div class="table-empty"><div class="empty-icon">📭</div><h3>Tidak ada produk</h3></div></td></tr>`; return; }
  tbody.innerHTML = products.map(p => createProductRow(p, true)).join('');
}

function createProductRow(product, showUnit = false) {
  const stockStatus = getStockStatus(product.stock);
  const emoji = getCategoryEmoji(product.category);
  return `<tr>
    <td><div class="product-info"><div class="product-thumb">${emoji}</div><div><div class="product-name">${escapeHtml(product.name)}</div><div class="product-sku">${escapeHtml(product.sku)}</div></div></div></td>
    <td><span class="badge badge-info">${escapeHtml(product.category)}</span></td>
    <td><span class="price-text">${formatRupiah(product.price)}</span></td><td>${product.stock}</td>
    ${showUnit ? `<td>${escapeHtml(product.unit || 'pcs')}</td>` : ''}
    <td><span class="badge ${stockStatus.class}">${stockStatus.label}</span></td>
    <td class="admin-only"><div class="cell-actions">
      <button class="btn-icon edit" onclick="openEditProduct('${product.id}')" title="Edit">✏️</button>
      <button class="btn-icon delete" onclick="openDeleteConfirm('${product.id}', '${escapeHtml(product.name)}', 'products')" title="Hapus">🗑️</button>
    </div></td>
  </tr>`;
}

function getStockStatus(stock) {
  if (stock <= 0) return { label: 'Habis', class: 'badge-danger' };
  if (stock <= 10) return { label: 'Rendah', class: 'badge-warning' };
  return { label: 'Tersedia', class: 'badge-success' };
}

function getCategoryEmoji(category) {
  const map = { 'Elektronik': '💻', 'Pakaian': '👕', 'Makanan & Minuman': '🍔', 'Peralatan': '🔧', 'Kesehatan': '💊', 'Otomotif': '🚗', 'Lainnya': '📦' };
  return map[category] || '📦';
}

function renderStockSection() {
  let adequate = 0, low = 0, empty = 0;
  allProducts.forEach(p => { if (p.stock <= 0) empty++; else if (p.stock <= 10) low++; else adequate++; });
  document.getElementById('stockAdequate').textContent = adequate;
  document.getElementById('stockLow').textContent = low;
  document.getElementById('stockEmpty').textContent = empty;

  if (chartInstances.stockLevel) {
    chartInstances.stockLevel.data.labels = allProducts.map(p => p.name.length > 12 ? p.name.substring(0, 12) + '...' : p.name);
    chartInstances.stockLevel.data.datasets[0].data = allProducts.map(p => p.stock);
    chartInstances.stockLevel.data.datasets[0].backgroundColor = allProducts.map(p => p.stock <= 0 ? 'rgba(255,71,87,0.7)' : p.stock <= 10 ? 'rgba(255,170,0,0.7)' : 'rgba(0,214,143,0.7)');
    chartInstances.stockLevel.update();
  }

  const tbody = document.getElementById('stockTableBody');
  if (!allProducts.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">📭</div><h3>Belum ada data stok</h3></div></td></tr>`; return; }
  tbody.innerHTML = allProducts.map(p => {
    const s = getStockStatus(p.stock);
    return `<tr><td><div class="product-info"><div class="product-thumb">${getCategoryEmoji(p.category)}</div><div><div class="product-name">${escapeHtml(p.name)}</div></div></div></td>
      <td>${escapeHtml(p.sku)}</td><td>${p.stock}</td><td>${escapeHtml(p.unit || 'pcs')}</td><td class="price-text">${formatRupiah(p.price * p.stock)}</td>
      <td><span class="badge ${s.class}">${s.label}</span></td></tr>`;
  }).join('');
}

function renderCategoriesSection() {
  const catCount = {}; allProducts.forEach(p => { catCount[p.category] = (catCount[p.category] || 0) + 1; });
  const grid = document.getElementById('categoriesGrid');
  grid.innerHTML = Object.entries(catCount).map(([cat, count]) => `
    <div class="category-card"><div class="category-icon">${getCategoryEmoji(cat)}</div>
    <div class="category-info"><h4>${escapeHtml(cat)}</h4><p>${count} produk terdaftar</p></div></div>
  `).join('') || '<p class="text-muted" style="padding:2rem;text-align:center;">Belum ada kategori.</p>';

  if (chartInstances.categoriesPage) {
    chartInstances.categoriesPage.data.labels = Object.keys(catCount);
    chartInstances.categoriesPage.data.datasets[0].data = Object.values(catCount);
    chartInstances.categoriesPage.update();
  }
}

function renderSalesOrders() {
  const tbody = document.getElementById('salesOrdersBody');

  let completed = 0, processing = 0, pending = 0, totalSales = 0;
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  allSalesOrders.forEach(order => {
    const orderDate = new Date(order.createdAt);
    if (orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear) {
      if (order.status === 'completed') {
        completed++;
        totalSales += (order.total || 0); // Hanya jumlahkan jika selesai
      }
      else if (order.status === 'processing') processing++;
      else pending++;
    }
  });

  const elCompleted = document.getElementById('salesStatCompleted');
  if (elCompleted) elCompleted.textContent = completed;
  const elProcessing = document.getElementById('salesStatProcessing');
  if (elProcessing) elProcessing.textContent = processing;
  const elPending = document.getElementById('salesStatPending');
  if (elPending) elPending.textContent = pending;
  const elTotal = document.getElementById('salesStatTotal');
  if (elTotal) elTotal.textContent = formatRupiah(totalSales);

  if (!allSalesOrders.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">📭</div><h3>Belum ada pesanan</h3></div></td></tr>`; return; }
  tbody.innerHTML = allSalesOrders.map(d => {
    const date = new Date(d.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const sColor = d.status === 'completed' ? 'success' : (d.status === 'processing' ? 'info' : 'warning');
    const sLabel = d.status === 'completed' ? 'Selesai' : (d.status === 'processing' ? 'Diproses' : 'Pending');
    const itemsStr = d.items && d.items.length ? escapeHtml(`${d.items[0].productName} x${d.items[0].qty}`) : '-';
    
    // Disable edit for completed
    const editBtn = d.status !== 'completed' 
      ? `<button class="btn-icon edit" onclick="openEditStatusModal('${d.id}', '${d.status}')" title="Ubah Status">✏️</button>` 
      : '';

    return `<tr><td><span style="font-weight:600">${escapeHtml(d.orderNumber)}</span></td><td>${itemsStr}</td><td>${date}</td>
    <td class="price-text">${formatRupiah(d.total)}</td><td><span class="badge badge-${sColor}">${sLabel}</span></td>
    <td class="admin-only"><div class="cell-actions">${editBtn}<button class="btn-icon delete" onclick="openDeleteConfirm('${d.id}', '${d.orderNumber}', 'salesOrders')" title="Hapus">🗑️</button></div></td></tr>`;
  }).join('');
}

function renderInvoices() {
  const tbody = document.getElementById('invoicesBody');
  
  let paidCount = 0;
  let unpaidCount = 0;
  let totalInvoiceValue = 0;
  
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  allInvoices.forEach(inv => {
    const invDate = new Date(inv.createdAt);
    if (invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear) {
      if (inv.status === 'paid') {
        paidCount++;
        totalInvoiceValue += (inv.total || 0);
      } else {
        unpaidCount++;
      }
    }
  });

  // Update Invoice Stats Cards in Section Invoices
  const cards = document.querySelectorAll('#sectionInvoices .stat-value');
  if (cards.length >= 3) {
    cards[0].textContent = paidCount;
    cards[1].textContent = unpaidCount;
    cards[2].textContent = formatRupiah(totalInvoiceValue);
  }

  if (!allInvoices.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">📭</div><h3>Belum ada invoice</h3></div></td></tr>`; return; }
  tbody.innerHTML = allInvoices.map(d => {
    const date = new Date(d.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const sColor = d.status === 'paid' ? 'success' : 'warning';
    const sLabel = d.status === 'paid' ? 'Lunas' : 'Belum Bayar';
    const itemsStr = d.items && d.items.length ? escapeHtml(`${d.items[0].productName} x${d.items[0].qty}`) : '-';
    return `<tr><td><span style="font-weight:600">${escapeHtml(d.invoiceNumber)}</span></td><td>${itemsStr}</td>
    <td>${date}</td><td>${d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '-'}</td>
    <td class="price-text">${formatRupiah(d.total)}</td><td><span class="badge badge-${sColor}">${sLabel}</span></td>
    <td class="admin-only"><div class="cell-actions"><button class="btn btn-primary btn-sm" onclick="printInvoice('${d.id}')">🖨️ Cetak</button></div></td></tr>`;
  }).join('');
}

function printInvoice(id) {
  const inv = allInvoices.find(i => i.id === id);
  if (!inv) return;
  const itemsStr = inv.items ? inv.items.map(i => `${i.productName} (x${i.qty})`).join(', ') : '-';
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html><head><title>Invoice ${inv.invoiceNumber}</title>
    <style>body{font-family:sans-serif;padding:2rem;} .header{border-bottom:2px solid #333;padding-bottom:1rem;margin-bottom:2rem;} .total{font-size:1.5rem;font-weight:bold;margin-top:2rem;}</style>
    </head><body>
      <div class="header">
        <h1>INVOICE</h1>
        <p><strong>No:</strong> ${inv.invoiceNumber}</p>
        <p><strong>Tanggal:</strong> ${new Date(inv.createdAt).toLocaleDateString()}</p>
      </div>
      <div class="content">
        <h3>Detail Pesanan:</h3>
        <p>${itemsStr}</p>
        <div class="total">Total: ${formatRupiah(inv.total)}</div>
      </div>
    </body></html>
  `);
  printWindow.document.close();
  printWindow.print();
}

function renderPurchaseOrders() {
  // Update Real-time stats
  let totalPO = 0, received = 0, shipped = 0, totalValue = 0;
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  allPurchaseOrders.forEach(o => {
    const d = new Date(o.createdAt);
    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
      totalPO++;
      if (o.status === 'received') received++;
      else if (o.status === 'shipped') shipped++;
      totalValue += (o.total || 0);
    }
  });

  const elTotal = document.getElementById('poStatTotal');
  const elReceived = document.getElementById('poStatReceived');
  const elShipped = document.getElementById('poStatShipped');
  const elValue = document.getElementById('poStatValue');
  
  if (elTotal) elTotal.textContent = totalPO;
  if (elReceived) elReceived.textContent = received;
  if (elShipped) elShipped.textContent = shipped;
  if (elValue) elValue.textContent = formatRupiah(totalValue);

  const tbody = document.getElementById('purchaseOrdersBody');
  if (!allPurchaseOrders.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">📭</div><h3>Belum ada PO</h3></div></td></tr>`; return; }
  tbody.innerHTML = allPurchaseOrders.map(d => {
    const date = new Date(d.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const sColor = d.status === 'received' ? 'success' : (d.status === 'shipped' ? 'info' : 'warning');
    const sLabel = d.status === 'received' ? 'Diterima' : (d.status === 'shipped' ? 'Dikirim' : 'Menunggu');
    
    const editBtn = d.status !== 'received' 
      ? `<button class="btn-icon edit" onclick="openEditPurchaseStatusModal('${d.id}', '${d.status}')" title="Ubah Status">✏️</button>` 
      : '';

    return `<tr><td><span style="font-weight:600">${escapeHtml(d.poNumber)}</span></td><td>${escapeHtml(d.supplierName)}</td><td>${date}</td>
    <td class="price-text">${formatRupiah(d.total)}</td><td><span class="badge badge-${sColor}">${sLabel}</span></td>
    <td class="admin-only"><div class="cell-actions">${editBtn}<button class="btn-icon delete" onclick="openDeleteConfirm('${d.id}', '${d.poNumber}', 'purchaseOrders')" title="Hapus">🗑️</button></div></td>
    </tr>`;
  }).join('');
}

function renderSuppliers() {
  const tbody = document.getElementById('suppliersBody');
  if (!allSuppliers.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">📭</div><h3>Belum ada supplier</h3></div></td></tr>`; return; }
  tbody.innerHTML = allSuppliers.map(d => `<tr>
    <td style="font-weight:600">${escapeHtml(d.name)}</td><td>${escapeHtml(d.contactPerson)}</td><td>${escapeHtml(d.email)}</td>
    <td>${escapeHtml(d.address)}</td><td>${d.totalPO || 0}</td>
    <td class="admin-only"><div class="cell-actions"><button class="btn-icon delete" onclick="openDeleteConfirm('${d.id}', '${escapeHtml(d.name)}', 'suppliers')" title="Hapus">🗑️</button></div></td>
  </tr>`).join('');
}

function renderBills() {
  const tbody = document.getElementById('billsBody');
  if (!allBills.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">📭</div><h3>Belum ada tagihan</h3></div></td></tr>`; return; }
  tbody.innerHTML = allBills.map(d => {
    const date = new Date(d.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const sColor = d.status === 'paid' ? 'success' : 'warning';
    const sLabel = d.status === 'paid' ? 'Lunas' : 'Belum Bayar';
    return `<tr><td><span style="font-weight:600">${escapeHtml(d.billNumber)}</span></td><td>${escapeHtml(d.supplierName)}</td>
    <td>${date}</td><td>${d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '-'}</td>
    <td class="price-text">${formatRupiah(d.total)}</td><td><span class="badge badge-${sColor}">${sLabel}</span></td></tr>`;
  }).join('');
}

function renderDocuments() {
  const tbody = document.getElementById('documentsBody');
  if (!allDocuments.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">📭</div><h3>Belum ada dokumen</h3></div></td></tr>`; return; }
  tbody.innerHTML = allDocuments.map(d => `<tr>
    <td style="font-weight:600">📄 <a href="${d.url}" target="_blank" class="document-link">${escapeHtml(d.name)}</a></td><td><span class="badge badge-info">${escapeHtml(d.type)}</span></td>
    <td>${escapeHtml(d.size)}</td><td>${escapeHtml(d.uploaderName)}</td><td>${new Date(d.createdAt).toLocaleDateString()}</td>
    <td class="admin-only"><div class="cell-actions"><button class="btn-icon delete" onclick="openDeleteConfirm('${d.id}', '${escapeHtml(d.name)}', 'documents')" title="Hapus">🗑️</button></div></td>
  </tr>`).join('');
}

function renderIntegrations() {
  const integrations = [
    { icon: '🔥', name: 'Firebase', desc: 'Real-time database & authentication', status: 'connected', bg: 'rgba(255,170,0,0.12)' },
    { icon: '📧', name: 'Email SMTP', desc: 'Kirim notifikasi email otomatis', status: 'available', bg: 'rgba(0,180,216,0.12)' },
    { icon: '💬', name: 'WhatsApp API', desc: 'Notifikasi pesanan via WhatsApp', status: 'available', bg: 'rgba(0,214,143,0.12)' },
    { icon: '💳', name: 'Payment Gateway', desc: 'Terima pembayaran online', status: 'available', bg: 'rgba(108,92,231,0.12)' },
    { icon: '📊', name: 'Analytics', desc: 'Tracking pengunjung', status: 'available', bg: 'rgba(255,71,87,0.12)' },
    { icon: '🚚', name: 'Shipping API', desc: 'Cek ongkir', status: 'available', bg: 'rgba(168,85,247,0.12)' }
  ];
  document.getElementById('integrationsGrid').innerHTML = integrations.map(i => `
    <div class="integration-card"><div class="integration-icon" style="background:${i.bg}">${i.icon}</div>
    <div class="integration-content"><h4>${i.name}</h4><p>${i.desc}</p><span class="integration-status ${i.status}">${i.status === 'connected' ? '✅ Connected' : '⚪ Available'}</span></div></div>
  `).join('');
}

function renderChannels() {
  const channels = [
    { icon: '🟢', name: 'Tokopedia', desc: 'Marketplace', orders: 0, revenue: 'Rp 0', bg: 'rgba(0,214,143,0.12)' },
    { icon: '🟠', name: 'Shopee', desc: 'Marketplace', orders: 0, revenue: 'Rp 0', bg: 'rgba(255,170,0,0.12)' },
    { icon: '🔵', name: 'Lazada', desc: 'Platform online', orders: 0, revenue: 'Rp 0', bg: 'rgba(0,180,216,0.12)' },
    { icon: '🌐', name: 'Website', desc: 'Toko sendiri', orders: allSalesOrders.length, revenue: formatRupiah(allSalesOrders.reduce((a, b) => a + (b.total || 0), 0)), bg: 'rgba(108,92,231,0.12)' }
  ];
  document.getElementById('channelsGrid').innerHTML = channels.map(c => `
    <div class="channel-card"><div class="channel-icon" style="background:${c.bg}">${c.icon}</div>
    <div class="channel-content"><h4>${c.name}</h4><p>${c.desc}</p><div class="channel-stats">
    <div class="channel-stat"><div class="channel-stat-value">${c.orders}</div><div class="channel-stat-label">Orders</div></div>
    <div class="channel-stat"><div class="channel-stat-value">${c.revenue}</div><div class="channel-stat-label">Revenue</div></div>
    </div></div></div>
  `).join('');
}

// ============ RE-COMPUTED CHARTS (REAL DATA) ============

function initCharts() {
  Chart.defaults.color = '#a0a0b8';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
  Chart.defaults.font.family = "'Inter', sans-serif";

  // Sales Trend Chart
  const salesCtx = document.getElementById('salesChart');
  if (salesCtx) {
    chartInstances.sales = new Chart(salesCtx, {
      type: 'line', data: {
        labels: [], datasets: [
          { label: 'Penjualan', data: [], borderColor: '#6c5ce7', backgroundColor: 'rgba(108, 92, 231, 0.1)', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 4 },
          { label: 'Pembelian', data: [], borderColor: '#00b4d8', backgroundColor: 'rgba(0, 180, 216, 0.08)', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatRupiah(ctx.parsed.y)}` } }
        }, scales: { y: { ticks: { callback: v => formatRupiah(v), font: { size: 10 } } }, x: { grid: { display: false } } }
      }
    });
  }

  // Category Chart
  const catCtx = document.getElementById('categoryChart');
  if (catCtx) {
    chartInstances.category = new Chart(catCtx, {
      type: 'doughnut', data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: 'rgba(15, 15, 26, 0.8)', borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 10 } } } } }
    });
  }

  // Revenue vs Expense Chart
  const revCtx = document.getElementById('revenueChart');
  if (revCtx) {
    chartInstances.revenue = new Chart(revCtx, {
      type: 'bar', data: {
        labels: [], datasets: [
          { label: 'Pendapatan', data: [], backgroundColor: 'rgba(108, 92, 231, 0.7)', borderRadius: 6 },
          { label: 'Pengeluaran', data: [], backgroundColor: 'rgba(0, 180, 216, 0.7)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: {
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatRupiah(ctx.parsed.y)}` } }
        }, scales: { y: { ticks: { callback: v => formatRupiah(v) } }, x: { grid: { display: false } } }
      }
    });
  }

  // Stock Chart (Bar - Top 5 Products)
  const stockCtx = document.getElementById('stockChart');
  if (stockCtx) {
    chartInstances.stock = new Chart(stockCtx, {
      type: 'bar', data: { labels: [], datasets: [{ label: 'Stok', data: [], backgroundColor: [], borderRadius: 6 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: true }, y: { display: true } } }
    });
  }

  // Stock Level Distribution Chart (Doughnut)
  const stockLevelCtx = document.getElementById('stockLevelChart');
  if (stockLevelCtx) {
    chartInstances.stockLevel = new Chart(stockLevelCtx, {
      type: 'doughnut', data: { labels: ['Stok Cukup', 'Stok Rendah', 'Habis'], datasets: [{ data: [0, 0, 0], backgroundColor: ['#00d68f', '#ffaa00', '#ff4757'], borderColor: 'rgba(15, 15, 26, 0.8)', borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 10 } } } } }
    });
  }

  // Categories Page Chart (Doughnut)
  const catPageCtx = document.getElementById('categoriesPageChart');
  if (catPageCtx) {
    chartInstances.categoriesPage = new Chart(catPageCtx, {
      type: 'doughnut', data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: 'rgba(15, 15, 26, 0.8)', borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, font: { size: 10 } } } } }
    });
  }

  // --- REPORT SECTION CHARTS ---
  const reportSalesCtx = document.getElementById('reportSalesChart');
  if (reportSalesCtx) {
    chartInstances.reportSales = new Chart(reportSalesCtx, {
      type: 'bar', data: { labels: [], datasets: [{ label: 'Penjualan', data: [], backgroundColor: 'rgba(108, 92, 231, 0.8)', borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => formatRupiah(v) } } } }
    });
  }

  const reportPurchaseCtx = document.getElementById('reportPurchaseChart');
  if (reportPurchaseCtx) {
    chartInstances.reportPurchase = new Chart(reportPurchaseCtx, {
      type: 'bar', data: { labels: [], datasets: [{ label: 'Pembelian', data: [], backgroundColor: 'rgba(0, 180, 216, 0.8)', borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => formatRupiah(v) } } } }
    });
  }

  const reportProfitCtx = document.getElementById('reportProfitChart');
  if (reportProfitCtx) {
    chartInstances.reportProfit = new Chart(reportProfitCtx, {
      type: 'line', data: { labels: [], datasets: [{ label: 'P/L Bersih', data: [], borderColor: '#00d68f', backgroundColor: 'rgba(0, 214, 143, 0.2)', fill: true, tension: 0.3, borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => formatRupiah(v) } } } }
    });
  }

  const reportStockCtx = document.getElementById('reportStockChart');
  if (reportStockCtx) {
    chartInstances.reportStock = new Chart(reportStockCtx, {
      type: 'line', data: { labels: [], datasets: [{ label: 'Pergerakan Nilai Stok', data: [], borderColor: '#ffaa00', backgroundColor: 'rgba(255, 170, 0, 0.2)', fill: true, tension: 0.3, borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => formatRupiah(v) } } } }
    });
  }
}

function updateDashboardCharts() {
  if (!chartInstances.category || allProducts.length === 0) return;
  const catCount = {}; allProducts.forEach(p => { catCount[p.category] = (catCount[p.category] || 0) + 1; });
  const labels = Object.keys(catCount);
  const colors = ['#6c5ce7', '#a855f7', '#00b4d8', '#00d68f', '#ffaa00', '#ff4757', '#48cae4'];
  chartInstances.category.data.labels = labels;
  chartInstances.category.data.datasets[0].data = Object.values(catCount);
  chartInstances.category.data.datasets[0].backgroundColor = colors.slice(0, labels.length);
  chartInstances.category.update();

  if (chartInstances.stock && allProducts.length > 0) {
    const sorted = [...allProducts].sort((a, b) => (b.stock || 0) - (a.stock || 0)).slice(0, 5);
    chartInstances.stock.data.labels = sorted.map(p => p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name);
    chartInstances.stock.data.datasets[0].data = sorted.map(p => p.stock || 0);
    chartInstances.stock.data.datasets[0].backgroundColor = colors.slice(0, sorted.length);
    chartInstances.stock.update();
  }

  if (chartInstances.stockLevel && allProducts.length > 0) {
    let cukup = 0, rendah = 0, habis = 0;
    allProducts.forEach(p => {
      const stock = p.stock || 0;
      if (stock === 0) habis++;
      else if (stock <= 10) rendah++;
      else cukup++;
    });
    chartInstances.stockLevel.data.datasets[0].data = [cukup, rendah, habis];
    chartInstances.stockLevel.update();
  }
  if (chartInstances.categoriesPage) {
    chartInstances.categoriesPage.data.labels = labels;
    chartInstances.categoriesPage.data.datasets[0].data = Object.values(catCount);
    chartInstances.categoriesPage.data.datasets[0].backgroundColor = colors.slice(0, labels.length);
    chartInstances.categoriesPage.update();
  }

  // Populate Categories Grid
  const catGrid = document.getElementById('categoriesGrid');
  if (catGrid && allProducts.length > 0) {
    const catStats = {};
    allProducts.forEach(p => {
      const c = p.category || 'Lainnya';
      if (!catStats[c]) catStats[c] = { count: 0, stock: 0, value: 0 };
      catStats[c].count++;
      catStats[c].stock += (p.stock || 0);
      catStats[c].value += (p.price || 0) * (p.stock || 0);
    });
    
    // Use .stats-grid-like styling for category cards
    catGrid.className = 'stats-grid mt-2';
    catGrid.innerHTML = Object.keys(catStats).map((c, i) => `
      <div class="stat-card" style="border-top: 3px solid ${colors[i % colors.length]}">
        <div class="stat-header">
          <div class="stat-icon">${getCategoryEmoji(c)}</div>
          <span class="stat-label">${escapeHtml(c)}</span>
        </div>
        <div class="stat-value">${catStats[c].count} <span style="font-size: 0.9rem; color: #a0a0b8; font-weight: normal;">Produk</span></div>
        <div class="stat-change" style="display: flex; justify-content: space-between; margin-top: 10px;">
          <span>Stok: ${catStats[c].stock}</span>
          <span style="color: #6c5ce7; font-weight: 500;">${formatRupiah(catStats[c].value)}</span>
        </div>
      </div>
    `).join('');
  }
}

function updateSalesChart() {
  if (!chartInstances.sales || !chartInstances.revenue) return;
  const filter = document.getElementById('salesChartFilter');
  const months = filter ? parseInt(filter.value) : 6;

  // Real data grouping by month
  const salesByMonth = {}; const purchasesByMonth = {};
  const today = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const m = d.toLocaleDateString('id-ID', { month: 'short' });
    salesByMonth[m] = 0; purchasesByMonth[m] = 0;
  }

  allSalesOrders.forEach(o => {
    const d = new Date(o.createdAt);
    const m = d.toLocaleDateString('id-ID', { month: 'short' });
    if (salesByMonth[m] !== undefined) salesByMonth[m] += o.total || 0;
  });

  allPurchaseOrders.forEach(o => {
    const d = new Date(o.createdAt);
    const m = d.toLocaleDateString('id-ID', { month: 'short' });
    if (purchasesByMonth[m] !== undefined) purchasesByMonth[m] += o.total || 0;
  });

  chartInstances.sales.data.labels = Object.keys(salesByMonth);
  chartInstances.sales.data.datasets[0].data = Object.values(salesByMonth);
  chartInstances.sales.data.datasets[1].data = Object.values(purchasesByMonth);
  chartInstances.sales.update();

  chartInstances.revenue.data.labels = Object.keys(salesByMonth);
  chartInstances.revenue.data.datasets[0].data = Object.values(salesByMonth);
  chartInstances.revenue.data.datasets[1].data = Object.values(purchasesByMonth);
  chartInstances.revenue.update();

  // Update Report Charts
  if (chartInstances.reportSales && chartInstances.reportPurchase && chartInstances.reportProfit) {
    const labels = Object.keys(salesByMonth);
    const salesData = Object.values(salesByMonth);
    const purchaseData = Object.values(purchasesByMonth);
    const profitData = salesData.map((s, i) => s - purchaseData[i]);

    chartInstances.reportSales.data.labels = labels;
    chartInstances.reportSales.data.datasets[0].data = salesData;
    chartInstances.reportSales.update();

    chartInstances.reportPurchase.data.labels = labels;
    chartInstances.reportPurchase.data.datasets[0].data = purchaseData;
    chartInstances.reportPurchase.update();

    chartInstances.reportProfit.data.labels = labels;
    chartInstances.reportProfit.data.datasets[0].data = profitData;
    chartInstances.reportProfit.update();

    // Pergerakan Nilai Stok (Simple Cumulative Simulation based on Initial Stock Value vs Sales/Purchases)
    if (chartInstances.reportStock) {
      let currentTotalStockValue = 0;
      allProducts.forEach(p => currentTotalStockValue += (p.price || 0) * (p.stock || 0));
      // Simulate historical by working backwards: if we sold stuff, stock value was higher before. 
      // If we purchased, it was lower before. Very basic approximation.
      const stockMovement = [];
      let runningVal = currentTotalStockValue;
      for (let i = profitData.length - 1; i >= 0; i--) {
         stockMovement.unshift(runningVal);
         runningVal = runningVal + salesData[i] - purchaseData[i]; // Reverse flow
      }
      chartInstances.reportStock.data.labels = labels;
      chartInstances.reportStock.data.datasets[0].data = stockMovement;
      chartInstances.reportStock.update();
    }
  }
}

// ============ DROPDOWN POPULATORS ============
function populateProductDropdown(selectId) {
  const el = document.getElementById(selectId);
  if (el) {
    el.innerHTML = '<option value="">Pilih Produk</option>' + allProducts.map(p => `<option value="${p.id}" data-price="${p.price}" data-stock="${p.stock || 0}">[Stok: ${p.stock || 0}] ${escapeHtml(p.name)} - ${formatRupiah(p.price)}</option>`).join('');
    // Initialize or re-initialize Select2
    if ($.fn.select2) {
      $(`#${selectId}`).select2({
        dropdownParent: $(`#${selectId}`).closest('.modal'),
        width: '100%',
        placeholder: "Cari produk..."
      }).on('change', function() {
        if(selectId === 'salesProduct') calculateSalesTotal();
        if(selectId === 'purchaseProduct') calculatePurchaseTotal();
      });
    }
  }
}

function populateSuppliersDropdown() {
  const el = document.getElementById('purchaseSupplier');
  if (el) el.innerHTML = '<option value="">Pilih Supplier</option>' + allSuppliers.map(s => `<option value="${s.name}">${escapeHtml(s.name)}</option>`).join('');
}
function calculateSalesTotal() {
  const select = document.getElementById('salesProduct');
  const qtyInput = document.getElementById('salesQty');
  let qty = parseInt(qtyInput.value) || 0;
  
  if (!select.value) { document.getElementById('salesTotal').value = 0; return; }
  
  const selectedOption = select.options[select.selectedIndex];
  const price = parseInt(selectedOption.dataset.price) || 0;
  const maxStock = parseInt(selectedOption.dataset.stock) || 0;
  
  qtyInput.max = maxStock;
  
  if (qty > maxStock) {
    qty = maxStock;
    qtyInput.value = maxStock;
    showToast('Peringatan', 'Jumlah pesanan melebihi stok yang tersedia (' + maxStock + ')', 'warning');
  }
  
  document.getElementById('salesTotal').value = price * qty;
}
function calculatePurchaseTotal() {
  const select = document.getElementById('purchaseProduct');
  const qty = parseInt(document.getElementById('purchaseQty').value) || 0;
  if (!select.value) { document.getElementById('purchaseTotal').value = 0; return; }
  const price = parseInt(select.options[select.selectedIndex].dataset.price) || 0;
  document.getElementById('purchaseTotal').value = price * qty;
}

// ============ PRODUCT FILTERS ============
function updateCategoryFilter() {
  const filter = document.getElementById('categoryFilter');
  const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
  const current = filter.value;
  filter.innerHTML = '<option value="all">Semua Kategori</option>' + categories.map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
}
function filterProducts() {
  const cat = document.getElementById('categoryFilter').value;
  renderAllProducts(cat !== 'all' ? allProducts.filter(p => p.category === cat) : allProducts);
}
function handleSearch(query) {
  if (!query.trim()) { renderProducts(); return; }
  const q = query.toLowerCase();
  renderAllProducts(allProducts.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q))));
  if (!document.getElementById('sectionProducts').classList.contains('active')) showSection('products');
}

// ============ MODAL LOGIC (Products, Sales, Purchasing, Users) ============

function openProductModal(product = null) {
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('productModalTitle').textContent = product ? 'Edit Produk' : 'Tambah Produk';
  
  if (product) {
    document.getElementById('productId').value = product.id; document.getElementById('productName').value = product.name || '';
    document.getElementById('productSku').value = product.sku || ''; document.getElementById('productCategory').value = product.category || '';
    document.getElementById('productPrice').value = product.price || ''; document.getElementById('productStock').value = product.stock || '';
    document.getElementById('productUnit').value = product.unit || 'pcs'; document.getElementById('productDescription').value = product.description || '';
  } else {
    // Generate random 12-digit SKU: '8' + 11 random digits to ensure it's always 12 digits (doesn't start with 0)
    const random12Digit = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    document.getElementById('productSku').value = random12Digit;
  }
  
  document.getElementById('productModal').classList.add('active');
}
function closeProductModal() { document.getElementById('productModal').classList.remove('active'); }
function openEditProduct(id) { const p = allProducts.find(x => x.id === id); if (p) openProductModal(p); }

async function handleProductSubmit(e) {
  e.preventDefault(); const id = document.getElementById('productId').value; const btn = document.getElementById('productSubmitBtn'); btn.disabled = true;
  const data = {
    name: document.getElementById('productName').value.trim(), sku: document.getElementById('productSku').value.trim(),
    category: document.getElementById('productCategory').value, price: Number(document.getElementById('productPrice').value),
    stock: Number(document.getElementById('productStock').value), unit: document.getElementById('productUnit').value, description: document.getElementById('productDescription').value.trim()
  };
  try { id ? await API.products.update(id, data) : await API.products.create(data); showToast('Berhasil', 'Produk tersimpan', 'success'); closeProductModal(); }
  catch (err) { showToast('Error', err.message, 'error'); } finally { btn.disabled = false; }
}

// SALES MODAL
function openSalesModal() {
  document.getElementById('salesForm').reset(); document.getElementById('salesId').value = '';
  document.getElementById('salesNumber').value = 'SO-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  populateProductDropdown('salesProduct');
  // Reset select2 value
  if ($.fn.select2) $('#salesProduct').val(null).trigger('change');
  
  document.getElementById('salesModal').classList.add('active');
}
function closeSalesModal() { document.getElementById('salesModal').classList.remove('active'); }

async function handleSalesSubmit(e) {
  e.preventDefault(); const btn = document.getElementById('salesSubmitBtn'); btn.disabled = true;
  const productSelect = document.getElementById('salesProduct');
  const selectedOption = productSelect.options[productSelect.selectedIndex];
  const productId = productSelect.value;
  
  let productName = selectedOption.text.split(' - ')[0];
  productName = productName.replace(/^\[Stok:\s*\d+\]\s*/, '');
  
  const qty = parseInt(document.getElementById('salesQty').value) || 1;
  const maxStock = parseInt(selectedOption.dataset.stock) || 0;

  if (qty > maxStock) {
    showToast('Error', 'Pesanan gagal: jumlah melebih stok tersedia (' + maxStock + ')', 'error');
    btn.disabled = false;
    return;
  }

  const data = {
    orderNumber: document.getElementById('salesNumber').value.trim(),
    items: [{ productId, productName, qty }],
    total: Number(document.getElementById('salesTotal').value),
    status: document.getElementById('salesStatus').value,
    notes: document.getElementById('salesNotes').value.trim()
  };
  try {
    await API.sales.createOrder(data);
    // Deduct stock locally via API
    const p = allProducts.find(x => x.id === productId);
    if (p) await API.products.update(productId, { stock: Math.max(0, p.stock - qty) });
    showToast('Berhasil', 'Pesanan dibuat', 'success'); closeSalesModal();
  }
  catch (err) { showToast('Error', err.message, 'error'); } finally { btn.disabled = false; }
}

// EDIT SALES STATUS MODAL
function openEditStatusModal(id, currentStatus) {
  document.getElementById('editStatusOrderId').value = id;
  document.getElementById('editStatusSelect').value = currentStatus;
  document.getElementById('editStatusModal').classList.add('active');
}

function closeEditStatusModal() {
  document.getElementById('editStatusModal').classList.remove('active');
}

async function handleEditStatusSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('editStatusSubmitBtn');
  btn.disabled = true;

  const orderId = document.getElementById('editStatusOrderId').value;
  const newStatus = document.getElementById('editStatusSelect').value;

  try {
    await API.sales.updateOrder(orderId, { status: newStatus });
    showToast('Berhasil', 'Status pesanan diperbarui', 'success');
    closeEditStatusModal();
  } catch (error) {
    showToast('Error', error.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// PURCHASE MODAL
function openPurchaseModal() {
  document.getElementById('purchaseForm').reset(); document.getElementById('purchaseId').value = '';
  document.getElementById('purchaseNumber').value = 'PO-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  populateProductDropdown('purchaseProduct');
  document.getElementById('purchaseModal').classList.add('active');
}
function closePurchaseModal() { document.getElementById('purchaseModal').classList.remove('active'); }
async function handlePurchaseSubmit(e) {
  e.preventDefault(); const btn = document.getElementById('purchaseSubmitBtn'); btn.disabled = true;
  const productSelect = document.getElementById('purchaseProduct');
  const productId = productSelect.value;
  
  let productName = productSelect.options[productSelect.selectedIndex].text.split(' - ')[0];
  productName = productName.replace(/^\[Stok:\s*\d+\]\s*/, '');
  
  const qty = parseInt(document.getElementById('purchaseQty').value) || 1;
  const status = document.getElementById('purchaseStatus').value;

  const data = {
    poNumber: document.getElementById('purchaseNumber').value.trim(), supplierName: document.getElementById('purchaseSupplier').value,
    items: [{ productId, productName, qty }],
    total: Number(document.getElementById('purchaseTotal').value), status, notes: document.getElementById('purchaseNotes').value.trim()
  };
  try {
    await API.purchases.createOrder(data);
    // Increase stock if received immediately
    if (status === 'received') {
      const p = allProducts.find(x => x.id === productId);
      if (p) await API.products.update(productId, { stock: p.stock + qty });
    }
    showToast('Berhasil', 'PO dibuat', 'success'); closePurchaseModal();
  }
  catch (err) { showToast('Error', err.message, 'error'); } finally { btn.disabled = false; }
}

// EDIT PURCHASE STATUS MODAL
function openEditPurchaseStatusModal(id, currentStatus) {
  document.getElementById('editPurchaseStatusOrderId').value = id;
  document.getElementById('editPurchaseStatusSelect').value = currentStatus;
  document.getElementById('editPurchaseStatusModal').classList.add('active');
}

function closeEditPurchaseStatusModal() {
  document.getElementById('editPurchaseStatusModal').classList.remove('active');
}

async function handleEditPurchaseStatusSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('editPurchaseStatusSubmitBtn');
  btn.disabled = true;

  const orderId = document.getElementById('editPurchaseStatusOrderId').value;
  const newStatus = document.getElementById('editPurchaseStatusSelect').value;

  try {
    const order = allPurchaseOrders.find(o => o.id === orderId);
    if (!order) throw new Error('Order tidak ditemukan');

    const oldStatus = order.status;
    await API.purchases.updateOrder(orderId, { status: newStatus });
    
    // Update local stock via API if status changed
    if (oldStatus !== 'received' && newStatus === 'received') {
      // Products arrived: ADD stock
      if (order.items && order.items.length) {
        for (const item of order.items) {
          const p = allProducts.find(x => x.id === item.productId);
          if (p) await API.products.update(p.id, { stock: p.stock + item.qty });
        }
      }
    } else if (oldStatus === 'received' && newStatus !== 'received') {
      // Reverted from arrived: SUBTRACT stock
      if (order.items && order.items.length) {
        for (const item of order.items) {
          const p = allProducts.find(x => x.id === item.productId);
          if (p) {
             const newStock = Math.max(0, p.stock - item.qty);
             await API.products.update(p.id, { stock: newStock });
          }
        }
      }
    }

    // Direct Frontend Sync for Bills (Bypassing the need for backend restart)
    const targetBillStatus = newStatus === 'received' ? 'paid' : 'unpaid';
    const linkedBills = allBills.filter(b => b.poId === orderId);
    for (const bill of linkedBills) {
      if (bill.status !== targetBillStatus) {
        await API.purchases.updateBill(bill.id, { status: targetBillStatus });
      }
    }

    showToast('Berhasil', 'Status PO diperbarui', 'success');
    closeEditPurchaseStatusModal();
  } catch (error) {
    showToast('Error', error.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// SUPPLIER MODAL
function openSupplierModal() { document.getElementById('supplierForm').reset(); document.getElementById('supplierId').value = ''; document.getElementById('supplierModal').classList.add('active'); }
function closeSupplierModal() { document.getElementById('supplierModal').classList.remove('active'); }
async function handleSupplierSubmit(e) {
  e.preventDefault(); const btn = document.getElementById('supplierSubmitBtn'); btn.disabled = true;
  const data = {
    name: document.getElementById('supplierName').value.trim(), contactPerson: document.getElementById('supplierContact').value.trim(),
    email: document.getElementById('supplierEmail').value.trim(), phone: document.getElementById('supplierPhone').value.trim(), address: document.getElementById('supplierAddress').value.trim()
  };
  try { await API.suppliers.create(data); showToast('Berhasil', 'Supplier disimpan', 'success'); closeSupplierModal(); }
  catch (err) { showToast('Error', err.message, 'error'); } finally { btn.disabled = false; }
}

// DOCUMENT MODAL
function openDocumentModal() {
  document.getElementById('documentForm').reset();
  document.getElementById('documentModal').classList.add('active');
}
function closeDocumentModal() { document.getElementById('documentModal').classList.remove('active'); }

async function handleDocumentSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('documentSubmitBtn');
  const fileInput = document.getElementById('documentFile');
  const nameInput = document.getElementById('documentNameDisplay');
  
  if (!fileInput.files.length) return;
  
  btn.disabled = true;
  btn.textContent = 'Uploading...';
  
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  if (nameInput.value.trim()) {
    formData.append('customName', nameInput.value.trim());
  }

  try {
    await API.documents.upload(formData);
    showToast('Berhasil', 'Dokumen berhasil diunggah', 'success');
    closeDocumentModal();
  } catch (err) {
    showToast('Error', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload';
  }
}

// ============ DELETE ITEMS ============

function openDeleteConfirm(id, name, collection) {
  deleteTargetId = id; deleteTargetCollection = collection;
  document.getElementById('confirmMessage').textContent = `Apakah Anda yakin ingin menghapus "${name}"?`;
  document.getElementById('confirmModal').classList.add('active');
}
function closeConfirmModal() { document.getElementById('confirmModal').classList.remove('active'); deleteTargetId = null; deleteTargetCollection = null; }

async function confirmDelete() {
  if (!deleteTargetId || !deleteTargetCollection) return;
  const btn = document.getElementById('confirmDeleteBtn'); btn.disabled = true; btn.textContent = 'Menghapus...';
  try {
    if (deleteTargetCollection === 'products') await API.products.delete(deleteTargetId);
    else if (deleteTargetCollection === 'salesOrders') await API.sales.deleteOrder(deleteTargetId);
    else if (deleteTargetCollection === 'purchaseOrders') await API.purchases.deleteOrder(deleteTargetId);
    else if (deleteTargetCollection === 'suppliers') await API.suppliers.delete(deleteTargetId);
    else if (deleteTargetCollection === 'documents') await API.documents.delete(deleteTargetId);

    showToast('Berhasil', 'Item berhasil dihapus', 'success'); closeConfirmModal();
  } catch (error) { showToast('Error', error.message, 'error'); } finally { btn.disabled = false; btn.textContent = 'Hapus'; }
}

// ============ USER MANAGEMENT (Admin) ============

async function loadUsers() {
  const container = document.getElementById('usersContainer'); container.innerHTML = '<p class="text-muted" style="text-align:center;padding:2rem;">Memuat data user...</p>';
  try {
    const result = await API.auth.getUsers(); const users = result.data || [];
    if (!users.length) { container.innerHTML = '<p class="text-muted" style="text-align:center;padding:2rem;">Belum ada user.</p>'; return; }
    container.innerHTML = users.map(u => {
      const isSelf = u.uid === currentUser.uid; const ini = u.displayName ? u.displayName.substring(0, 2).toUpperCase() : 'U';
      return `<div class="user-card"><div class="user-card-header"><div class="user-card-avatar">${ini}</div><div class="user-card-info"><h4>${escapeHtml(u.displayName || 'Tanpa Nama')} ${isSelf ? '(Anda)' : ''}</h4><p>${escapeHtml(u.email)}</p></div></div>
      <div class="user-card-actions"><div style="display:flex;align-items:center;gap:0.5rem;"><span class="badge badge-role ${u.role}">${u.role}</span>
      ${!isSelf ? `<select class="role-select" onchange="changeUserRole('${u.uid}', this.value)"><option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select>` : ''}</div>
      ${!isSelf ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.uid}', '${escapeHtml(u.displayName)}')">🗑️ Hapus</button>` : ''}</div></div>`;
    }).join('');
  } catch (err) { container.innerHTML = '<p class="text-danger" style="text-align:center;padding:2rem;">Gagal memuat user.</p>'; }
}

async function changeUserRole(uid, role) { try { await API.auth.setRole(uid, role); showToast('Berhasil', `Role diperbarui`, 'success'); await loadUsers(); } catch (err) { showToast('Error', err.message, 'error'); await loadUsers(); } }
async function deleteUser(uid, name) { if (!confirm(`Hapus user "${name}"?`)) return; try { await API.auth.deleteUser(uid); showToast('Berhasil', 'User dihapus', 'success'); await loadUsers(); } catch (err) { showToast('Error', err.message, 'error'); } }

// ============ LOGOUT & UTILS ============

async function handleLogout() { try { Object.values(firestoreUnsubscribes).forEach(u => u()); await firebaseAuth.signOut(); } catch (e) { } window.location.href = '/'; }

function showToast(title, message, type = 'info') {
  const c = document.getElementById('toastContainer'); const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div'); toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(toast); setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 300); }, 4000);
}

function formatRupiah(num) {
  if (num >= 1000000000) return 'Rp ' + (num / 1000000000).toFixed(1) + 'M';
  if (num >= 1000000) return 'Rp ' + (num / 1000000).toFixed(1) + 'Jt';
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(num);
}
function escapeHtml(str) { if (!str) return ''; const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
