(function () {
  const TOKEN_KEY = 'ssms_token';
  const USER_KEY = 'ssms_user';
  const API_BASE = '/api';
  let toastTimer = null;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function request(path, options = {}) {
    const {
      method = 'GET',
      body,
      auth = true
    } = options;

    const headers = {
      Accept: 'application/json'
    };

    if (auth) {
      const token = getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    let payload = body;
    if (body && !(body instanceof FormData) && typeof body === 'object') {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: payload
    });

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = text;
      }
    }

    if (!response.ok) {
      const message = data && data.message ? data.message : 'Request failed';
      throw new Error(message);
    }

    return data;
  }

  async function download(path, filename, options = {}) {
    const {
      method = 'GET',
      body,
      auth = true,
      accept = '*/*'
    } = options;

    const headers = {
      Accept: accept
    };

    if (auth) {
      const token = getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    let payload = body;
    if (body && !(body instanceof FormData) && typeof body === 'object') {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: payload
    });

    if (!response.ok) {
      const text = await response.text();
      let message = 'Download failed';
      if (text) {
        try {
          const data = JSON.parse(text);
          message = data && data.message ? data.message : message;
        } catch (error) {
          message = text;
        }
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename || 'download';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      anchor.remove();
    }, 1000);
  }

  async function bootstrapRole(expectedRole) {
    const token = getToken();
    if (!token) {
      return null;
    }

    try {
      const data = await request('/auth/me', { auth: true });
      if (data && data.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      }

      if (expectedRole && data.user.role !== expectedRole) {
        throw new Error('Role mismatch');
      }

      return data;
    } catch (error) {
      clearSession();
      return null;
    }
  }

  function logout() {
    clearSession();
    window.location.href = '/';
  }

  function ensureToastHost() {
    let host = document.getElementById('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, type = 'info') {
    const host = ensureToastHost();
    const node = document.createElement('div');
    node.className = `toast toast-${type}`;
    node.textContent = message;
    host.appendChild(node);

    requestAnimationFrame(() => node.classList.add('show'));

    if (toastTimer) {
      clearTimeout(toastTimer);
    }

    toastTimer = window.setTimeout(() => {
      node.classList.remove('show');
      window.setTimeout(() => node.remove(), 180);
    }, 2800);
  }

  function setBusy(container, message = 'Loading...') {
    if (!container) return;
    container.dataset.originalHtml = container.innerHTML;
    container.innerHTML = `<div class="empty-state loading-state">${message}</div>`;
  }

  function clearBusy(container) {
    if (!container) return;
    delete container.dataset.originalHtml;
  }

  window.SSMS = {
    request,
    download,
    bootstrapRole,
    clearSession,
    logout,
    toast,
    setBusy,
    clearBusy,
    getToken,
    getUser,
    setSession
  };
})();
