function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function badgeHtml(status) {
  const value = status || 'Not Marked';
  const normalized = value.toLowerCase().replace(/\s+/g, '-');
  return `<span class="status-badge ${normalized}">${escapeHtml(value)}</span>`;
}

function resultSummaryCard(label, value) {
  return `<article class="stat-card"><h3>${escapeHtml(label)}</h3><p>${escapeHtml(value)}</p></article>`;
}

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await SSMS.bootstrapRole('parent');
  if (!session) {
    window.location.href = '/';
    return;
  }

  const user = SSMS.getUser();
  document.getElementById('parentUserName').textContent = user ? `${user.name} (${user.email})` : '';

  const navButtons = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.content-section');
  let selectedChild = null;
  let currentResults = [];

  function showSection(sectionName) {
    navButtons.forEach((button) => button.classList.toggle('active', button.dataset.section === sectionName));
    sections.forEach((section) => section.classList.remove('active'));
    const section = document.getElementById(`${sectionName}Section`);
    if (section) section.classList.add('active');
  }

  function updateOverview(data) {
    document.getElementById('parentOverviewChildren').textContent = data.length;
    const dueFees = data.reduce((sum, child) => sum + (child.feeSummary ? child.feeSummary.due : 0), 0);
    document.getElementById('parentOverviewDueFees').textContent = dueFees;
  }

  function renderChildren(data) {
    const select = document.getElementById('parentChildSelect');
    select.innerHTML = '<option value="">Select child</option>' + data.map((child) => `
      <option value="${escapeHtml(child.studentId)}">${escapeHtml(child.name)} (${escapeHtml(child.studentId)})</option>
    `).join('');

    const list = document.getElementById('parentChildrenList');
    list.innerHTML = data.length ? data.map((child) => `
      <article class="class-card">
        <h3>${escapeHtml(child.name)}</h3>
        <p class="muted">${escapeHtml(child.studentId)} | ${escapeHtml(child.className)} - ${escapeHtml(child.section)}</p>
        <p class="muted">Fees due: ${escapeHtml(String(child.feeSummary?.due || 0))} | Paid: ${escapeHtml(String(child.feeSummary?.paid || 0))}</p>
        ${child.latestResult ? `<p class="muted">Latest result: ${escapeHtml(child.latestResult.examName)} - ${escapeHtml(String(child.latestResult.percentage || 0))}%</p>` : '<p class="muted">No published result yet.</p>'}
      </article>
    `).join('') : '<div class="empty-state">No linked children found.</div>';
  }

  async function loadChildren() {
    const children = await SSMS.request('/parent/children');
    renderChildren(children || []);
    updateOverview(children || []);
    if (children && children.length) {
      selectedChild = children[0];
      document.getElementById('parentChildSelect').value = selectedChild.studentId;
      await Promise.all([
        loadAttendance(),
        loadResults(),
        loadFees(),
        loadTimetable()
      ]);
    }
  }

  async function loadNotifications() {
    try {
      const data = await SSMS.request('/notifications');
      document.getElementById('parentOverviewNotifications').textContent = data.unreadCount || 0;
      const node = document.getElementById('parentNotifications');
      node.innerHTML = (data.notifications || []).length ? data.notifications.map((item) => `
        <article class="notice-card">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.message)}</p>
          <p class="muted">${escapeHtml(new Date(item.createdAt).toLocaleString())}</p>
        </article>
      `).join('') : '<div class="empty-state">No notifications yet.</div>';
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadNotices() {
    try {
      const notices = await SSMS.request('/notices');
      const node = document.getElementById('parentNotices');
      node.innerHTML = (notices || []).length ? notices.map((notice) => `
        <article class="notice-card">
          <h3>${escapeHtml(notice.title)}</h3>
          <p>${escapeHtml(notice.message)}</p>
          <p class="muted">${escapeHtml(notice.audienceRole)} ${notice.className ? `• ${escapeHtml(notice.className)}` : ''}</p>
        </article>
      `).join('') : '<div class="empty-state">No notices available.</div>';
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadAttendance() {
    try {
      if (!selectedChild) return;
      const month = document.getElementById('parentAttendanceMonth').value || currentMonthValue();
      document.getElementById('parentAttendanceMonth').value = month;
      const data = await SSMS.request(`/parent/attendance?studentId=${encodeURIComponent(selectedChild.studentId)}&month=${encodeURIComponent(month)}`);
      const tbody = document.getElementById('parentAttendanceBody');
      tbody.innerHTML = (data.records || []).length ? data.records.map((record) => `
        <tr>
          <td>${escapeHtml(record.date)}</td>
          <td>${badgeHtml(record.status)}</td>
        </tr>
      `).join('') : '<tr><td colspan="2"><div class="empty-state">No attendance records found.</div></td></tr>';
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadResults() {
    try {
      if (!selectedChild) return;
      const results = await SSMS.request(`/parent/results?studentId=${encodeURIComponent(selectedChild.studentId)}`);
      currentResults = results || [];
      const select = document.getElementById('parentResultExamSelect');
      select.innerHTML = '<option value="">Select exam</option>' + currentResults.map((result) => `
        <option value="${escapeHtml(result.examId)}">${escapeHtml(result.examName)} (${escapeHtml(result.term)})</option>
      `).join('');

      if (currentResults.length) {
        select.value = currentResults[0].examId;
        renderResult(currentResults[0]);
      } else {
        document.getElementById('parentResultSummary').innerHTML = '<div class="empty-state">No published results yet.</div>';
        document.getElementById('parentResultBody').innerHTML = '';
      }
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  function renderResult(result) {
    if (!result) {
      document.getElementById('parentResultSummary').innerHTML = '<div class="empty-state">Select an exam to view the report card.</div>';
      document.getElementById('parentResultBody').innerHTML = '';
      return;
    }

    document.getElementById('parentResultSummary').innerHTML = `
      ${resultSummaryCard('Total', `${result.totalObtained}/${result.totalFull}`)}
      ${resultSummaryCard('Percentage', `${result.percentage}%`)}
      ${resultSummaryCard('Grade', result.grade)}
      ${resultSummaryCard('GPA', String(result.gpa))}
      ${resultSummaryCard('Remark', result.remark || '')}
    `;

    document.getElementById('parentResultBody').innerHTML = (result.subjectMarks || []).map((mark) => `
      <tr>
        <td>${escapeHtml(mark.subject)}</td>
        <td>${escapeHtml(mark.obtained)}</td>
        <td>${escapeHtml(mark.fullMark)}</td>
      </tr>
    `).join('');
  }

  async function loadFees() {
    try {
      if (!selectedChild) return;
      const fees = await SSMS.request('/parent/fees');
      const filtered = (fees || []).filter((fee) => fee.studentId === selectedChild.studentId);
      const tbody = document.getElementById('parentFeesBody');
      tbody.innerHTML = filtered.length ? filtered.map((fee) => `
        <tr>
          <td>${escapeHtml(fee.title)}</td>
          <td>${escapeHtml(String(fee.amount))}</td>
          <td>${badgeHtml(fee.status)}</td>
          <td>${escapeHtml(fee.dueDate || '-')}</td>
        </tr>
      `).join('') : '<tr><td colspan="4"><div class="empty-state">No fee records found.</div></td></tr>';
      document.getElementById('parentOverviewDueFees').textContent = filtered.filter((fee) => fee.status !== 'Paid').length;
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadTimetable() {
    try {
      if (!selectedChild) return;
      const rows = await SSMS.request(`/parent/timetable?studentId=${encodeURIComponent(selectedChild.studentId)}`);
      const tbody = document.getElementById('parentTimetableBody');
      tbody.innerHTML = (rows || []).length ? rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.day)}</td>
          <td>${escapeHtml(row.period)}</td>
          <td>${escapeHtml(row.subject)}</td>
          <td>${escapeHtml(row.teacherName || '')}</td>
        </tr>
      `).join('') : '<tr><td colspan="4"><div class="empty-state">No timetable rows found.</div></td></tr>';
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  document.getElementById('parentLogout').addEventListener('click', () => SSMS.logout());
  document.getElementById('parentChildSelect').addEventListener('change', async (event) => {
    const children = await SSMS.request('/parent/children');
    selectedChild = (children || []).find((child) => child.studentId === event.target.value) || children[0] || null;
    await Promise.all([loadAttendance(), loadResults(), loadFees(), loadTimetable()]);
  });

  document.getElementById('refreshParentViewBtn').addEventListener('click', async () => {
    await Promise.all([loadChildren(), loadNotifications(), loadNotices()]);
  });
  document.getElementById('loadParentAttendanceBtn').addEventListener('click', loadAttendance);
  document.getElementById('loadParentResultBtn').addEventListener('click', () => {
    const examId = document.getElementById('parentResultExamSelect').value;
    const result = currentResults.find((entry) => entry.examId === examId) || currentResults[0] || null;
    renderResult(result);
  });
  document.getElementById('downloadParentResultBtn').addEventListener('click', () => {
    const examId = document.getElementById('parentResultExamSelect').value;
    if (!selectedChild || !examId) {
      SSMS.toast('Select a child and exam first', 'error');
      return;
    }
    SSMS.download(
      `/results/export?studentId=${encodeURIComponent(selectedChild.studentId)}&examId=${encodeURIComponent(examId)}&format=pdf`,
      `${selectedChild.studentId}-report-card.pdf`
    ).catch((error) => SSMS.toast(error.message, 'error'));
  });

  document.getElementById('parentChangePasswordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await SSMS.request('/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: document.getElementById('parentCurrentPassword').value,
        newPassword: document.getElementById('parentNewPassword').value
      }
    });
    event.target.reset();
    SSMS.toast('Password updated', 'success');
  });

  navButtons.forEach((button) => button.addEventListener('click', () => showSection(button.dataset.section)));

  document.getElementById('parentResultExamSelect').addEventListener('change', (event) => {
    const result = currentResults.find((entry) => entry.examId === event.target.value) || null;
    renderResult(result);
  });

  await Promise.all([loadChildren(), loadNotifications(), loadNotices()]);
});
