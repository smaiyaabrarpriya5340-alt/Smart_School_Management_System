function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusBadge(status) {
  const value = status || 'Not Marked';
  const normalized = value.toLowerCase().replace(/\s+/g, '-');
  return `<span class="status-badge ${normalized}">${escapeHtml(value)}</span>`;
}

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function currentAcademicYear() {
  return new Date().getFullYear().toString();
}

function currentTerm() {
  return 'Term 1';
}

function resultSummaryCard(label, value) {
  return `
    <article class="stat-card">
      <h3>${escapeHtml(label)}</h3>
      <p>${escapeHtml(value)}</p>
    </article>
  `;
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await SSMS.bootstrapRole('student');
  if (!session) {
    window.location.href = '/';
    return;
  }

  const user = SSMS.getUser();
  document.getElementById('studentUserName').textContent = user ? `${user.name} (${user.email})` : '';
  document.getElementById('studentMonthFilter').value = currentMonthValue();
  document.getElementById('studentTimetableYear').value = currentAcademicYear();
  document.getElementById('studentTimetableTerm').value = currentTerm();

  const navButtons = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.content-section');
  let currentExamId = '';
  let currentResultPayload = null;
  let currentSummary = { present: 0, absent: 0, percentage: 0 };

  function showSection(sectionName) {
    navButtons.forEach((button) => button.classList.toggle('active', button.dataset.section === sectionName));
    sections.forEach((section) => section.classList.remove('active'));
    const section = document.getElementById(`${sectionName}Section`);
    if (section) section.classList.add('active');
  }

  async function loadProfile() {
    try {
      const profile = await SSMS.request('/student/profile');
      document.getElementById('profileStudentId').textContent = profile.studentId;
      document.getElementById('profileName').textContent = profile.name;
      document.getElementById('profileEmail').textContent = profile.email;
      document.getElementById('profileClass').textContent = `${profile.className} - Section ${profile.section}`;
      document.getElementById('studentUserName').textContent = `${profile.name} (${profile.className})`;
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadNotifications() {
    try {
      const data = await SSMS.request('/notifications');
      document.getElementById('studentNotifications').innerHTML = (data.notifications || []).length ? data.notifications.map((item) => `
        <article class="notice-card">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.message)}</p>
        </article>
      `).join('') : '<div class="empty-state">No notifications yet.</div>';
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadNotices() {
    try {
      const notices = await SSMS.request('/notices');
      document.getElementById('studentNotices').innerHTML = (notices || []).length ? notices.map((notice) => `
        <article class="notice-card">
          <h3>${escapeHtml(notice.title)}</h3>
          <p>${escapeHtml(notice.message)}</p>
        </article>
      `).join('') : '<div class="empty-state">No notices available.</div>';
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadFees() {
    try {
      const fees = await SSMS.request('/fees');
      const tbody = document.getElementById('studentFeesBody');
      tbody.innerHTML = (fees || []).length ? fees.map((fee) => `
        <tr>
          <td>${escapeHtml(fee.title)}</td>
          <td>${escapeHtml(String(fee.amount))}</td>
          <td>${statusBadge(fee.status)}</td>
          <td>${escapeHtml(fee.dueDate || '-')}</td>
        </tr>
      `).join('') : '<tr><td colspan="4"><div class="empty-state">No fee records found.</div></td></tr>';
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadAttendance(useSelectedMonth = true) {
    try {
      const selectedMonth = document.getElementById('studentMonthFilter').value;
      const query = new URLSearchParams();
      if (useSelectedMonth && selectedMonth) {
        query.set('month', selectedMonth);
      }

      if (useSelectedMonth && !selectedMonth) {
        SSMS.toast('Select a month first', 'error');
        return;
      }

      const data = await SSMS.request(`/student/attendance${query.toString() ? `?${query.toString()}` : ''}`);
      const tbody = document.getElementById('studentAttendanceTableBody');
      if (!data.records.length) {
        tbody.innerHTML = '<tr><td colspan="2"><div class="empty-state">No attendance recorded for the selected month.</div></td></tr>';
      } else {
        tbody.innerHTML = data.records.map((record) => `
          <tr>
            <td>${escapeHtml(record.date)}</td>
            <td>${statusBadge(record.status)}</td>
          </tr>
        `).join('');
      }

      document.getElementById('totalPresent').textContent = data.summary.present;
      document.getElementById('totalAbsent').textContent = data.summary.absent;
      document.getElementById('attendancePercentage').textContent = `${data.summary.percentage}%`;
      document.getElementById('studentOverviewPresent').textContent = data.summary.present;
      document.getElementById('studentOverviewAbsent').textContent = data.summary.absent;
      document.getElementById('studentOverviewRate').textContent = `${data.summary.percentage}%`;
      if (data.monthUsed) {
        document.getElementById('studentMonthFilter').value = data.monthUsed;
      }
      currentSummary = data.summary;
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadTimetable() {
    try {
      const academicYear = document.getElementById('studentTimetableYear').value || currentAcademicYear();
      const term = document.getElementById('studentTimetableTerm').value;
      const query = new URLSearchParams();
      if (academicYear) query.set('academicYear', academicYear);
      if (term) query.set('term', term);

      const rows = await SSMS.request(`/student/timetable${query.toString() ? `?${query.toString()}` : ''}`);
      const tbody = document.getElementById('studentTimetableBody');
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">No timetable rows found.</div></td></tr>';
        return;
      }

      tbody.innerHTML = rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.day)}</td>
          <td>${escapeHtml(row.period)}</td>
          <td>${escapeHtml(row.subject)}</td>
          <td>${escapeHtml(row.teacherName || '')}</td>
        </tr>
      `).join('');
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadResultExams() {
    try {
      const exams = await SSMS.request('/results/exams');
      const select = document.getElementById('studentResultExamSelect');
      const options = '<option value="">Select exam</option>' + exams
        .map((exam) => `<option value="${escapeHtml(exam.id)}">${escapeHtml(exam.name)} (${escapeHtml(exam.term)})</option>`)
        .join('');
      select.innerHTML = options;
      currentExamId = exams[0] ? exams[0].id : '';
      if (currentExamId) {
        select.value = currentExamId;
        await loadResult();
      } else {
        document.getElementById('studentResultSummary').innerHTML = '<div class="empty-state">No published results available yet.</div>';
        document.getElementById('studentResultTableBody').innerHTML = '';
      }
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadResult() {
    try {
      const examId = document.getElementById('studentResultExamSelect').value || currentExamId;
      if (!examId) {
        SSMS.toast('Select an exam first', 'error');
        return;
      }

      const data = await SSMS.request(`/results/student/me?examId=${encodeURIComponent(examId)}`);
      const result = (data.results || []).find((entry) => entry.examId === examId) || data.results[0];
      currentResultPayload = result || null;
      currentExamId = examId;

      const summary = document.getElementById('studentResultSummary');
      const tbody = document.getElementById('studentResultTableBody');
      if (!result) {
        summary.innerHTML = '<div class="empty-state">No result available for the selected exam.</div>';
        tbody.innerHTML = '';
        return;
      }

      summary.innerHTML = `
        ${resultSummaryCard('Total', `${result.totalObtained}/${result.totalFull}`)}
        ${resultSummaryCard('Percentage', `${result.percentage}%`)}
        ${resultSummaryCard('Grade', result.grade)}
        ${resultSummaryCard('GPA', String(result.gpa))}
        ${resultSummaryCard('Rank', result.rank ? `#${result.rank}` : '-')}
        ${resultSummaryCard('Remark', result.remark || '')}
      `;

      tbody.innerHTML = (result.subjectMarks || []).map((mark) => `
        <tr>
          <td>${escapeHtml(mark.subject)}</td>
          <td>${escapeHtml(mark.obtained)}</td>
          <td>${escapeHtml(mark.fullMark)}</td>
        </tr>
      `).join('');
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  document.getElementById('studentLogout').addEventListener('click', () => SSMS.logout());

  navButtons.forEach((button) => {
    button.addEventListener('click', () => showSection(button.dataset.section));
  });

  document.getElementById('viewMyAttendanceBtn').addEventListener('click', () => loadAttendance(true));
  document.getElementById('loadStudentTimetableBtn').addEventListener('click', loadTimetable);
  document.getElementById('loadStudentResultBtn').addEventListener('click', loadResult);
  document.getElementById('downloadStudentResultBtn').addEventListener('click', () => {
    const examId = document.getElementById('studentResultExamSelect').value || currentExamId;
    if (!examId) {
      SSMS.toast('Select an exam first', 'error');
      return;
    }
    const studentId = document.getElementById('profileStudentId').textContent.trim();
    const filename = `${studentId || 'student'}-report-card.pdf`;
    SSMS.download(`/results/export?examId=${encodeURIComponent(examId)}&format=pdf`, filename)
      .catch((error) => SSMS.toast(error.message, 'error'));
  });

  document.getElementById('studentResultExamSelect').addEventListener('change', (event) => {
    currentExamId = event.target.value;
  });

  document.getElementById('studentChangePasswordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await SSMS.request('/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: document.getElementById('studentCurrentPassword').value,
          newPassword: document.getElementById('studentNewPassword').value
        }
      });
      event.target.reset();
      SSMS.toast('Password updated', 'success');
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });

  showSection('profile');
  await loadProfile();
  await Promise.all([loadNotifications(), loadNotices(), loadFees()]);
  await loadAttendance(false);
  await loadResultExams();
  await loadTimetable();
});
