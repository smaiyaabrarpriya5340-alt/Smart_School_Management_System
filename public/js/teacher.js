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

function asDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function currentAcademicYear() {
  return new Date().getFullYear().toString();
}

function currentTerm() {
  return 'Term 1';
}

function formatResultMarks(result, subject) {
  if (!result || !Array.isArray(result.subjectMarks)) return { obtained: 0, fullMark: 100, passMark: 40 };
  const entry = result.subjectMarks.find((item) => item.subject === subject);
  return entry || { obtained: 0, fullMark: 100, passMark: 40 };
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await SSMS.bootstrapRole('teacher');
  if (!session) {
    window.location.href = '/';
    return;
  }

  const user = SSMS.getUser();
  document.getElementById('teacherUserName').textContent = user ? `${user.name} (${user.email})` : '';
  document.getElementById('attendanceDate').value = asDateInputValue();
  document.getElementById('viewDateSelect').value = asDateInputValue();
  document.getElementById('teacherTimetableYear').value = currentAcademicYear();
  document.getElementById('teacherTimetableTerm').value = currentTerm();

  const navButtons = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.content-section');
  const classSelects = [
    document.getElementById('teacherClassSelect'),
    document.getElementById('viewClassSelect'),
    document.getElementById('teacherResultClassSelect')
  ];

  const state = {
    classes: [],
    resultExam: null,
    resultExams: [],
    roster: []
  };

  function showSection(sectionName) {
    navButtons.forEach((button) => button.classList.toggle('active', button.dataset.section === sectionName));
    sections.forEach((section) => section.classList.remove('active'));
    const section = document.getElementById(`${sectionName}Section`);
    if (section) section.classList.add('active');
  }

  function populateClassSelects(classes) {
    const options = '<option value="">Select class</option>' + classes
      .map((entry) => `<option value="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</option>`)
      .join('');

    classSelects.forEach((select) => {
      if (select) select.innerHTML = options;
    });
  }

  function populateExamSelect(selectId, exams, placeholder = 'Select exam') {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = `<option value="">${placeholder}</option>` + exams
      .map((exam) => `<option value="${escapeHtml(exam.id)}">${escapeHtml(exam.name)} (${escapeHtml(exam.term)})</option>`)
      .join('');
  }

  async function loadClasses() {
    try {
      const classes = await SSMS.request('/teacher/classes');
      state.classes = classes || [];
      document.getElementById('teacherOverviewClasses').textContent = state.classes.length;

      const list = document.getElementById('teacherClassesList');
      if (!state.classes.length) {
        list.innerHTML = '<div class="empty-state">No classes assigned. Contact the administrator to receive class assignments.</div>';
      } else {
        list.innerHTML = state.classes.map((entry) => `
          <article class="class-card">
            <h3>${escapeHtml(entry.name)}</h3>
            <p class="muted">Subject: ${escapeHtml(entry.subject || '')}</p>
          </article>
        `).join('');
      }

      populateClassSelects(state.classes);
      await loadResultExams();
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadNotifications() {
    try {
      const data = await SSMS.request('/notifications');
      document.getElementById('teacherNotifications').innerHTML = (data.notifications || []).length ? data.notifications.map((item) => `
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
      document.getElementById('teacherNotices').innerHTML = (notices || []).length ? notices.map((notice) => `
        <article class="notice-card">
          <h3>${escapeHtml(notice.title)}</h3>
          <p>${escapeHtml(notice.message)}</p>
        </article>
      `).join('') : '<div class="empty-state">No notices available.</div>';
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadResultExams() {
    const className = document.getElementById('teacherResultClassSelect').value;
    if (!className) {
      populateExamSelect('teacherResultExamSelect', []);
      document.getElementById('teacherResultTableHead').innerHTML = '';
      document.getElementById('teacherResultTableBody').innerHTML = '';
      return;
    }

    const query = new URLSearchParams({ className });
    const exams = await SSMS.request(`/results/exams?${query.toString()}`);
    state.resultExams = exams || [];
    populateExamSelect('teacherResultExamSelect', state.resultExams, 'Select exam');
  }

  async function loadMarkingStudents() {
    try {
      const className = document.getElementById('teacherClassSelect').value;
      const date = document.getElementById('attendanceDate').value;

      if (!className || !date) {
        SSMS.toast('Select a class and date first', 'error');
        return;
      }

      const query = new URLSearchParams({
        className,
        date,
        academicYear: currentAcademicYear(),
        term: currentTerm()
      });
      const students = await SSMS.request(`/teacher/students?${query.toString()}`);
      const area = document.getElementById('attendanceMarkingArea');
      document.getElementById('teacherOverviewStudents').textContent = students.length;
      document.getElementById('teacherOverviewDate').textContent = date;

      if (!students.length) {
        area.innerHTML = '<div class="empty-state">No students found in this class.</div>';
        return;
      }

      area.innerHTML = `
        <h3>${escapeHtml(className)} - ${escapeHtml(date)}</h3>
        <div id="markingList"></div>
      `;

      const list = document.getElementById('markingList');
      list.innerHTML = students.map((student) => `
        <div class="attendance-row" data-student-id="${escapeHtml(student.studentId)}">
          <div>
            <strong>${escapeHtml(student.name)}</strong>
            <div class="muted">${escapeHtml(student.studentId)} | ${escapeHtml(student.section)}</div>
          </div>
          <div class="attendance-controls">
            <button class="btn btn-primary" data-status="Present">Present</button>
            <button class="btn btn-danger" data-status="Absent">Absent</button>
            <span class="status-holder">${badgeHtml(student.status)}</span>
          </div>
        </div>
      `).join('');
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function saveAttendance(studentId, className, date, status, holder) {
    try {
      const selectedClass = state.classes.find((entry) => entry.name === className);
      const record = await SSMS.request('/teacher/attendance', {
        method: 'POST',
        body: {
          studentId,
          className,
          date,
          status,
          academicYear: currentAcademicYear(),
          term: currentTerm(),
          subject: selectedClass ? selectedClass.subject : ''
        }
      });

      holder.innerHTML = badgeHtml(record.status);
      SSMS.toast(`${status} saved`, 'success');
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadViewAttendance() {
    try {
      const className = document.getElementById('viewClassSelect').value;
      const date = document.getElementById('viewDateSelect').value;

      if (!className || !date) {
        SSMS.toast('Select a class and date first', 'error');
        return;
      }

      const query = new URLSearchParams({
        className,
        date,
        academicYear: currentAcademicYear(),
        term: currentTerm()
      });
      const records = await SSMS.request(`/teacher/attendance?${query.toString()}`);
      const tbody = document.getElementById('teacherAttendanceTableBody');
      if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="3"><div class="empty-state">No attendance records for this class and date.</div></td></tr>';
      } else {
        tbody.innerHTML = records.map((record) => `
          <tr>
            <td>${escapeHtml(record.studentId)}</td>
            <td>${escapeHtml(record.name)}</td>
            <td>${badgeHtml(record.status)}</td>
          </tr>
        `).join('');
      }
      document.getElementById('teacherOverviewDate').textContent = date;
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  function renderResultSheet(roster, exam) {
    const subjects = Array.isArray(exam.subjects) ? exam.subjects : [];
    const thead = document.getElementById('teacherResultTableHead');
    const tbody = document.getElementById('teacherResultTableBody');

    if (!subjects.length || !roster.length) {
      thead.innerHTML = '';
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">Select an exam to load marks entry.</div></td></tr>';
      return;
    }

    thead.innerHTML = `
      <tr>
        <th>Student</th>
        ${subjects.map((subject) => `<th>${escapeHtml(subject)}</th>`).join('')}
        <th>Total</th>
        <th>Grade</th>
        <th>Action</th>
      </tr>
    `;

    tbody.innerHTML = roster.map((row) => {
      const result = row.result || {};
      return `
        <tr data-student-id="${escapeHtml(row.studentId)}" data-result-id="${escapeHtml(result.id || '')}">
          <td>
            <strong>${escapeHtml(row.name)}</strong>
            <div class="muted">${escapeHtml(row.studentId)} | ${escapeHtml(row.section)}</div>
          </td>
          ${subjects.map((subject) => {
            const mark = formatResultMarks(result, subject);
            return `<td><input class="mark-input" type="number" min="0" max="${escapeHtml(mark.fullMark || 100)}" data-subject="${escapeHtml(subject)}" value="${escapeHtml(mark.obtained)}"></td>`;
          }).join('')}
          <td class="row-total">${escapeHtml(result.totalObtained || 0)}/${escapeHtml(result.totalFull || subjects.length * 100)}</td>
          <td class="row-grade">${escapeHtml(result.grade || 'F')}</td>
          <td><button class="btn btn-primary btn-sm save-result-btn" type="button">Save</button></td>
        </tr>
      `;
    }).join('');
  }

  async function loadResultSheet() {
    try {
      const examId = document.getElementById('teacherResultExamSelect').value;
      if (!examId) {
        SSMS.toast('Select an exam first', 'error');
        return;
      }

      const data = await SSMS.request(`/results/roster?examId=${encodeURIComponent(examId)}`);
      state.resultExam = data.exam;
      state.roster = data.students || [];
      renderResultSheet(state.roster, state.resultExam);
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function saveResultRow(row) {
    const examId = document.getElementById('teacherResultExamSelect').value;
    const studentId = row.dataset.studentId;
    const inputs = row.querySelectorAll('.mark-input');
    const subjectMarks = Array.from(inputs).map((input) => ({
      subject: input.dataset.subject,
      obtained: Number(input.value || 0),
      fullMark: 100,
      passMark: 40
    }));

    try {
      const result = await SSMS.request('/results/entries', {
        method: 'POST',
        body: {
          examId,
          studentId,
          subjectMarks
        }
      });
      row.querySelector('.row-total').textContent = `${result.totalObtained}/${result.totalFull}`;
      row.querySelector('.row-grade').textContent = result.grade;
      SSMS.toast(`Result saved for ${studentId}`, 'success');
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  }

  async function loadTeacherTimetable() {
    try {
      const className = document.getElementById('teacherTimetableClassSelect').value;
      const academicYear = document.getElementById('teacherTimetableYear').value || currentAcademicYear();
      const term = document.getElementById('teacherTimetableTerm').value;
      const query = new URLSearchParams();

      if (className) query.set('className', className);
      if (academicYear) query.set('academicYear', academicYear);
      if (term) query.set('term', term);

      const rows = await SSMS.request(`/teacher/timetable${query.toString() ? `?${query.toString()}` : ''}`);
      const tbody = document.getElementById('teacherTimetableBody');
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">No timetable rows found for the selected filters.</div></td></tr>';
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

  document.getElementById('teacherLogout').addEventListener('click', () => SSMS.logout());

  navButtons.forEach((button) => {
    button.addEventListener('click', () => showSection(button.dataset.section));
  });

  document.getElementById('loadStudentsBtn').addEventListener('click', loadMarkingStudents);
  document.getElementById('viewAttendanceBtnTeacher').addEventListener('click', loadViewAttendance);
  document.getElementById('loadTeacherTimetableBtn').addEventListener('click', loadTeacherTimetable);
  document.getElementById('loadTeacherResultBtn').addEventListener('click', loadResultSheet);

  document.getElementById('teacherResultClassSelect').addEventListener('change', async () => {
    await loadResultExams();
  });

  document.getElementById('teacherResultExamSelect').addEventListener('change', async () => {
    const examId = document.getElementById('teacherResultExamSelect').value;
    if (!examId) {
      document.getElementById('teacherResultTableHead').innerHTML = '';
      document.getElementById('teacherResultTableBody').innerHTML = '';
      return;
    }
    const data = await SSMS.request(`/results/roster?examId=${encodeURIComponent(examId)}`);
    state.resultExam = data.exam;
    state.roster = data.students || [];
    renderResultSheet(state.roster, state.resultExam);
  });

  document.getElementById('attendanceMarkingArea').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-status]');
    if (!button) return;

    const row = button.closest('.attendance-row');
    const studentId = row.dataset.studentId;
    const className = document.getElementById('teacherClassSelect').value;
    const date = document.getElementById('attendanceDate').value;
    const holder = row.querySelector('.status-holder');

    await saveAttendance(studentId, className, date, button.dataset.status, holder);
  });

  document.getElementById('teacherResultTableBody').addEventListener('click', async (event) => {
    const button = event.target.closest('.save-result-btn');
    if (!button) return;
    const row = button.closest('tr');
    await saveResultRow(row);
  });

  document.getElementById('teacherChangePasswordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await SSMS.request('/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: document.getElementById('teacherCurrentPassword').value,
          newPassword: document.getElementById('teacherNewPassword').value
        }
      });
      event.target.reset();
      SSMS.toast('Password updated', 'success');
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });

  showSection('classes');
  await loadClasses();
  await Promise.all([loadNotifications(), loadNotices()]);
  await loadTeacherTimetable();
});
