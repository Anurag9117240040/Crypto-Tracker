// Simple front-end authentication and admin analytics using localStorage.
// NOTE: This is for demo purposes only and is NOT secure for production use.

(function () {
  const USERS_KEY = 'ct_users';
  const SESSION_KEY = 'ct_session';
  const LOGS_KEY = 'ct_logs';
  const PREFS_KEY = 'ct_prefs';

  function nowIso() {
    return new Date().toISOString();
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // ignore
    }
  }

  function loadUsers() {
    const users = loadJson(USERS_KEY, []);
    if (!Array.isArray(users)) return [];
    return users;
  }

  function saveUsers(users) {
    saveJson(USERS_KEY, users);
  }

  function loadSession() {
    const s = loadJson(SESSION_KEY, null);
    return s && typeof s === 'object' ? s : null;
  }

  function saveSession(session) {
    if (!session) {
      localStorage.removeItem(SESSION_KEY);
    } else {
      saveJson(SESSION_KEY, session);
    }
  }

  function appendLog(entry) {
    const logs = loadJson(LOGS_KEY, []);
    if (!Array.isArray(logs)) return saveJson(LOGS_KEY, [entry]);
    logs.push(entry);
    saveJson(LOGS_KEY, logs);
  }

  function loadPrefs() {
    const prefs = loadJson(PREFS_KEY, {});
    return prefs && typeof prefs === 'object' ? prefs : {};
  }

  function savePrefs(prefs) {
    saveJson(PREFS_KEY, prefs || {});
  }

  function getPrefsForUser(email) {
    const all = loadPrefs();
    return (all && all[email]) || {};
  }

  function setPrefsForUser(email, userPrefs) {
    const all = loadPrefs();
    all[email] = Object.assign({}, getPrefsForUser(email), userPrefs);
    savePrefs(all);
    return all[email];
  }

  function applyThemeForCurrentUser() {
    const session = loadSession();
    const html = document.documentElement;
    if (!html) return;
    let mode = 'light';
    if (session && session.email) {
      const prefs = getPrefsForUser(session.email);
      if (prefs && prefs.colorMode === 'dark') mode = 'dark';
    }
    html.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
  }

  function updateProfile({ username, email }) {
    const session = loadSession();
    if (!session) throw new Error('Not authenticated.');
    const trimmedUser = String(username || '').trim();
    const trimmedEmail = String(email || '').trim().toLowerCase();
    if (!trimmedUser || !trimmedEmail) {
      throw new Error('Username and email are required.');
    }
    const users = loadUsers();
    const idx = users.findIndex((u) => u.email === session.email);
    if (idx === -1) throw new Error('User record not found.');
    if (trimmedEmail !== session.email && users.some((u) => u.email === trimmedEmail)) {
      throw new Error('Another account already uses this email.');
    }
    const updated = Object.assign({}, users[idx], {
      username: trimmedUser,
      email: trimmedEmail,
    });
    users[idx] = updated;
    saveUsers(users);
    saveSession({
      username: updated.username,
      email: updated.email,
      role: updated.role,
      loginAt: session.loginAt,
    });
    appendLog({ type: 'profile_update', at: nowIso(), user: updated.email });
    return updated;
  }

  function changePassword({ current, next }) {
    const session = loadSession();
    if (!session) throw new Error('Not authenticated.');
    const curr = String(current || '');
    const nxt = String(next || '');
    if (!curr || !nxt || nxt.length < 6) {
      throw new Error('Please provide your current password and a new password of at least 6 characters.');
    }
    const users = loadUsers();
    const idx = users.findIndex((u) => u.email === session.email);
    if (idx === -1) throw new Error('User record not found.');
    const user = users[idx];
    if (user.passwordHash !== hashPassword(curr)) {
      throw new Error('Current password is incorrect.');
    }
    user.passwordHash = hashPassword(nxt);
    users[idx] = user;
    saveUsers(users);
    appendLog({ type: 'password_change', at: nowIso(), user: user.email });
  }

  function hashPassword(pw) {
    // Lightweight obfuscation – not cryptographically secure.
    try {
      return btoa(String(pw));
    } catch (_) {
      return String(pw);
    }
  }

  function ensureSeedAdmin() {
    const users = loadUsers();
    const hasAdmin = users.some((u) => u && u.role === 'admin');
    if (!hasAdmin) {
      users.push({
        username: 'admin',
        email: 'admin@example.com',
        passwordHash: hashPassword('admin123'),
        role: 'admin',
        createdAt: nowIso(),
      });
      saveUsers(users);
      appendLog({ type: 'seed_admin', at: nowIso(), meta: { username: 'admin' } });
    }
  }

  function register({ username, email, password }) {
    const trimmedUser = String(username || '').trim();
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const pw = String(password || '');
    if (!trimmedUser || !trimmedEmail || pw.length < 6) {
      throw new Error('Please provide a username, email, and a password of at least 6 characters.');
    }
    const users = loadUsers();
    if (users.some((u) => u.email === trimmedEmail)) {
      throw new Error('An account with this email already exists.');
    }
    const user = {
      username: trimmedUser,
      email: trimmedEmail,
      passwordHash: hashPassword(pw),
      role: 'user',
      createdAt: nowIso(),
    };
    users.push(user);
    saveUsers(users);
    appendLog({ type: 'signup', at: nowIso(), user: trimmedEmail });
    return user;
  }

  function login({ identifier, password }) {
    const id = String(identifier || '').trim().toLowerCase();
    const pw = String(password || '');
    if (!id || !pw) {
      throw new Error('Please provide your email and password.');
    }
    const users = loadUsers();
    const user = users.find((u) => u.email === id || u.username.toLowerCase() === id);
    if (!user) {
      throw new Error('User not found.');
    }
    if (user.passwordHash !== hashPassword(pw)) {
      appendLog({ type: 'login_failed', at: nowIso(), user: id });
      throw new Error('Incorrect password.');
    }
    const session = {
      username: user.username,
      email: user.email,
      role: user.role,
      loginAt: nowIso(),
    };
    saveSession(session);
    appendLog({ type: 'login', at: nowIso(), user: user.email });
    return session;
  }

  function logout() {
    const session = loadSession();
    if (session && session.email) {
      appendLog({ type: 'logout', at: nowIso(), user: session.email });
    }
    saveSession(null);
  }

  function getLogs() {
    const logs = loadJson(LOGS_KEY, []);
    return Array.isArray(logs) ? logs : [];
  }

  function getUsers() {
    return loadUsers();
  }

  function getSession() {
    return loadSession();
  }

  function isAdmin() {
    const s = loadSession();
    return !!(s && s.role === 'admin');
  }

  // Attach helpers globally
  window.CTAuth = {
    register,
    login,
    logout,
    getLogs,
    getUsers,
    getSession,
    isAdmin,
    getPrefsForUser,
    setPrefsForUser,
    updateProfile,
    changePassword,
    applyThemeForCurrentUser,
  };

  // Initialize admin user and record page views
  ensureSeedAdmin();
  appendLog({ type: 'page_view', at: nowIso(), path: window.location.pathname });

  // Wire up nav auth button, theme, and page-specific logic
  document.addEventListener('DOMContentLoaded', () => {
    applyThemeForCurrentUser();

    const session = loadSession();
    const navAuthContainer = document.getElementById('nav-auth-container');
    const navAuthLink = document.getElementById('nav-auth-link');
    const navDropdown = document.getElementById('nav-profile-dropdown');

    if (navAuthLink && navAuthContainer) {
      if (session) {
        navAuthLink.textContent = session.username;
        navAuthLink.href = '#';
        navAuthLink.classList.add('profile-nav-toggle');

        if (navDropdown) {
          const isAdminUser = isAdmin();
          navDropdown.innerHTML = `
            <div class="dropdown-label">Account</div>
            <button type="button" data-action="go-profile">Profile & settings</button>
            ${isAdminUser ? '<button type="button" data-action="go-admin">Admin dashboard</button>' : ''}
            <hr>
            <button type="button" data-action="logout">Log out</button>
          `;

          navAuthLink.addEventListener('click', (e) => {
            e.preventDefault();
            navDropdown.classList.toggle('show');
          });

          navDropdown.addEventListener('click', (e) => {
            const action = e.target && e.target.getAttribute('data-action');
            if (!action) return;
            if (action === 'go-profile') {
              window.location.href = 'profile.html';
            } else if (action === 'go-admin') {
              window.location.href = 'admin.html';
            } else if (action === 'logout') {
              logout();
              window.location.href = 'login.html';
            }
          });

          document.addEventListener('click', (e) => {
            if (!navAuthContainer.contains(e.target)) {
              navDropdown.classList.remove('show');
            }
          });
        }
      } else {
        if (navDropdown) navDropdown.innerHTML = '';
        navAuthLink.textContent = 'Login / Sign Up';
        navAuthLink.href = 'login.html';
        navAuthLink.classList.remove('profile-nav-toggle');
      }
    }

    // Attach handlers for login / signup forms if present
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginError = document.getElementById('loginError');
    const signupError = document.getElementById('signupError');

    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (loginError) loginError.textContent = '';
        const idInput = loginForm.elements.identifier;
        const pwInput = loginForm.elements.password;
        try {
          const session = login({
            identifier: idInput && idInput.value,
            password: pwInput && pwInput.value,
          });
          // Redirect: admin -> admin dashboard, user -> home
          const params = new URLSearchParams(window.location.search);
          const redirect = params.get('redirect');
          if (redirect === 'admin' && session.role === 'admin') {
            window.location.href = 'admin.html';
          } else {
            window.location.href = 'index.html';
          }
        } catch (err) {
          if (loginError) {
            loginError.textContent = err.message || 'Login failed.';
          } else {
            alert(err.message || 'Login failed.');
          }
        }
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (signupError) signupError.textContent = '';
        const username = signupForm.elements.username && signupForm.elements.username.value;
        const email = signupForm.elements.email && signupForm.elements.email.value;
        const password = signupForm.elements.password && signupForm.elements.password.value;
        const confirm = signupForm.elements.confirm && signupForm.elements.confirm.value;
        if (password !== confirm) {
          if (signupError) {
            signupError.textContent = 'Passwords do not match.';
          } else {
            alert('Passwords do not match.');
          }
          return;
        }
        try {
          register({ username, email, password });
          // auto login after signup
          login({ identifier: email, password });
          window.location.href = 'index.html';
        } catch (err) {
          if (signupError) {
            signupError.textContent = err.message || 'Sign up failed.';
          } else {
            alert(err.message || 'Sign up failed.');
          }
        }
      });
    }

    // Admin page wiring
    const adminRoot = document.getElementById('admin-root');
    if (adminRoot) {
      const sessionNow = loadSession();
      if (!sessionNow || sessionNow.role !== 'admin') {
        const url = new URL('login.html', window.location.href);
        url.searchParams.set('redirect', 'admin');
        window.location.href = url.toString();
        return;
      }
      const users = getUsers();
      const logs = getLogs();

      const totalUsersEl = document.getElementById('stat-total-users');
      const totalLoginsEl = document.getElementById('stat-total-logins');
      const totalSignupsEl = document.getElementById('stat-total-signups');

      if (totalUsersEl) totalUsersEl.textContent = String(users.length);
      if (totalLoginsEl) {
        totalLoginsEl.textContent = String(logs.filter((l) => l.type === 'login').length);
      }
      if (totalSignupsEl) {
        totalSignupsEl.textContent = String(logs.filter((l) => l.type === 'signup').length);
      }

      const usersTbody = document.getElementById('admin-users-body');
      if (usersTbody) {
        usersTbody.innerHTML = users.map((u) => `
          <tr>
            <td>${u.username}</td>
            <td>${u.email}</td>
            <td>${u.role}</td>
            <td>${new Date(u.createdAt).toLocaleString()}</td>
          </tr>
        `).join('');
      }

      const logsTbody = document.getElementById('admin-logs-body');
      if (logsTbody) {
        logsTbody.innerHTML = logs.slice().reverse().slice(0, 100).map((l) => `
          <tr>
            <td>${l.type}</td>
            <td>${l.user || '-'}</td>
            <td>${l.path || '-'}</td>
            <td>${new Date(l.at).toLocaleString()}</td>
          </tr>
        `).join('');
      }
    }

    // Profile page wiring
    const profileRoot = document.getElementById('profile-root');
    if (profileRoot) {
      const s = loadSession();
      if (!s) {
        const url = new URL('login.html', window.location.href);
        url.searchParams.set('redirect', 'profile');
        window.location.href = url.toString();
        return;
      }

      const profileForm = document.getElementById('profileForm');
      const prefsForm = document.getElementById('prefsForm');
      const passwordForm = document.getElementById('passwordForm');
      const profileError = document.getElementById('profileError');
      const passwordError = document.getElementById('passwordError');
      const colorModeSel = document.getElementById('prefColorMode');
      const privacyCheckbox = document.getElementById('prefPrivacy');
      const loginCountEl = document.getElementById('profile-login-count');
      const lastLoginEl = document.getElementById('profile-last-login');

      const users = getUsers();
      const logs = getLogs();
      const userRecord = users.find((u) => u.email === s.email);
      if (profileForm && userRecord) {
        profileForm.elements.username.value = userRecord.username || '';
        profileForm.elements.email.value = userRecord.email || '';
      }

      const prefs = getPrefsForUser(s.email);
      if (colorModeSel) {
        colorModeSel.value = prefs.colorMode === 'dark' ? 'dark' : 'light';
      }
      if (privacyCheckbox) {
        privacyCheckbox.checked = !!prefs.privacyPrivate;
      }

      const userLogs = logs.filter((l) => l.user === s.email);
      const loginLogs = userLogs.filter((l) => l.type === 'login');
      if (loginCountEl) loginCountEl.textContent = String(loginLogs.length);
      if (lastLoginEl) {
        const lastLogin = loginLogs.length ? loginLogs[loginLogs.length - 1] : null;
        lastLoginEl.textContent = lastLogin ? new Date(lastLogin.at).toLocaleString() : '–';
      }

      if (profileForm) {
        profileForm.addEventListener('submit', (e) => {
          e.preventDefault();
          if (profileError) profileError.textContent = '';
          const username = profileForm.elements.username && profileForm.elements.username.value;
          const email = profileForm.elements.email && profileForm.elements.email.value;
          try {
            updateProfile({ username, email });
            alert('Profile updated.');
          } catch (err) {
            if (profileError) {
              profileError.textContent = err.message || 'Failed to update profile.';
            } else {
              alert(err.message || 'Failed to update profile.');
            }
          }
        });
      }

      if (prefsForm) {
        prefsForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const mode = colorModeSel ? colorModeSel.value : 'light';
          const privacyPrivate = privacyCheckbox ? !!privacyCheckbox.checked : false;
          setPrefsForUser(s.email, { colorMode: mode, privacyPrivate });
          applyThemeForCurrentUser();
          alert('Preferences saved.');
        });
      }

      if (passwordForm) {
        passwordForm.addEventListener('submit', (e) => {
          e.preventDefault();
          if (passwordError) passwordError.textContent = '';
          const current = passwordForm.elements.current && passwordForm.elements.current.value;
          const next = passwordForm.elements.next && passwordForm.elements.next.value;
          const confirmNext = passwordForm.elements.confirmNext && passwordForm.elements.confirmNext.value;
          if (next !== confirmNext) {
            if (passwordError) passwordError.textContent = 'New passwords do not match.';
            else alert('New passwords do not match.');
            return;
          }
          try {
            changePassword({ current, next });
            passwordForm.reset();
            alert('Password changed successfully.');
          } catch (err) {
            if (passwordError) {
              passwordError.textContent = err.message || 'Failed to change password.';
            } else {
              alert(err.message || 'Failed to change password.');
            }
          }
        });
      }
    }
  });
})();


