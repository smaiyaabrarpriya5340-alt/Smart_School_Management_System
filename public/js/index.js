function redirectForRole(role) {
  const routes = {
    admin: '/admin.html',
    teacher: '/teacher.html',
    student: '/student.html',
    parent: '/parent.html'
  };

  window.location.href = routes[role] || '/';
}

document.addEventListener('DOMContentLoaded', async () => {
  const existing = await SSMS.bootstrapRole();
  if (existing && existing.user) {
    redirectForRole(existing.user.role);
    return;
  }

  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const data = await SSMS.request('/auth/login', {
        method: 'POST',
        auth: false,
        body: {
          email: document.getElementById('loginEmail').value,
          password: document.getElementById('loginPassword').value,
          role: document.getElementById('loginRole').value
        }
      });

      SSMS.setSession(data.token, data.user);
      SSMS.toast('Login successful', 'success');
      redirectForRole(data.user.role);
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });
});
