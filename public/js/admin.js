function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, value);
    }
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

function renderStatus(status) {
  const value = status || 'Not Marked';
  const normalized = value.toLowerCase().replace(/\s+/g, '-');
  return `<span class="status-badge ${normalized}">${escapeHtml(value)}</span>`;
}

function optionMarkup(items, placeholder = 'Select') {
  return `<option value="">${escapeHtml(placeholder)}</option>` + items
    .map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
    .join('');
}

function setSelectOptions(select, items, placeholder = 'Select') {
  if (!select) return;
  select.innerHTML = optionMarkup(items, placeholder);
}

function setYearOptions(select, years, placeholder = 'All Years') {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>` + years
    .map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`)
    .join('');
}

function setValue(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.value = value;
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach((modal) => modal.classList.remove('active'));
}

function currentYear() {
  return new Date().getFullYear().toString();
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function defaultYears() {
  const year = new Date().getFullYear();
  return [year - 2, year - 1, year, year + 1].map(String);
}

function parseTeacherClassesJson(raw, fallbackSubject) {
  if (!raw.trim()) {
    return [{ name: 'Unassigned', subject: fallbackSubject }];
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Classes must be a JSON array');
  }

  return parsed
    .map((entry) => ({
      name: String(entry.name || '').trim(),
      subject: String(entry.subject || fallbackSubject).trim()
    }))
    .filter((entry) => entry.name);
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await SSMS.bootstrapRole('admin');
  if (!session) {
    window.location.href = '/';
    return;
  }

  const user = SSMS.getUser();
  document.getElementById('adminUserName').textContent = user ? `${user.name} (${user.email})` : '';

  const state = {
    catalog: [],
    report: { records: [], summary: { present: 0, absent: 0, total: 0, attendanceRate: 0 } },
    results: { exams: [], student: null, classSheet: null, roster: null },
    notices: [],
    fees: [],
    parents: [],
    audit: []
  };

  const navButtons = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.content-section');
  const years = defaultYears();

  setSelectOptions(document.getElementById('studentSection'), ['A', 'B'], 'Select section');
  setSelectOptions(document.getElementById('reportSectionFilter'), ['A', 'B'], 'All Sections');
  setSelectOptions(document.getElementById('attendanceSectionFilter'), ['A', 'B'], 'All Sections');
  setSelectOptions(document.getElementById('timetableSectionFilter'), ['A', 'B'], 'All Sections');
  setSelectOptions(document.getElementById('editStudentSection'), ['A', 'B'], 'Select section');
  setSelectOptions(document.getElementById('editAttendanceTerm'), ['Term 1', 'Term 2', 'Term 3'], 'Term 1');
  setSelectOptions(document.getElementById('timetableTerm'), ['Term 1', 'Term 2', 'Term 3'], 'Term 1');
  setSelectOptions(document.getElementById('editTimetableTerm'), ['Term 1', 'Term 2', 'Term 3'], 'Term 1');
  setSelectOptions(document.getElementById('attendanceTermFilter'), ['Term 1', 'Term 2', 'Term 3'], 'All Terms');
  setSelectOptions(document.getElementById('reportTermFilter'), ['Term 1', 'Term 2', 'Term 3'], 'All Terms');
  setSelectOptions(document.getElementById('teacherTimetableTerm'), ['Term 1', 'Term 2', 'Term 3'], 'All Terms');
  setSelectOptions(document.getElementById('studentTimetableTerm'), ['Term 1', 'Term 2', 'Term 3'], 'All Terms');
  setSelectOptions(document.getElementById('noticeAudienceRole'), ['all', 'student', 'teacher', 'parent'], 'All');
  setSelectOptions(document.getElementById('feeTerm'), ['Term 1', 'Term 2', 'Term 3'], 'Term 1');
  setYearOptions(document.getElementById('attendanceYearFilter'), years);

  setValue('studentAcademicYear', currentYear());
  setValue('teacherAcademicYear', currentYear());
  setValue('timetableAcademicYear', currentYear());
  setValue('reportYearFilter', currentYear());
  setValue('timetableYearFilter', currentYear());
  setValue('teacherTimetableYear', currentYear());
  setValue('studentTimetableYear', currentYear());
  setValue('examAcademicYear', currentYear());
  setValue('feeAcademicYear', currentYear());

  function showSection(sectionName) {
    navButtons.forEach((button) => button.classList.toggle('active', button.dataset.section === sectionName));
    sections.forEach((section) => section.classList.remove('active'));
    const target = document.getElementById(`${sectionName}Section`);
    if (target) target.classList.add('active');
  }

  function syncCatalogOptions() {
    const classes = state.catalog.map((entry) => entry.name);
    const selects = [
      document.getElementById('studentClass'),
      document.getElementById('editStudentClass'),
      document.getElementById('reportClassFilter'),
      document.getElementById('attendanceClassFilter'),
      document.getElementById('timetableClassName'),
      document.getElementById('timetableClassFilter'),
      document.getElementById('teacherTimetableClassSelect'),
      document.getElementById('examClassName'),
      document.getElementById('classResultClassSelect'),
      document.getElementById('noticeClassName'),
      document.getElementById('feeClassName')
    ];

    selects.forEach((select) => {
      if (!select) return;
      const placeholder = select.id === 'reportClassFilter' || select.id === 'attendanceClassFilter' || select.id === 'timetableClassFilter'
        ? 'All Classes'
        : 'Select class';
      setSelectOptions(select, classes, placeholder);
    });

    const datalist = document.getElementById('classCatalog');
    if (datalist) {
      datalist.innerHTML = state.catalog
        .map((entry) => `<option value="${escapeHtml(entry.name)}"></option>`)
        .join('');
    }
  }

  function syncResultExamOptions() {
    const options = '<option value="">Select exam</option>' + state.results.exams
      .map((exam) => `<option value="${escapeHtml(exam.id)}">${escapeHtml(exam.name)} (${escapeHtml(exam.className)} • ${escapeHtml(exam.term)})</option>`)
      .join('');

    ['resultExamSelect', 'classResultExamSelect', 'studentMarksheetExamSelect'].forEach((id) => {
      const select = document.getElementById(id);
      if (select) select.innerHTML = options;
    });
  }

  async function loadCatalog() {
    try {
      const data = await SSMS.request('/meta/catalog', { auth: false });
      state.catalog = data.classes || [];
      syncCatalogOptions();
    } catch (error) {
      state.catalog = [
        { name: 'Class A' },
        { name: 'Class B' },
        { name: 'Class C' }
      ];
      syncCatalogOptions();
    }
  }

  async function loadStats() {
    const stats = await SSMS.request('/admin/stats');
    document.getElementById('overviewStudents').textContent = stats.totalStudents;
    document.getElementById('overviewTeachers').textContent = stats.totalTeachers;
    document.getElementById('overviewAttendance').textContent = `${stats.todayAttendance}%`;
    document.getElementById('overviewMarked').textContent = stats.todayMarked || 0;
  }

  async function loadAnalytics() {
    const analytics = await SSMS.request('/admin/analytics');
    renderBarChart(
      document.getElementById('monthlyTrendChart'),
      analytics.monthlyTrend.map((entry) => ({
        label: entry.month,
        value: entry.present,
        sublabel: `Absent ${entry.absent}`
      })),
      'Present'
    );
    renderBarChart(
      document.getElementById('classSummaryChart'),
      analytics.classSummary.map((entry) => ({
        label: entry.className,
        value: entry.present,
        sublabel: `Absent ${entry.absent}`
      })),
      'Present'
    );
  }

  function renderBarChart(container, items, caption) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<div class="empty-state">No analytics data yet.</div>';
      return;
    }

    const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);
    container.innerHTML = items.map((item) => {
      const width = Math.round(((Number(item.value) || 0) / max) * 100);
      return `
        <div class="bar-item">
          <div class="bar-item-header">
            <span>${escapeHtml(item.label)}</span>
            <span>${escapeHtml(String(item.value))} ${caption}</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
          <div class="muted">${escapeHtml(item.sublabel || '')}</div>
        </div>
      `;
    }).join('');
  }

  function studentRow(student) {
    return `
      <tr>
        <td>${escapeHtml(student.studentId)}</td>
        <td>${escapeHtml(student.name)}</td>
        <td>${escapeHtml(student.email)}</td>
        <td>${escapeHtml(student.className)}</td>
        <td>${escapeHtml(student.section)}</td>
        <td>${escapeHtml(student.academicYear || '')}</td>
        <td>${escapeHtml(student.gradeLevel || '')}</td>
        <td>
          <button class="btn btn-secondary btn-sm" data-edit-student="${escapeHtml(student.studentId)}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete-student="${escapeHtml(student.studentId)}">Delete</button>
        </td>
      </tr>
    `;
  }

  function teacherRow(teacher) {
    return `
      <tr>
        <td>${escapeHtml(teacher.teacherId)}</td>
        <td>${escapeHtml(teacher.name)}</td>
        <td>${escapeHtml(teacher.email)}</td>
        <td>${escapeHtml(teacher.subject)}</td>
        <td>${(teacher.classes || []).map((entry) => `${escapeHtml(entry.name)} (${escapeHtml(entry.subject)})`).join('<br>')}</td>
        <td>${escapeHtml(teacher.academicYear || '')}</td>
        <td>
          <button class="btn btn-secondary btn-sm" data-edit-teacher="${escapeHtml(teacher.teacherId)}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete-teacher="${escapeHtml(teacher.teacherId)}">Delete</button>
        </td>
      </tr>
    `;
  }

  function attendanceRow(record) {
    return `
      <tr>
        <td>${escapeHtml(record.studentId)}</td>
        <td>${escapeHtml(record.studentName)}</td>
        <td>${escapeHtml(record.className)}</td>
        <td>${escapeHtml(record.section)}</td>
        <td>${escapeHtml(record.academicYear || '')}</td>
        <td>${escapeHtml(record.term || '')}</td>
        <td>${escapeHtml(record.date)}</td>
        <td>${renderStatus(record.status)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" data-edit-attendance="${escapeHtml(record._id)}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete-attendance="${escapeHtml(record._id)}">Delete</button>
        </td>
      </tr>
    `;
  }

  function timetableRow(row) {
    return `
      <tr>
        <td>${escapeHtml(row.className)}</td>
        <td>${escapeHtml(row.section || '')}</td>
        <td>${escapeHtml(row.academicYear || '')}</td>
        <td>${escapeHtml(row.term || '')}</td>
        <td>${escapeHtml(row.day)}</td>
        <td>${escapeHtml(row.period)}</td>
        <td>${escapeHtml(row.subject)}</td>
        <td>${escapeHtml(row.teacherName || '')}</td>
        <td>
          <button class="btn btn-secondary btn-sm" data-edit-timetable="${escapeHtml(row._id)}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete-timetable="${escapeHtml(row._id)}">Delete</button>
        </td>
      </tr>
    `;
  }

  async function loadStudents() {
    const query = formatQuery({
      search: document.getElementById('studentSearch').value,
      sortBy: document.getElementById('studentSortBy').value,
      order: document.getElementById('studentSortOrder').value
    });
    const students = await SSMS.request(`/admin/students${query}`);
    const tbody = document.getElementById('studentsTableBody');
    tbody.innerHTML = students.length
      ? students.map(studentRow).join('')
      : '<tr><td colspan="8"><div class="empty-state">No students yet. Add the first student to start tracking attendance.</div></td></tr>';
  }

  async function loadTeachers() {
    const query = formatQuery({
      search: document.getElementById('teacherSearch').value,
      sortBy: document.getElementById('teacherSortBy').value,
      order: document.getElementById('teacherSortOrder').value
    });
    const teachers = await SSMS.request(`/admin/teachers${query}`);
    const tbody = document.getElementById('teachersTableBody');
    tbody.innerHTML = teachers.length
      ? teachers.map(teacherRow).join('')
      : '<tr><td colspan="7"><div class="empty-state">No teachers yet.</div></td></tr>';
  }

  async function loadAttendance() {
    const query = formatQuery({
      className: document.getElementById('attendanceClassFilter').value,
      section: document.getElementById('attendanceSectionFilter').value,
      academicYear: document.getElementById('attendanceYearFilter').value,
      term: document.getElementById('attendanceTermFilter').value,
      status: document.getElementById('attendanceStatusFilter').value,
      dateFrom: document.getElementById('attendanceDateFromFilter').value,
      dateTo: document.getElementById('attendanceDateToFilter').value,
      search: document.getElementById('attendanceSearchFilter').value,
      sortBy: document.getElementById('attendanceSortBy').value,
      order: document.getElementById('attendanceSortOrder').value
    });
    const records = await SSMS.request(`/admin/attendance${query}`);
    const tbody = document.getElementById('attendanceTableBody');
    tbody.innerHTML = records.length
      ? records.map(attendanceRow).join('')
      : '<tr><td colspan="9"><div class="empty-state">No attendance records match the current filters.</div></td></tr>';
  }

  async function loadTimetable() {
    const query = formatQuery({
      className: document.getElementById('timetableClassFilter').value,
      section: document.getElementById('timetableSectionFilter').value,
      academicYear: document.getElementById('timetableYearFilter').value,
      term: document.getElementById('timetableTermFilter').value
    });
    const rows = await SSMS.request(`/timetable${query}`);
    const tbody = document.getElementById('timetableTableBody');
    tbody.innerHTML = rows.length
      ? rows.map(timetableRow).join('')
      : '<tr><td colspan="9"><div class="empty-state">No timetable rows yet.</div></td></tr>';
  }

  function renderExamRow(exam) {
    return `
      <tr>
        <td>${escapeHtml(exam.name)}</td>
        <td>${escapeHtml(exam.className)}</td>
        <td>${escapeHtml(exam.section || '')}</td>
        <td>${escapeHtml(exam.academicYear || '')}</td>
        <td>${escapeHtml(exam.term || '')}</td>
        <td>${escapeHtml((exam.subjects || []).join(', '))}</td>
        <td>
          <span class="status-badge ${exam.published ? 'present' : 'not-marked'}">${exam.published ? 'Published' : 'Draft'}</span>
          <span class="status-badge ${exam.locked ? 'absent' : 'not-marked'}">${exam.locked ? 'Locked' : 'Open'}</span>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" data-toggle-exam-published="${escapeHtml(exam.id)}">${exam.published ? 'Unpublish' : 'Publish'}</button>
          <button class="btn btn-secondary btn-sm" data-toggle-exam-locked="${escapeHtml(exam.id)}">${exam.locked ? 'Unlock' : 'Lock'}</button>
          <button class="btn btn-danger btn-sm" data-delete-exam="${escapeHtml(exam.id)}">Delete</button>
        </td>
      </tr>
    `;
  }

  function renderNoticeRow(notice) {
    return `
      <tr>
        <td>${escapeHtml(notice.title)}</td>
        <td>${escapeHtml(notice.audienceRole || 'all')}</td>
        <td>${escapeHtml(notice.className || '')}</td>
        <td>${escapeHtml(notice.section || '')}</td>
        <td>${notice.published ? 'Published' : 'Draft'}</td>
        <td>
          <button class="btn btn-secondary btn-sm" data-toggle-notice-published="${escapeHtml(notice.id)}">${notice.published ? 'Unpublish' : 'Publish'}</button>
          <button class="btn btn-danger btn-sm" data-delete-notice="${escapeHtml(notice.id)}">Delete</button>
        </td>
      </tr>
    `;
  }

  function renderFeeRow(fee) {
    return `
      <tr>
        <td>${escapeHtml(fee.studentName || fee.studentId || '')}</td>
        <td>${escapeHtml(fee.title)}</td>
        <td>${escapeHtml(String(fee.amount || 0))}</td>
        <td>${escapeHtml(fee.status || 'Due')}</td>
        <td>${escapeHtml(fee.dueDate || '')}</td>
        <td>
          <button class="btn btn-secondary btn-sm" data-mark-fee-paid="${escapeHtml(fee._id)}">Mark Paid</button>
          <button class="btn btn-danger btn-sm" data-delete-fee="${escapeHtml(fee._id)}">Delete</button>
        </td>
      </tr>
    `;
  }

  function renderParentRow(parent) {
    return `
      <tr>
        <td>${escapeHtml(parent.parentId)}</td>
        <td>${escapeHtml(parent.name)}</td>
        <td>${escapeHtml(parent.email)}</td>
        <td>${escapeHtml(parent.phone || '')}</td>
        <td>${escapeHtml((parent.children || []).map((child) => child.studentId).join(', '))}</td>
        <td>
          <button class="btn btn-danger btn-sm" data-delete-parent="${escapeHtml(parent.parentId)}">Delete</button>
        </td>
      </tr>
    `;
  }

  function renderAuditRow(log) {
    return `
      <tr>
        <td>${escapeHtml(new Date(log.createdAt).toLocaleString())}</td>
        <td>${escapeHtml(log.actorName || '')} (${escapeHtml(log.actorRole || '')})</td>
        <td>${escapeHtml(log.action || '')}</td>
        <td>${escapeHtml(log.entityType || '')}</td>
        <td>${escapeHtml(log.summary || '')}</td>
      </tr>
    `;
  }

  function renderStudentMarksheet(result) {
    const summary = document.getElementById('studentMarksheetSummary');
    const tbody = document.getElementById('studentMarksheetBody');

    if (!result) {
      summary.innerHTML = '<div class="empty-state">Select a student and exam to view the marksheet.</div>';
      tbody.innerHTML = '';
      return;
    }

    summary.innerHTML = `
      <article class="stat-card"><h3>Total</h3><p>${escapeHtml(result.totalObtained || 0)}/${escapeHtml(result.totalFull || 0)}</p></article>
      <article class="stat-card"><h3>Percentage</h3><p>${escapeHtml(result.percentage || 0)}%</p></article>
      <article class="stat-card"><h3>Grade</h3><p>${escapeHtml(result.grade || 'F')}</p></article>
      <article class="stat-card"><h3>GPA</h3><p>${escapeHtml(result.gpa || 0)}</p></article>
      <article class="stat-card"><h3>Rank</h3><p>${escapeHtml(result.rank ? `#${result.rank}` : '-')}</p></article>
      <article class="stat-card"><h3>Remark</h3><p>${escapeHtml(result.remark || '')}</p></article>
    `;

    tbody.innerHTML = (result.subjectMarks || []).map((mark) => `
      <tr>
        <td>${escapeHtml(mark.subject)}</td>
        <td>${escapeHtml(mark.obtained)}</td>
        <td>${escapeHtml(mark.fullMark)}</td>
        <td>${escapeHtml(mark.passMark)}</td>
      </tr>
    `).join('');
  }

  function renderClassSheet(rows) {
    const tbody = document.getElementById('classResultBody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">No class result rows found.</div></td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.rank || '')}</td>
        <td>${escapeHtml(row.studentName || '')}</td>
        <td>${escapeHtml(row.percentage || 0)}%</td>
        <td>${escapeHtml(row.grade || '')}</td>
        <td>${escapeHtml(row.gpa || 0)}</td>
      </tr>
    `).join('');
  }

  async function loadExams() {
    const exams = await SSMS.request('/results/exams');
    state.results.exams = exams || [];
    syncResultExamOptions();
    const tbody = document.getElementById('examTableBody');
    tbody.innerHTML = state.results.exams.length
      ? state.results.exams.map(renderExamRow).join('')
      : '<tr><td colspan="8"><div class="empty-state">No exams yet. Create the first one to start publishing results.</div></td></tr>';
  }

  async function loadNotices() {
    const notices = await SSMS.request('/notices');
    state.notices = notices || [];
    const tbody = document.getElementById('noticeTableBody');
    tbody.innerHTML = state.notices.length
      ? state.notices.map(renderNoticeRow).join('')
      : '<tr><td colspan="6"><div class="empty-state">No notices yet.</div></td></tr>';
  }

  async function loadFees() {
    const fees = await SSMS.request('/fees');
    state.fees = fees || [];
    const tbody = document.getElementById('feeTableBody');
    tbody.innerHTML = state.fees.length
      ? state.fees.map(renderFeeRow).join('')
      : '<tr><td colspan="6"><div class="empty-state">No fee records yet.</div></td></tr>';
  }

  async function loadParents() {
    const parents = await SSMS.request('/admin/parents');
    state.parents = parents || [];
    const tbody = document.getElementById('parentTableBody');
    tbody.innerHTML = state.parents.length
      ? state.parents.map(renderParentRow).join('')
      : '<tr><td colspan="6"><div class="empty-state">No parents yet.</div></td></tr>';
  }

  async function loadAuditLogs() {
    const logs = await SSMS.request('/audit');
    state.audit = logs || [];
    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = state.audit.length
      ? state.audit.map(renderAuditRow).join('')
      : '<tr><td colspan="5"><div class="empty-state">No audit history yet.</div></td></tr>';
  }

  async function loadStudentMarksheet() {
    const studentId = document.getElementById('resultStudentId').value.trim();
    const examId = document.getElementById('resultExamSelect').value;
    if (!studentId || !examId) {
      SSMS.toast('Enter a student ID and select an exam', 'error');
      return;
    }

    const data = await SSMS.request(`/results/student/${encodeURIComponent(studentId)}?examId=${encodeURIComponent(examId)}`);
    const result = (data.results || []).find((entry) => entry.examId === examId) || data.results[0] || null;
    renderStudentMarksheet(result);
  }

  async function loadClassSheet() {
    const className = document.getElementById('classResultClassSelect').value;
    const examId = document.getElementById('classResultExamSelect').value;
    if (!className || !examId) {
      SSMS.toast('Select a class and exam', 'error');
      return;
    }

    const data = await SSMS.request(`/results/class/${encodeURIComponent(className)}?examId=${encodeURIComponent(examId)}`);
    state.results.classSheet = data;
    renderClassSheet(data.results || []);
  }

  async function buildReport() {
    const type = document.getElementById('reportTypeFilter').value;
    const month = document.getElementById('reportMonthFilter').value || currentMonth();
    const className = document.getElementById('reportClassFilter').value;
    const section = document.getElementById('reportSectionFilter').value;
    const studentId = document.getElementById('reportStudentFilter').value;
    const academicYear = document.getElementById('reportYearFilter').value;
    const term = document.getElementById('reportTermFilter').value;

    let response;
    let description = '';
    if (type === 'student') {
      if (!studentId) {
        SSMS.toast('Enter a student ID for student reports', 'error');
        return;
      }
      response = await SSMS.request(`/admin/reports/student/${encodeURIComponent(studentId)}`);
      description = `Student report for ${studentId}`;
      state.report.records = response.records || [];
      state.report.summary = response.summary || {};
    } else if (type === 'class') {
      if (!className) {
        SSMS.toast('Select a class for class reports', 'error');
        return;
      }
      response = await SSMS.request(`/admin/reports/class/${encodeURIComponent(className)}`);
      description = `Class report for ${className}`;
      const students = response.students || [];
      state.report.records = students.flatMap((entry) => (
        entry.total
          ? [{
              studentId: entry.student.studentId,
              studentName: entry.student.name,
              className,
              section: entry.student.section,
              academicYear: entry.student.academicYear,
              term: '',
              date: '',
              status: `${entry.attendanceRate}%`
            }]
          : []
      ));
      state.report.summary = {
        present: students.reduce((sum, entry) => sum + entry.present, 0),
        absent: students.reduce((sum, entry) => sum + entry.absent, 0),
        total: students.reduce((sum, entry) => sum + entry.total, 0),
        attendanceRate: students.length ? Math.round(students.reduce((sum, entry) => sum + entry.attendanceRate, 0) / students.length) : 0
      };
    } else {
      response = await SSMS.request(`/admin/reports/monthly${formatQuery({ month, className, section, studentId, academicYear, term })}`);
      description = `Monthly report for ${month}`;
      state.report.records = response.records || [];
      state.report.summary = response.summary || {};
    }

    const reportRows = state.report.records.length
      ? state.report.records.map((record) => `
        <tr>
          <td>${escapeHtml(record.studentId || '')}</td>
          <td>${escapeHtml(record.studentName || record.student?.name || '')}</td>
          <td>${escapeHtml(record.className || className || '')}</td>
          <td>${escapeHtml(record.section || '')}</td>
          <td>${escapeHtml(record.academicYear || academicYear || '')}</td>
          <td>${escapeHtml(record.term || term || '')}</td>
          <td>${escapeHtml(record.date || '')}</td>
          <td>${renderStatus(record.status || '')}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="8"><div class="empty-state">No report records found.</div></td></tr>';

    document.getElementById('reportTableBody').innerHTML = reportRows;
    document.getElementById('reportSummaryText').textContent = description;
    document.getElementById('reportPresent').textContent = state.report.summary.present || 0;
    document.getElementById('reportAbsent').textContent = state.report.summary.absent || 0;
    document.getElementById('reportRate').textContent = `${state.report.summary.attendanceRate || 0}%`;
  }

  async function exportReport(format) {
    const params = {
      format,
      month: document.getElementById('reportMonthFilter').value || currentMonth(),
      className: document.getElementById('reportClassFilter').value,
      section: document.getElementById('reportSectionFilter').value,
      studentId: document.getElementById('reportStudentFilter').value,
      academicYear: document.getElementById('reportYearFilter').value,
      term: document.getElementById('reportTermFilter').value
    };
    const query = formatQuery(params);
    const filename = format === 'pdf' ? 'attendance-report.pdf' : 'attendance-report.csv';
    SSMS.download(`/admin/reports/export${query}`, filename, {
      accept: format === 'pdf' ? 'application/pdf' : 'text/csv'
    }).catch((error) => SSMS.toast(error.message, 'error'));
  }

  function readTeacherAssignments() {
    const container = document.getElementById('teacherClassAssignments');
    return Array.from(container.querySelectorAll('.assignment-row')).map((row) => ({
      name: row.querySelector('.teacher-class-name').value.trim(),
      subject: row.querySelector('.teacher-class-subject').value.trim() || document.getElementById('teacherSubject').value.trim()
    })).filter((entry) => entry.name);
  }

  function addTeacherAssignmentRow(name = '', subject = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'assignment-row';
    wrapper.innerHTML = `
      <label>Class Name
        <input type="text" class="teacher-class-name" list="classCatalog" value="${escapeHtml(name)}" required>
      </label>
      <label>Subject Name
        <input type="text" class="teacher-class-subject" value="${escapeHtml(subject)}" required>
      </label>
      <button type="button" class="btn btn-danger remove-assignment-btn">Remove</button>
    `;
    document.getElementById('teacherClassAssignments').appendChild(wrapper);
  }

  function ensureTeacherAssignmentRows(classes = []) {
    const container = document.getElementById('teacherClassAssignments');
    container.innerHTML = '';
    if (classes.length) {
      classes.forEach((entry) => addTeacherAssignmentRow(entry.name, entry.subject));
    } else {
      addTeacherAssignmentRow();
    }
  }

  async function loadTimetableForEditMode() {
    const query = formatQuery({
      className: document.getElementById('timetableClassFilter').value,
      section: document.getElementById('timetableSectionFilter').value,
      academicYear: document.getElementById('timetableYearFilter').value,
      term: document.getElementById('timetableTermFilter').value
    });
    const rows = await SSMS.request(`/timetable${query}`);
    const tbody = document.getElementById('timetableTableBody');
    tbody.innerHTML = rows.length
      ? rows.map(timetableRow).join('')
      : '<tr><td colspan="9"><div class="empty-state">No timetable rows yet.</div></td></tr>';
    return rows;
  }

  async function editStudent(studentId) {
    const students = await SSMS.request('/admin/students');
    const student = students.find((item) => item.studentId === studentId);
    if (!student) return;

    document.getElementById('editStudentId').value = student.studentId;
    document.getElementById('editStudentName').value = student.name || '';
    document.getElementById('editStudentEmail').value = student.email || '';
    document.getElementById('editStudentClass').value = student.className || '';
    document.getElementById('editStudentSection').value = student.section || 'A';
    document.getElementById('editStudentAcademicYear').value = student.academicYear || currentYear();
    document.getElementById('editStudentGradeLevel').value = student.gradeLevel || '';
    document.getElementById('editStudentPassword').value = '';
    openModal('studentEditModal');
  }

  async function editTeacher(teacherId) {
    const teachers = await SSMS.request('/admin/teachers');
    const teacher = teachers.find((item) => item.teacherId === teacherId);
    if (!teacher) return;

    document.getElementById('editTeacherId').value = teacher.teacherId;
    document.getElementById('editTeacherName').value = teacher.name || '';
    document.getElementById('editTeacherEmail').value = teacher.email || '';
    document.getElementById('editTeacherSubject').value = teacher.subject || '';
    document.getElementById('editTeacherAcademicYear').value = teacher.academicYear || currentYear();
    document.getElementById('editTeacherPassword').value = '';
    document.getElementById('editTeacherClasses').value = JSON.stringify(teacher.classes || [], null, 2);
    openModal('teacherEditModal');
  }

  async function editAttendance(attendanceId) {
    const records = await SSMS.request('/admin/attendance');
    const record = records.find((item) => item._id === attendanceId);
    if (!record) return;

    document.getElementById('editAttendanceId').value = record._id;
    document.getElementById('editAttendanceStatus').value = record.status || 'Present';
    document.getElementById('editAttendanceDate').value = record.date || '';
    document.getElementById('editAttendanceAcademicYear').value = record.academicYear || currentYear();
    document.getElementById('editAttendanceTerm').value = record.term || 'Term 1';
    openModal('attendanceEditModal');
  }

  async function editTimetable(timetableId) {
    const rows = await loadTimetableForEditMode();
    const row = rows.find((item) => item._id === timetableId);
    if (!row) return;

    document.getElementById('editTimetableId').value = row._id;
    document.getElementById('editTimetableDay').value = row.day || '';
    document.getElementById('editTimetablePeriod').value = row.period || '';
    document.getElementById('editTimetableSubject').value = row.subject || '';
    document.getElementById('editTimetableTeacherName').value = row.teacherName || '';
    document.getElementById('editTimetableAcademicYear').value = row.academicYear || currentYear();
    document.getElementById('editTimetableTerm').value = row.term || 'Term 1';
    openModal('timetableEditModal');
  }

  document.getElementById('adminLogout').addEventListener('click', () => SSMS.logout());

  navButtons.forEach((button) => {
    button.addEventListener('click', () => showSection(button.dataset.section));
  });

  document.getElementById('studentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await SSMS.request('/admin/students', {
      method: 'POST',
      body: {
        name: document.getElementById('studentName').value,
        email: document.getElementById('studentEmail').value,
        password: document.getElementById('studentPassword').value,
        studentId: document.getElementById('studentId').value,
        className: document.getElementById('studentClass').value,
        section: document.getElementById('studentSection').value,
        academicYear: document.getElementById('studentAcademicYear').value,
        gradeLevel: document.getElementById('studentGradeLevel').value
      }
    });
    event.target.reset();
    document.getElementById('studentAcademicYear').value = currentYear();
    SSMS.toast('Student saved', 'success');
    await refreshAll();
  });

  document.getElementById('teacherForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const subject = document.getElementById('teacherSubject').value;
    await SSMS.request('/admin/teachers', {
      method: 'POST',
      body: {
        name: document.getElementById('teacherName').value,
        email: document.getElementById('teacherEmail').value,
        password: document.getElementById('teacherPassword').value,
        teacherId: document.getElementById('teacherId').value,
        subject,
        academicYear: document.getElementById('teacherAcademicYear').value,
        classes: readTeacherAssignments()
      }
    });
    event.target.reset();
    document.getElementById('teacherAcademicYear').value = currentYear();
    ensureTeacherAssignmentRows();
    SSMS.toast('Teacher saved', 'success');
    await refreshAll();
  });

  document.getElementById('viewAttendanceBtn').addEventListener('click', loadAttendance);
  document.getElementById('buildReportBtn').addEventListener('click', buildReport);
  document.getElementById('exportCsvBtn').addEventListener('click', () => exportReport('csv'));
  document.getElementById('exportPdfBtn').addEventListener('click', () => exportReport('pdf'));
  document.getElementById('loadTimetableBtn').addEventListener('click', loadTimetable);
  document.getElementById('loadStudentMarksheetBtn').addEventListener('click', loadStudentMarksheet);
  document.getElementById('loadClassResultBtn').addEventListener('click', loadClassSheet);
  document.getElementById('downloadStudentMarksheetBtn').addEventListener('click', () => {
    const studentId = document.getElementById('resultStudentId').value.trim();
    const examId = document.getElementById('resultExamSelect').value;
    if (!studentId || !examId) {
      SSMS.toast('Enter a student ID and select an exam', 'error');
      return;
    }
    SSMS.download(
      `/results/export?studentId=${encodeURIComponent(studentId)}&examId=${encodeURIComponent(examId)}&format=pdf`,
      `${studentId}-report-card.pdf`
    ).catch((error) => SSMS.toast(error.message, 'error'));
  });
  document.getElementById('downloadClassResultBtn').addEventListener('click', () => {
    const className = document.getElementById('classResultClassSelect').value;
    const examId = document.getElementById('classResultExamSelect').value;
    if (!className || !examId) {
      SSMS.toast('Select a class and exam', 'error');
      return;
    }
    SSMS.download(
      `/results/export?className=${encodeURIComponent(className)}&examId=${encodeURIComponent(examId)}&format=pdf`,
      `${className}-results.pdf`
    ).catch((error) => SSMS.toast(error.message, 'error'));
  });
  document.getElementById('examForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await SSMS.request('/results/exams', {
        method: 'POST',
        body: {
          name: document.getElementById('examName').value,
          className: document.getElementById('examClassName').value,
          section: document.getElementById('examSection').value,
          academicYear: document.getElementById('examAcademicYear').value,
          term: document.getElementById('examTerm').value,
          subjects: document.getElementById('examSubjects').value,
          published: document.getElementById('examPublished').checked,
          locked: document.getElementById('examLocked').checked
        }
      });
      event.target.reset();
      document.getElementById('examAcademicYear').value = currentYear();
      SSMS.toast('Exam saved', 'success');
      await loadExams();
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });

  document.getElementById('noticeForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await SSMS.request('/notices', {
        method: 'POST',
        body: {
          title: document.getElementById('noticeTitle').value,
          message: document.getElementById('noticeMessage').value,
          audienceRole: document.getElementById('noticeAudienceRole').value,
          className: document.getElementById('noticeClassName').value,
          section: document.getElementById('noticeSection').value,
          pinned: document.getElementById('noticePinned').checked,
          published: document.getElementById('noticePublished').checked
        }
      });
      event.target.reset();
      document.getElementById('noticePublished').checked = true;
      SSMS.toast('Notice saved', 'success');
      await loadNotices();
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });

  document.getElementById('feeForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await SSMS.request('/fees', {
        method: 'POST',
        body: {
          studentId: document.getElementById('feeStudentId').value,
          className: document.getElementById('feeClassName').value,
          title: document.getElementById('feeTitle').value,
          amount: document.getElementById('feeAmount').value,
          dueDate: document.getElementById('feeDueDate').value,
          academicYear: document.getElementById('feeAcademicYear').value,
          term: document.getElementById('feeTerm').value,
          notes: document.getElementById('feeNotes').value
        }
      });
      event.target.reset();
      document.getElementById('feeAcademicYear').value = currentYear();
      SSMS.toast('Fee record saved', 'success');
      await loadFees();
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });

  document.getElementById('parentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await SSMS.request('/admin/parents', {
        method: 'POST',
        body: {
          name: document.getElementById('parentName').value,
          email: document.getElementById('parentEmail').value,
          password: document.getElementById('parentPassword').value,
          parentId: document.getElementById('parentId').value,
          phone: document.getElementById('parentPhone').value,
          children: document.getElementById('parentChildren').value
        }
      });
      event.target.reset();
      SSMS.toast('Parent saved', 'success');
      await loadParents();
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });

  document.getElementById('addTeacherClassBtn').addEventListener('click', () => addTeacherAssignmentRow());
  document.getElementById('teacherClassAssignments').addEventListener('click', (event) => {
    const button = event.target.closest('.remove-assignment-btn');
    if (!button) return;
    const rows = document.querySelectorAll('#teacherClassAssignments .assignment-row');
    if (rows.length === 1) {
      rows[0].querySelector('.teacher-class-name').value = '';
      rows[0].querySelector('.teacher-class-subject').value = '';
      return;
    }
    button.closest('.assignment-row').remove();
  });

  document.getElementById('studentsTableBody').addEventListener('click', async (event) => {
    const editId = event.target.dataset.editStudent;
    const deleteId = event.target.dataset.deleteStudent;
    if (editId) return editStudent(editId);
    if (!deleteId) return;
    if (!window.confirm('Delete this student?')) return;
    await SSMS.request(`/admin/students/${deleteId}`, { method: 'DELETE' });
    SSMS.toast('Student deleted', 'success');
    await refreshAll();
  });

  document.getElementById('teachersTableBody').addEventListener('click', async (event) => {
    const editId = event.target.dataset.editTeacher;
    const deleteId = event.target.dataset.deleteTeacher;
    if (editId) return editTeacher(editId);
    if (!deleteId) return;
    if (!window.confirm('Delete this teacher?')) return;
    await SSMS.request(`/admin/teachers/${deleteId}`, { method: 'DELETE' });
    SSMS.toast('Teacher deleted', 'success');
    await refreshAll();
  });

  document.getElementById('attendanceTableBody').addEventListener('click', async (event) => {
    const editId = event.target.dataset.editAttendance;
    const deleteId = event.target.dataset.deleteAttendance;
    if (editId) return editAttendance(editId);
    if (!deleteId) return;
    if (!window.confirm('Delete this attendance record?')) return;
    await SSMS.request(`/admin/attendance/${deleteId}`, { method: 'DELETE' });
    SSMS.toast('Attendance deleted', 'success');
    await refreshAll();
    await loadAttendance();
  });

  document.getElementById('timetableTableBody').addEventListener('click', async (event) => {
    const editId = event.target.dataset.editTimetable;
    const deleteId = event.target.dataset.deleteTimetable;
    if (editId) return editTimetable(editId);
    if (!deleteId) return;
    if (!window.confirm('Delete this timetable row?')) return;
    await SSMS.request(`/timetable/${deleteId}`, { method: 'DELETE' });
    SSMS.toast('Timetable row deleted', 'success');
    await loadTimetable();
  });

  document.getElementById('examTableBody').addEventListener('click', async (event) => {
    const publishId = event.target.dataset.toggleExamPublished;
    const lockId = event.target.dataset.toggleExamLocked;
    const deleteId = event.target.dataset.deleteExam;
    if (!publishId && !lockId && !deleteId) return;

    try {
      if (deleteId) {
        if (!window.confirm('Delete this exam and all related results?')) return;
        await SSMS.request(`/results/exams/${deleteId}`, { method: 'DELETE' });
      } else {
        const exam = state.results.exams.find((item) => item.id === (publishId || lockId));
        if (!exam) return;
        await SSMS.request(`/results/exams/${exam.id}`, {
          method: 'PATCH',
          body: {
            published: publishId ? !exam.published : exam.published,
            locked: lockId ? !exam.locked : exam.locked
          }
        });
      }
      SSMS.toast('Exam updated', 'success');
      await loadExams();
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });

  document.getElementById('noticeTableBody').addEventListener('click', async (event) => {
    const publishId = event.target.dataset.toggleNoticePublished;
    const deleteId = event.target.dataset.deleteNotice;
    if (!publishId && !deleteId) return;

    try {
      if (deleteId) {
        await SSMS.request(`/notices/${deleteId}`, { method: 'DELETE' });
      } else {
        const notice = state.notices.find((item) => item.id === publishId);
        if (!notice) return;
        await SSMS.request(`/notices/${notice.id}`, {
          method: 'PATCH',
          body: { published: !notice.published }
        });
      }
      SSMS.toast('Notice updated', 'success');
      await loadNotices();
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });

  document.getElementById('feeTableBody').addEventListener('click', async (event) => {
    const paidId = event.target.dataset.markFeePaid;
    const deleteId = event.target.dataset.deleteFee;
    if (!paidId && !deleteId) return;

    try {
      if (deleteId) {
        await SSMS.request(`/fees/${deleteId}`, { method: 'DELETE' });
      } else {
        await SSMS.request(`/fees/${paidId}`, {
          method: 'PATCH',
          body: { status: 'Paid', paidAt: new Date().toISOString() }
        });
      }
      SSMS.toast('Fee record updated', 'success');
      await loadFees();
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });

  document.getElementById('parentTableBody').addEventListener('click', async (event) => {
    const deleteId = event.target.dataset.deleteParent;
    if (!deleteId) return;
    if (!window.confirm('Delete this parent account?')) return;
    try {
      await SSMS.request(`/admin/parents/${deleteId}`, { method: 'DELETE' });
      SSMS.toast('Parent deleted', 'success');
      await loadParents();
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });

  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', closeAllModals);
  });

  document.getElementById('editStudentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const studentId = document.getElementById('editStudentId').value;
    await SSMS.request(`/admin/students/${encodeURIComponent(studentId)}`, {
      method: 'PATCH',
      body: {
        name: document.getElementById('editStudentName').value,
        email: document.getElementById('editStudentEmail').value,
        className: document.getElementById('editStudentClass').value,
        section: document.getElementById('editStudentSection').value,
        academicYear: document.getElementById('editStudentAcademicYear').value,
        gradeLevel: document.getElementById('editStudentGradeLevel').value,
        password: document.getElementById('editStudentPassword').value
      }
    });
    closeAllModals();
    SSMS.toast('Student updated', 'success');
    await refreshAll();
  });

  document.getElementById('editTeacherForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const teacherId = document.getElementById('editTeacherId').value;
    let classes = [];
    try {
      classes = parseTeacherClassesJson(document.getElementById('editTeacherClasses').value, document.getElementById('editTeacherSubject').value);
    } catch (error) {
      SSMS.toast(error.message, 'error');
      return;
    }
    await SSMS.request(`/admin/teachers/${encodeURIComponent(teacherId)}`, {
      method: 'PATCH',
      body: {
        name: document.getElementById('editTeacherName').value,
        email: document.getElementById('editTeacherEmail').value,
        subject: document.getElementById('editTeacherSubject').value,
        academicYear: document.getElementById('editTeacherAcademicYear').value,
        password: document.getElementById('editTeacherPassword').value,
        classes
      }
    });
    closeAllModals();
    SSMS.toast('Teacher updated', 'success');
    await refreshAll();
  });

  document.getElementById('editAttendanceForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const attendanceId = document.getElementById('editAttendanceId').value;
    await SSMS.request(`/admin/attendance/${encodeURIComponent(attendanceId)}`, {
      method: 'PATCH',
      body: {
        status: document.getElementById('editAttendanceStatus').value,
        date: document.getElementById('editAttendanceDate').value,
        academicYear: document.getElementById('editAttendanceAcademicYear').value,
        term: document.getElementById('editAttendanceTerm').value
      }
    });
    closeAllModals();
    SSMS.toast('Attendance updated', 'success');
    await loadAttendance();
    await loadStats();
  });

  document.getElementById('editTimetableForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const timetableId = document.getElementById('editTimetableId').value;
    await SSMS.request(`/timetable/${encodeURIComponent(timetableId)}`, {
      method: 'PATCH',
      body: {
        day: document.getElementById('editTimetableDay').value,
        period: document.getElementById('editTimetablePeriod').value,
        subject: document.getElementById('editTimetableSubject').value,
        teacherName: document.getElementById('editTimetableTeacherName').value,
        academicYear: document.getElementById('editTimetableAcademicYear').value,
        term: document.getElementById('editTimetableTerm').value
      }
    });
    closeAllModals();
    SSMS.toast('Timetable updated', 'success');
    await loadTimetable();
  });

  document.getElementById('timetableForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const row = await SSMS.request('/timetable', {
        method: 'POST',
        body: {
          className: document.getElementById('timetableClassName').value,
          section: document.getElementById('timetableSection').value,
          academicYear: document.getElementById('timetableAcademicYear').value,
          term: document.getElementById('timetableTerm').value,
          day: document.getElementById('timetableDay').value,
          period: document.getElementById('timetablePeriod').value,
          subject: document.getElementById('timetableSubject').value,
          teacherName: document.getElementById('timetableTeacherName').value
        }
      });
      event.target.reset();
      document.getElementById('timetableAcademicYear').value = currentYear();
      document.getElementById('timetableClassFilter').value = row.className || '';
      document.getElementById('timetableSectionFilter').value = row.section || '';
      document.getElementById('timetableYearFilter').value = row.academicYear || currentYear();
      document.getElementById('timetableTermFilter').value = row.term || '';
      SSMS.toast('Timetable row saved', 'success');
      await loadTimetable();
    } catch (error) {
      SSMS.toast(error.message, 'error');
    }
  });

  document.getElementById('changePasswordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await SSMS.request('/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: document.getElementById('currentPassword').value,
        newPassword: document.getElementById('newPassword').value
      }
    });
    event.target.reset();
    SSMS.toast('Password updated', 'success');
  });

  document.getElementById('requestResetBtn').addEventListener('click', async () => {
    const email = document.getElementById('resetEmail').value;
    const response = await SSMS.request('/auth/request-password-reset', {
      method: 'POST',
      auth: false,
      body: { email }
    });
    document.getElementById('resetToken').value = response.resetToken || '';
    SSMS.toast('Reset token generated', 'success');
  });

  document.getElementById('confirmResetBtn').addEventListener('click', async () => {
    await SSMS.request('/auth/reset-password', {
      method: 'POST',
      auth: false,
      body: {
        email: document.getElementById('resetEmail').value,
        token: document.getElementById('resetToken').value,
        newPassword: document.getElementById('resetNewPassword').value
      }
    });
    document.getElementById('resetTokenForm').reset();
    SSMS.toast('Password reset complete', 'success');
  });

  document.getElementById('studentFilterBtn').addEventListener('click', loadStudents);
  document.getElementById('teacherFilterBtn').addEventListener('click', loadTeachers);

  document.querySelectorAll('.nav-link').forEach((button) => {
    button.addEventListener('click', () => showSection(button.dataset.section));
  });

  function refreshAll() {
    return Promise.all([
      loadCatalog(),
      loadStats(),
      loadStudents(),
      loadTeachers(),
      loadAttendance(),
      loadTimetable(),
      loadAnalytics(),
      loadExams(),
      loadNotices(),
      loadFees(),
      loadParents(),
      loadAuditLogs()
    ]);
  }

  showSection('students');
  await refreshAll();
  ensureTeacherAssignmentRows();

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAllModals();
  });
});
