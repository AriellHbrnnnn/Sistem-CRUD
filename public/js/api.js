// ===========================================
// API Helper Functions
// ===========================================

const API = {
  // Base fetch wrapper with auth token
  async request(url, options = {}) {
    const token = await getCurrentToken();

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Request gagal');
      }

      return data;
    } catch (error) {
      console.error(`API Error [${url}]:`, error);
      throw error;
    }
  },

  // GET request
  async get(url) {
    return this.request(url, { method: 'GET' });
  },

  // POST request
  async post(url, body) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  // PUT request
  async put(url, body) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  // DELETE request
  async delete(url) {
    return this.request(url, { method: 'DELETE' });
  },

  // === Auth Endpoints ===
  auth: {
    getProfile() { return API.get('/api/auth/me'); },
    getUsers() { return API.get('/api/auth/users'); },
    setRole(uid, role) { return API.put('/api/auth/set-role', { uid, role }); },
    deleteUser(uid) { return API.delete(`/api/auth/users/${uid}`); }
  },

  // === Product Endpoints ===
  products: {
    getAll(params = '') { return API.get(`/api/products${params ? '?' + params : ''}`); },
    getStats() { return API.get('/api/products/stats'); },
    getOne(id) { return API.get(`/api/products/${id}`); },
    create(data) { return API.post('/api/products', data); },
    update(id, data) { return API.put(`/api/products/${id}`, data); },
    delete(id) { return API.delete(`/api/products/${id}`); }
  },

  // === Sales Endpoints ===
  sales: {
    getOrders() { return API.get('/api/sales/orders'); },
    getStats() { return API.get('/api/sales/stats'); },
    createOrder(data) { return API.post('/api/sales/orders', data); },
    updateOrder(id, data) { return API.put(`/api/sales/orders/${id}`, data); },
    deleteOrder(id) { return API.delete(`/api/sales/orders/${id}`); },
    getInvoices() { return API.get('/api/sales/invoices'); },
    updateInvoice(id, data) { return API.put(`/api/sales/invoices/${id}`, data); }
  },

  // === Purchases Endpoints ===
  purchases: {
    getOrders() { return API.get('/api/purchases/orders'); },
    getStats() { return API.get('/api/purchases/stats'); },
    createOrder(data) { return API.post('/api/purchases/orders', data); },
    updateOrder(id, data) { return API.put(`/api/purchases/orders/${id}`, data); },
    deleteOrder(id) { return API.delete(`/api/purchases/orders/${id}`); },
    getBills() { return API.get('/api/purchases/bills'); },
    updateBill(id, data) { return API.put(`/api/purchases/bills/${id}`, data); }
  },

  // === Customers Endpoints ===
  customers: {
    getAll() { return API.get('/api/customers'); },
    create(data) { return API.post('/api/customers', data); },
    update(id, data) { return API.put(`/api/customers/${id}`, data); },
    delete(id) { return API.delete(`/api/customers/${id}`); }
  },

  // === Suppliers Endpoints ===
  suppliers: {
    getAll() { return API.get('/api/suppliers'); },
    create(data) { return API.post('/api/suppliers', data); },
    update(id, data) { return API.put(`/api/suppliers/${id}`, data); },
    delete(id) { return API.delete(`/api/suppliers/${id}`); }
  },

  // === Documents Endpoints ===
  documents: {
    getAll() { return API.get('/api/documents'); },
    create(data) { return API.post('/api/documents', data); },
    upload(formData) { 
      return getCurrentToken().then(token => fetch('/api/documents', {
        method: 'POST',
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) },
        body: formData
      }).then(res => res.json())); 
    },
    delete(id) { return API.delete(`/api/documents/${id}`); }
  }
};
