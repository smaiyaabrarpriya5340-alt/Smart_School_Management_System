function populateClassSelect(select, classes) {
  if (!select) return;

  select.innerHTML = '<option value="">Select class</option>' + classes
    .map((entry) => `<option value="${entry.name}">${entry.name}</option>`)
    .join('');
}

function redirectForRole(role) {
  const routes = {
    admin: '/admin.html',
    teacher: '/teacher.html',
    student: '/student.html'
  };

  window.location.href = routes[role] || '/';
}

document.addEventListener('DOMContentLoaded', async () => {
  const existing = await SSMS.bootstrapRole();
  if (existing && existing.user) {
    redirectForRole(existing.user.role);
    return;
  }

  try {
    const catalog = await SSMS.request('/meta/catalog', { auth: false });
    populateClassSelect(document.getElementById('regClass'), catalog.classes || []);
  } catch (error) {
    populateClassSelect(document.getElementById('regClass'), [
      { name: 'Class A' },
      { name: 'Class B' },
      { name: 'Class C' }
    ]);
  }

  document.getElementById('registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const data = await SSMS.request('/auth/register-student', {
        method: 'POST',
        auth: false,
        body: {
          name: document.getElementById('regName').value,
          email: document.getElementById('regEmail').value,
          password: document.getElementById('regPassword').value,
          studentId: document.getElementById('regStudentId').value,
          className: document.getElementById('regClass').value,
          section: document.getElementById('regSection').value
        }
      });

      SSMS.setSession(data.token, data.user);
      SSMS.toast('Student account created', 'success');
      redirectForRole('student');
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });
});
