// ===========================================
// Authentication Logic (Login & Register Page)
// ===========================================

document.addEventListener('DOMContentLoaded', async () => {
  const initialized = await initFirebase();

  if (!initialized) {
    showAuthMessage('Gagal menghubungkan ke Firebase. Periksa konfigurasi.');
    return;
  }

  // Check if already logged in
  firebaseAuth.onAuthStateChanged((user) => {
    if (user) {
      window.location.href = '/dashboard';
    }
  });
});

// Switch between Login and Register tabs
function switchTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const authMessage = document.getElementById('authMessage');

  // Clear message
  authMessage.className = 'form-message';
  authMessage.textContent = '';

  if (tab === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
  } else {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
  }
}

// Show message
function showAuthMessage(message, type = 'error') {
  const authMessage = document.getElementById('authMessage');
  authMessage.textContent = message;
  authMessage.className = `form-message ${type}`;
}

// Set button loading state
function setButtonLoading(btnId, textId, isLoading) {
  const btn = document.getElementById(btnId);
  const text = document.getElementById(textId);
  if (isLoading) {
    btn.disabled = true;
    text.innerHTML = '<span class="spinner"></span> Memproses...';
  } else {
    btn.disabled = false;
    text.textContent = btnId === 'loginBtn' ? 'Masuk' : 'Daftar';
  }
}

// Handle Login
async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showAuthMessage('Semua field wajib diisi.');
    return;
  }

  setButtonLoading('loginBtn', 'loginBtnText', true);

  try {
    const userCredential = await firebaseAuth.signInWithEmailAndPassword(email, password);
    console.log('Login berhasil:', userCredential.user.email);
    showAuthMessage('Login berhasil! Mengalihkan...', 'success');
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 500);
  } catch (error) {
    console.error('Login error:', error.code, error.message);
    let message = 'Login gagal. Silakan coba lagi.';
    switch (error.code) {
      case 'auth/user-not-found':
        message = 'Email tidak terdaftar.';
        break;
      case 'auth/wrong-password':
        message = 'Password salah.';
        break;
      case 'auth/invalid-credential':
        message = 'Email atau password salah.';
        break;
      case 'auth/invalid-email':
        message = 'Format email tidak valid.';
        break;
      case 'auth/too-many-requests':
        message = 'Terlalu banyak percobaan. Coba lagi nanti.';
        break;
      case 'auth/user-disabled':
        message = 'Akun ini telah dinonaktifkan.';
        break;
      default:
        message = `Login gagal: ${error.message}`;
    }
    showAuthMessage(message);
    setButtonLoading('loginBtn', 'loginBtnText', false);
  }
}

// Handle Register
async function handleRegister(event) {
  event.preventDefault();

  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

  if (!name || !email || !password || !passwordConfirm) {
    showAuthMessage('Semua field wajib diisi.');
    return;
  }

  if (password !== passwordConfirm) {
    showAuthMessage('Password dan konfirmasi password tidak cocok.');
    return;
  }

  if (password.length < 6) {
    showAuthMessage('Password minimal 6 karakter.');
    return;
  }

  setButtonLoading('registerBtn', 'registerBtnText', true);

  try {
    // Register via backend API (untuk set role di Firestore)
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName: name })
    });

    const data = await response.json();
    console.log('Register API response:', data);

    if (!data.success) {
      showAuthMessage(data.message);
      setButtonLoading('registerBtn', 'registerBtnText', false);
      return;
    }

    showAuthMessage('Akun berhasil dibuat! Melakukan login...', 'success');

    // Auto login setelah register menggunakan Firebase Client SDK
    try {
      await firebaseAuth.signInWithEmailAndPassword(email, password);
      console.log('Auto-login berhasil');
      showAuthMessage('Login berhasil! Mengalihkan ke dashboard...', 'success');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 800);
    } catch (loginError) {
      console.error('Auto-login error:', loginError.code, loginError.message);
      // Registrasi berhasil tapi auto-login gagal, arahkan user ke tab login
      showAuthMessage('Akun berhasil dibuat! Silakan login secara manual.', 'success');
      setButtonLoading('registerBtn', 'registerBtnText', false);
      setTimeout(() => {
        switchTab('login');
        document.getElementById('loginEmail').value = email;
      }, 1500);
    }
  } catch (error) {
    console.error('Register error:', error);
    showAuthMessage(`Gagal mendaftar: ${error.message || 'Silakan coba lagi.'}`);
    setButtonLoading('registerBtn', 'registerBtnText', false);
  }
}
