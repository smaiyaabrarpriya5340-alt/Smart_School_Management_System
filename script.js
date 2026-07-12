// Data Storage Keys
const STORAGE_KEYS = {
    USERS: 'ssms_users',
    STUDENTS: 'ssms_students',
    TEACHERS: 'ssms_teachers',
    ATTENDANCE: 'ssms_attendance',
    CURRENT_USER: 'ssms_current_user'
};

// Initialize default admin user if not exists
function initializeDefaultAdmin() {
    const users = getFromStorage(STORAGE_KEYS.USERS) || [];
    const teachers = getFromStorage(STORAGE_KEYS.TEACHERS) || [];
    const adminExists = users.some(u => u.role === 'admin');
    
    if (!adminExists) {
        const defaultAdmin = {
            id: 'admin001',
            name: 'Administrator',
            email: 'admin@school.com',
            password: 'admin123',
            role: 'admin'
        };
        users.push(defaultAdmin);
        saveToStorage(STORAGE_KEYS.USERS, users);
    }

    // Initialize default teacher for testing
    const teacherExists = users.some(u => u.role === 'teacher' && u.email === 'teacher@school.com');
    if (!teacherExists) {
        const defaultTeacher = {
            id: 'teacher001',
            name: 'Md.Abdullah Ibn Noor Teacher',
            email: 'teacher@school.com',
            password: 'teacher123',
            role: 'teacher'
        };
        users.push(defaultTeacher);
        
        const defaultTeacherData = {
            id: 'teacher001',
            name: 'Md.Abdullah Ibn Noor Teacher',
            email: 'teacher@school.com',
            subject: 'WEB DEVELOPMENT',
            classes: [
                { name: 'Class A', subject: 'WEB DEVELOPMENT' },
                { name: 'Class B', subject: 'SOFTWARE DEVELOPMENT' }
            ]
        };
        teachers.push(defaultTeacherData);
        
        saveToStorage(STORAGE_KEYS.USERS, users);
        saveToStorage(STORAGE_KEYS.TEACHERS, teachers);
    } else {
        // Update existing teacher's classes with proper subjects if needed
        const existingTeacher = teachers.find(t => t.id === 'teacher001');
        if (existingTeacher && (!existingTeacher.classes || existingTeacher.classes.length === 0 || typeof existingTeacher.classes[0] === 'string')) {
            // Convert old format to new format
            existingTeacher.classes = [
                { name: 'Class A', subject: 'WEB DEVELOPMENT' },
                { name: 'Class B', subject: 'SOFTWARE DEVELOPMENT' }
            ];
            existingTeacher.subject = 'WEB DEVELOPMENT'; // Default subject
            saveToStorage(STORAGE_KEYS.TEACHERS, teachers);
        }
    }
}

// LocalStorage Helper Functions
function saveToStorage(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function getFromStorage(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeDefaultAdmin();
    checkCurrentUser();
    setupEventListeners();
    setTodayDate();
});

// Set today's date in date inputs
function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        if (!input.value) {
            input.value = today;
        }
    });
}

// Check if user is already logged in
function checkCurrentUser() {
    const currentUser = getFromStorage(STORAGE_KEYS.CURRENT_USER);
    if (currentUser) {
        showDashboard(currentUser.role);
        loadDashboardData(currentUser);
    } else {
        showPage('loginPage');
    }
}

// Show specific page
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
}

// Show dashboard based on role
function showDashboard(role) {
    showPage(role + 'Dashboard');
    const currentUser = getFromStorage(STORAGE_KEYS.CURRENT_USER);
    if (currentUser) {
        loadDashboardData(currentUser);
    }
}

// Setup all event listeners
function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('showRegister').addEventListener('click', () => showPage('registerPage'));
    document.getElementById('showLogin').addEventListener('click', () => showPage('loginPage'));

    // Registration form
    document.getElementById('registerForm').addEventListener('submit', handleRegistration);

    // Admin dashboard
    setupAdminListeners();

    // Teacher dashboard
    setupTeacherListeners();

    // Student dashboard
    setupStudentListeners();

    // Modal close buttons
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').classList.remove('active');
        });
    });

    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.classList.remove('active');
        }
    });
}

// Admin event listeners
function setupAdminListeners() {
    document.getElementById('adminLogout').addEventListener('click', handleLogout);
    
    // Navigation
    document.querySelectorAll('#adminDashboard .nav-menu a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            switchAdminSection(section);
        });
    });

    // Add student
    document.getElementById('addStudentBtn').addEventListener('click', () => {
        document.getElementById('addStudentModal').classList.add('active');
    });
    document.getElementById('addStudentForm').addEventListener('submit', handleAddStudent);

    // Add teacher
    document.getElementById('addTeacherBtn').addEventListener('click', () => {
        document.getElementById('addTeacherModal').classList.add('active');
    });
    document.getElementById('addTeacherForm').addEventListener('submit', handleAddTeacher);

    // View attendance
    document.getElementById('viewAttendanceBtn').addEventListener('click', loadAdminAttendance);
}

// Teacher event listeners
function setupTeacherListeners() {
    document.getElementById('teacherLogout').addEventListener('click', handleLogout);
    
    // Navigation
    document.querySelectorAll('#teacherDashboard .nav-menu a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            switchTeacherSection(section, this);
        });
    });

    // Load students for attendance
    document.getElementById('loadStudentsBtn').addEventListener('click', loadStudentsForAttendance);
    document.getElementById('viewAttendanceBtnTeacher').addEventListener('click', loadTeacherAttendance);
}

// Student event listeners
function setupStudentListeners() {
    document.getElementById('studentLogout').addEventListener('click', handleLogout);
    
    // Navigation
    document.querySelectorAll('#studentDashboard .nav-menu a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            switchStudentSection(section);
        });
    });

    document.getElementById('viewMyAttendanceBtn').addEventListener('click', loadStudentAttendance);
}

// Switch admin sections
function switchAdminSection(section) {
    document.querySelectorAll('#adminDashboard .content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    document.querySelectorAll('#adminDashboard .nav-menu a').forEach(link => {
        link.classList.remove('active');
    });

    const sectionMap = {
        'students': 'studentsSection',
        'teachers': 'teachersSection',
        'attendance': 'attendanceSection',
        'adminStats': 'adminStatsSection'
    };

    document.getElementById(sectionMap[section]).classList.add('active');
    event.target.classList.add('active');

    // Load section data
    if (section === 'students') {
        loadStudentsTable();
    } else if (section === 'teachers') {
        loadTeachersTable();
    } else if (section === 'adminStats') {
        loadAdminStats();
    }
}

// Switch teacher sections
function switchTeacherSection(section, clickedElement) {
    document.querySelectorAll('#teacherDashboard .content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    document.querySelectorAll('#teacherDashboard .nav-menu a').forEach(link => {
        link.classList.remove('active');
    });

    const sectionMap = {
        'myClasses': 'myClassesSection',
        'markAttendance': 'markAttendanceSection',
        'viewAttendance': 'viewAttendanceSection'
    };

    if (sectionMap[section]) {
        document.getElementById(sectionMap[section]).classList.add('active');
    }
    
    if (clickedElement) {
        clickedElement.classList.add('active');
    }

    if (section === 'myClasses') {
        loadTeacherClasses();
    } else if (section === 'markAttendance') {
        populateTeacherClassSelects();
    } else if (section === 'viewAttendance') {
        populateTeacherClassSelects();
    }
}

// Switch student sections
function switchStudentSection(section) {
    document.querySelectorAll('#studentDashboard .content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    document.querySelectorAll('#studentDashboard .nav-menu a').forEach(link => {
        link.classList.remove('active');
    });

    const sectionMap = {
        'myProfile': 'myProfileSection',
        'myAttendance': 'myAttendanceSection'
    };

    document.getElementById(sectionMap[section]).classList.add('active');
    event.target.classList.add('active');
}

// Handle login
function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const role = document.getElementById('loginRole').value;

    const users = getFromStorage(STORAGE_KEYS.USERS) || [];
    const user = users.find(u => u.email === email && u.password === password && u.role === role);

    if (user) {
        saveToStorage(STORAGE_KEYS.CURRENT_USER, user);
        showDashboard(role);
        loadDashboardData(user);
    } else {
        alert('Invalid credentials. Please try again.');
    }
}

// Handle registration
function handleRegistration(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const studentId = document.getElementById('regStudentId').value;
    const studentClass = document.getElementById('regClass').value;
    const studentSection = document.getElementById('regSection').value;

    const users = getFromStorage(STORAGE_KEYS.USERS) || [];
    const students = getFromStorage(STORAGE_KEYS.STUDENTS) || [];

    // Check if email already exists
    if (users.some(u => u.email === email)) {
        alert('Email already registered. Please use a different email.');
        return;
    }

    // Check if student ID already exists
    if (students.some(s => s.id === studentId)) {
        alert('Student ID already exists. Please use a different ID.');
        return;
    }

    const newUser = {
        id: studentId,
        name: name,
        email: email,
        password: password,
        role: 'student'
    };

    const newStudent = {
        id: studentId,
        name: name,
        email: email,
        class: studentClass,
        section: studentSection
    };

    users.push(newUser);
    students.push(newStudent);

    saveToStorage(STORAGE_KEYS.USERS, users);
    saveToStorage(STORAGE_KEYS.STUDENTS, students);

    alert('Registration successful! Please login.');
    showPage('loginPage');
    document.getElementById('registerForm').reset();
}

// Handle logout
function handleLogout() {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    showPage('loginPage');
    document.getElementById('loginForm').reset();
}

// Load dashboard data
function loadDashboardData(user) {
    if (user.role === 'admin') {
        document.getElementById('adminUserName').textContent = user.name;
        loadStudentsTable();
        loadTeachersTable();
        loadAdminStats();
        populateClassFilter();
    } else if (user.role === 'teacher') {
        document.getElementById('teacherUserName').textContent = user.name;
        // Activate first section
        document.querySelectorAll('#teacherDashboard .content-section').forEach(sec => {
            sec.classList.remove('active');
        });
        document.getElementById('myClassesSection').classList.add('active');
        // Activate first nav link
        document.querySelectorAll('#teacherDashboard .nav-menu a').forEach(link => {
            link.classList.remove('active');
        });
        const firstNavLink = document.querySelector('#teacherDashboard .nav-menu a[data-section="myClasses"]');
        if (firstNavLink) {
            firstNavLink.classList.add('active');
        }
        loadTeacherClasses();
        populateTeacherClassSelects();
    } else if (user.role === 'student') {
        document.getElementById('studentUserName').textContent = user.name;
        loadStudentProfile(user);
    }
}

// Load students table
function loadStudentsTable() {
    const students = getFromStorage(STORAGE_KEYS.STUDENTS) || [];
    const tbody = document.getElementById('studentsTableBody');
    tbody.innerHTML = '';

    students.forEach(student => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${student.id}</td>
            <td>${student.name}</td>
            <td>${student.email}</td>
            <td>${student.class}</td>
            <td>${student.section || 'N/A'}</td>
            <td>
                <button class="btn btn-danger" onclick="deleteStudent('${student.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Load teachers table
function loadTeachersTable() {
    const teachers = getFromStorage(STORAGE_KEYS.TEACHERS) || [];
    const tbody = document.getElementById('teachersTableBody');
    tbody.innerHTML = '';

    teachers.forEach(teacher => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${teacher.id}</td>
            <td>${teacher.name}</td>
            <td>${teacher.email}</td>
            <td>${teacher.subject}</td>
            <td>
                <button class="btn btn-danger" onclick="deleteTeacher('${teacher.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Add student
function handleAddStudent(e) {
    e.preventDefault();
    const name = document.getElementById('studentName').value;
    const email = document.getElementById('studentEmail').value;
    const password = document.getElementById('studentPassword').value;
    const studentId = document.getElementById('studentId').value;
    const studentClass = document.getElementById('studentClass').value;
    const studentSection = document.getElementById('studentSection').value;

    const users = getFromStorage(STORAGE_KEYS.USERS) || [];
    const students = getFromStorage(STORAGE_KEYS.STUDENTS) || [];

    if (users.some(u => u.email === email) || students.some(s => s.id === studentId)) {
        alert('Email or Student ID already exists.');
        return;
    }

    const newUser = {
        id: studentId,
        name: name,
        email: email,
        password: password,
        role: 'student'
    };

    const newStudent = {
        id: studentId,
        name: name,
        email: email,
        class: studentClass,
        section: studentSection
    };

    users.push(newUser);
    students.push(newStudent);

    saveToStorage(STORAGE_KEYS.USERS, users);
    saveToStorage(STORAGE_KEYS.STUDENTS, students);

    document.getElementById('addStudentModal').classList.remove('active');
    document.getElementById('addStudentForm').reset();
    loadStudentsTable();
    loadAdminStats();
    alert('Student added successfully!');
}

// Add teacher
function handleAddTeacher(e) {
    e.preventDefault();
    const name = document.getElementById('teacherName').value;
    const email = document.getElementById('teacherEmail').value;
    const password = document.getElementById('teacherPassword').value;
    const teacherId = document.getElementById('teacherId').value;
    const subject = document.getElementById('teacherSubject').value;
    const classesInput = document.getElementById('teacherClasses').value;
    
    // Parse classes - support format: "Class A: Subject1, Class B: Subject2" or "Class A, Class B" (uses default subject)
    const classes = classesInput.split(',').map(c => {
        const trimmed = c.trim();
        if (trimmed.includes(':')) {
            const [className, classSubject] = trimmed.split(':').map(s => s.trim());
            return { name: className, subject: classSubject || subject };
        } else {
            return { name: trimmed, subject: subject };
        }
    }).filter(c => c.name);

    const users = getFromStorage(STORAGE_KEYS.USERS) || [];
    const teachers = getFromStorage(STORAGE_KEYS.TEACHERS) || [];

    if (users.some(u => u.email === email) || teachers.some(t => t.id === teacherId)) {
        alert('Email or Teacher ID already exists.');
        return;
    }

    const newUser = {
        id: teacherId,
        name: name,
        email: email,
        password: password,
        role: 'teacher'
    };

    const newTeacher = {
        id: teacherId,
        name: name,
        email: email,
        subject: subject, // Default subject
        classes: classes
    };

    users.push(newUser);
    teachers.push(newTeacher);

    saveToStorage(STORAGE_KEYS.USERS, users);
    saveToStorage(STORAGE_KEYS.TEACHERS, teachers);

    document.getElementById('addTeacherModal').classList.remove('active');
    document.getElementById('addTeacherForm').reset();
    loadTeachersTable();
    loadAdminStats();
    alert('Teacher added successfully!');
}

// Delete student
function deleteStudent(studentId) {
    if (confirm('Are you sure you want to delete this student?')) {
        let users = getFromStorage(STORAGE_KEYS.USERS) || [];
        let students = getFromStorage(STORAGE_KEYS.STUDENTS) || [];

        users = users.filter(u => u.id !== studentId);
        students = students.filter(s => s.id !== studentId);

        saveToStorage(STORAGE_KEYS.USERS, users);
        saveToStorage(STORAGE_KEYS.STUDENTS, students);

        loadStudentsTable();
        loadAdminStats();
    }
}

// Delete teacher
function deleteTeacher(teacherId) {
    if (confirm('Are you sure you want to delete this teacher?')) {
        let users = getFromStorage(STORAGE_KEYS.USERS) || [];
        let teachers = getFromStorage(STORAGE_KEYS.TEACHERS) || [];

        users = users.filter(u => u.id !== teacherId);
        teachers = teachers.filter(t => t.id !== teacherId);

        saveToStorage(STORAGE_KEYS.USERS, users);
        saveToStorage(STORAGE_KEYS.TEACHERS, teachers);

        loadTeachersTable();
        loadAdminStats();
    }
}

// Load admin stats
function loadAdminStats() {
    const students = getFromStorage(STORAGE_KEYS.STUDENTS) || [];
    const teachers = getFromStorage(STORAGE_KEYS.TEACHERS) || [];
    const attendance = getFromStorage(STORAGE_KEYS.ATTENDANCE) || [];

    document.getElementById('totalStudents').textContent = students.length;
    document.getElementById('totalTeachers').textContent = teachers.length;

    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = attendance.filter(a => a.date === today);
    const totalStudents = students.length;
    const presentToday = todayAttendance.filter(a => a.status === 'Present').length;
    const percentage = totalStudents > 0 ? Math.round((presentToday / totalStudents) * 100) : 0;
    document.getElementById('todayAttendance').textContent = percentage + '%';
}

// Populate class filter
function populateClassFilter() {
    const students = getFromStorage(STORAGE_KEYS.STUDENTS) || [];
    const classes = [...new Set(students.map(s => s.class))];
    const filter = document.getElementById('attendanceClassFilter');
    
    filter.innerHTML = '<option value="">All Classes</option>';
    classes.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls;
        option.textContent = cls;
        filter.appendChild(option);
    });
}

// Load admin attendance
function loadAdminAttendance() {
    const classFilter = document.getElementById('attendanceClassFilter').value;
    const sectionFilter = document.getElementById('attendanceSectionFilter') ? document.getElementById('attendanceSectionFilter').value : '';
    const dateFilter = document.getElementById('attendanceDateFilter').value;
    const attendance = getFromStorage(STORAGE_KEYS.ATTENDANCE) || [];
    const students = getFromStorage(STORAGE_KEYS.STUDENTS) || [];

    let filteredAttendance = attendance;
    if (classFilter) {
        filteredAttendance = filteredAttendance.filter(a => {
            const student = students.find(s => s.id === a.studentId);
            return student && student.class === classFilter;
        });
    }
    if (sectionFilter) {
        filteredAttendance = filteredAttendance.filter(a => {
            const student = students.find(s => s.id === a.studentId);
            return student && student.section === sectionFilter;
        });
    }
    if (dateFilter) {
        filteredAttendance = filteredAttendance.filter(a => a.date === dateFilter);
    }

    const tbody = document.getElementById('attendanceTableBody');
    tbody.innerHTML = '';

    filteredAttendance.forEach(record => {
        const student = students.find(s => s.id === record.studentId);
        if (student) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${record.studentId}</td>
                <td>${student.name}</td>
                <td>${student.class}</td>
                <td>${student.section || 'N/A'}</td>
                <td>${record.date}</td>
                <td><span class="status-badge ${record.status.toLowerCase()}">${record.status}</span></td>
            `;
            tbody.appendChild(row);
        }
    });
}

// Load teacher classes
function loadTeacherClasses() {
    const currentUser = getFromStorage(STORAGE_KEYS.CURRENT_USER);
    if (!currentUser) return;
    
    const teachers = getFromStorage(STORAGE_KEYS.TEACHERS) || [];
    const teacher = teachers.find(t => t.id === currentUser.id);

    const container = document.getElementById('teacherClassesList');
    if (!container) return;
    
    container.innerHTML = '';

    if (teacher && teacher.classes && teacher.classes.length > 0) {
        teacher.classes.forEach(cls => {
            const card = document.createElement('div');
            card.className = 'class-card';
            // Support both old format (string) and new format (object)
            if (typeof cls === 'string') {
                card.innerHTML = `<h3>${cls}</h3><p>Subject: ${teacher.subject || 'Not specified'}</p>`;
            } else {
                card.innerHTML = `<h3>${cls.name}</h3><p>Subject: ${cls.subject || teacher.subject || 'Not specified'}</p>`;
            }
            container.appendChild(card);
        });
    } else {
        container.innerHTML = '<p>No classes assigned yet. Please contact administrator.</p>';
    }
}

// Populate teacher class selects
function populateTeacherClassSelects() {
    const currentUser = getFromStorage(STORAGE_KEYS.CURRENT_USER);
    if (!currentUser) return;
    
    const teachers = getFromStorage(STORAGE_KEYS.TEACHERS) || [];
    const teacher = teachers.find(t => t.id === currentUser.id);

    const selects = [document.getElementById('teacherClassSelect'), document.getElementById('viewClassSelect')];
    
    selects.forEach(select => {
        if (!select) return;
        select.innerHTML = '<option value="">Select Class</option>';
        if (teacher && teacher.classes && teacher.classes.length > 0) {
            teacher.classes.forEach(cls => {
                const option = document.createElement('option');
                // Support both old format (string) and new format (object)
                const className = typeof cls === 'string' ? cls : cls.name;
                option.value = className;
                option.textContent = className;
                select.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No classes assigned';
            option.disabled = true;
            select.appendChild(option);
        }
    });
}

// Load students for attendance marking
function loadStudentsForAttendance() {
    const selectedClass = document.getElementById('teacherClassSelect').value;
    const date = document.getElementById('attendanceDate').value;

    if (!selectedClass || !date) {
        alert('Please select a class and date.');
        return;
    }

    const students = getFromStorage(STORAGE_KEYS.STUDENTS) || [];
    const classStudents = students.filter(s => s.class === selectedClass);
    const attendance = getFromStorage(STORAGE_KEYS.ATTENDANCE) || [];

    const container = document.getElementById('attendanceMarkingArea');
    if (!container) {
        alert('Error: Attendance marking area not found.');
        return;
    }
    
    if (classStudents.length === 0) {
        container.innerHTML = '<p style="padding: 20px; color: #666;">No students found in this class.</p>';
        return;
    }

    container.innerHTML = '<h3>Mark Attendance for ' + selectedClass + ' - ' + date + '</h3>';

    classStudents.forEach(student => {
        const existingRecord = attendance.find(a => 
            a.studentId === student.id && a.date === date
        );

        const item = document.createElement('div');
        item.className = 'student-attendance-item';
        item.innerHTML = `
            <div>
                <strong>${student.name}</strong> (${student.id})
            </div>
            <div class="attendance-buttons">
                <button class="attendance-btn present ${existingRecord && existingRecord.status === 'Present' ? 'active' : ''}" 
                        onclick="markAttendance('${student.id}', '${date}', 'Present', this)">
                    Present
                </button>
                <button class="attendance-btn absent ${existingRecord && existingRecord.status === 'Absent' ? 'active' : ''}" 
                        onclick="markAttendance('${student.id}', '${date}', 'Absent', this)">
                    Absent
                </button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Mark attendance
function markAttendance(studentId, date, status, buttonElement) {
    let attendance = getFromStorage(STORAGE_KEYS.ATTENDANCE) || [];
    
    // Remove existing record for this student and date
    attendance = attendance.filter(a => !(a.studentId === studentId && a.date === date));
    
    // Add new record
    attendance.push({
        studentId: studentId,
        date: date,
        status: status
    });

    saveToStorage(STORAGE_KEYS.ATTENDANCE, attendance);

    // Update button states
    const item = buttonElement.closest('.student-attendance-item');
    const buttons = item.querySelectorAll('.attendance-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');
}

// Load teacher attendance view
function loadTeacherAttendance() {
    const selectedClass = document.getElementById('viewClassSelect').value;
    const date = document.getElementById('viewDateSelect').value;

    if (!selectedClass || !date) {
        alert('Please select a class and date.');
        return;
    }

    const students = getFromStorage(STORAGE_KEYS.STUDENTS) || [];
    const classStudents = students.filter(s => s.class === selectedClass);
    const attendance = getFromStorage(STORAGE_KEYS.ATTENDANCE) || [];

    const tbody = document.getElementById('teacherAttendanceTableBody');
    tbody.innerHTML = '';

    classStudents.forEach(student => {
        const record = attendance.find(a => 
            a.studentId === student.id && a.date === date
        );

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${student.id}</td>
            <td>${student.name}</td>
            <td>
                ${record ? 
                    `<span class="status-badge ${record.status.toLowerCase()}">${record.status}</span>` : 
                    '<span class="status-badge absent">Not Marked</span>'
                }
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Load student profile
function loadStudentProfile(user) {
    const students = getFromStorage(STORAGE_KEYS.STUDENTS) || [];
    const student = students.find(s => s.id === user.id);

    if (student) {
        document.getElementById('profileStudentId').textContent = student.id;
        document.getElementById('profileName').textContent = student.name;
        document.getElementById('profileEmail').textContent = student.email;
        document.getElementById('profileClass').textContent = student.class + (student.section ? ' - Section ' + student.section : '');
    }
}

// Load student attendance
function loadStudentAttendance() {
    const currentUser = getFromStorage(STORAGE_KEYS.CURRENT_USER);
    const monthFilter = document.getElementById('studentMonthFilter').value;

    if (!monthFilter) {
        alert('Please select a month.');
        return;
    }

    const attendance = getFromStorage(STORAGE_KEYS.ATTENDANCE) || [];
    const monthAttendance = attendance.filter(a => 
        a.studentId === currentUser.id && a.date.startsWith(monthFilter)
    );

    const tbody = document.getElementById('studentAttendanceTableBody');
    tbody.innerHTML = '';

    monthAttendance.forEach(record => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.date}</td>
            <td><span class="status-badge ${record.status.toLowerCase()}">${record.status}</span></td>
        `;
        tbody.appendChild(row);
    });

    // Calculate summary
    const present = monthAttendance.filter(a => a.status === 'Present').length;
    const absent = monthAttendance.filter(a => a.status === 'Absent').length;
    const total = monthAttendance.length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    document.getElementById('totalPresent').textContent = present;
    document.getElementById('totalAbsent').textContent = absent;
    document.getElementById('attendancePercentage').textContent = percentage + '%';
}

