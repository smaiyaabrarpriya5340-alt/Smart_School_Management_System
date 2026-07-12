const express = require('express');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');
const Notice = require('../models/Notice');
const Fee = require('../models/Fee');
const Attendance = require('../models/Attendance');
const Timetable = require('../models/Timetable');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../services/engagement');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

function currentAcademicYear() {
  return new Date().getFullYear().toString();
}

function normalizeTerm(term) {
  return term && String(term).trim() ? String(term).trim() : 'Term 1';
}

function normalizeSort(sortBy, order, allowedFields, fallbackField) {
  const field = allowedFields.includes(sortBy) ? sortBy : fallbackField;
  const direction = String(order).toLowerCase() === 'desc' ? -1 : 1;
  return { [field]: direction };
}

function toRegExp(value) {
  if (!value) return null;
  return new RegExp(String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function escapeRegex(value) {
  return String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildStudentFilter(query) {
  const filter = {};
  const search = toRegExp(query.search);

  if (query.studentId) filter.studentId = String(query.studentId).trim();
  if (query.className) filter.className = String(query.className).trim();
  if (query.section) filter.section = String(query.section).trim();
  if (query.academicYear) filter.academicYear = String(query.academicYear).trim();
  if (query.gradeLevel) filter.gradeLevel = String(query.gradeLevel).trim();
  if (search) {
    filter.$or = [
      { name: search },
      { email: search },
      { studentId: search },
      { className: search }
    ];
  }

  return filter;
}

function buildTeacherFilter(query) {
  const filter = {};
  const search = toRegExp(query.search);

  if (query.subject) filter.subject = String(query.subject).trim();
  if (query.academicYear) filter.academicYear = String(query.academicYear).trim();

  if (search) {
    filter.$or = [
      { name: search },
      { email: search },
      { teacherId: search },
      { subject: search }
    ];
  }

  return filter;
}

function buildAttendanceFilter(query) {
  const filter = {};
  const search = toRegExp(query.search);

  if (query.className) filter.className = String(query.className).trim();
  if (query.section) filter.section = String(query.section).trim();
  if (query.status) filter.status = String(query.status).trim();
  if (query.studentId) filter.studentId = String(query.studentId).trim();
  if (query.date) {
    filter.date = String(query.date).trim();
  } else if (query.dateFrom || query.dateTo) {
    filter.date = {};
    if (query.dateFrom) filter.date.$gte = String(query.dateFrom).trim();
    if (query.dateTo) filter.date.$lte = String(query.dateTo).trim();
  }
  if (query.academicYear) filter.academicYear = String(query.academicYear).trim();
  if (query.term) filter.term = normalizeTerm(query.term);
  if (search) {
    filter.$or = [
      { studentName: search },
      { studentId: search },
      { className: search }
    ];
  }

  return filter;
}

async function createUserAndReturn(password, role, name, email) {
  const passwordHash = await bcrypt.hash(password, 10);
  return User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role
  });
}

function resolveStudentPayload(student, user) {
  return {
    id: student._id.toString(),
    studentId: student.studentId,
    name: student.name,
    email: student.email,
    className: student.className,
    section: student.section,
    academicYear: student.academicYear || currentAcademicYear(),
    gradeLevel: student.gradeLevel || '',
    user: user
      ? {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role
        }
      : undefined
  };
}

function resolveTeacherPayload(teacher, user) {
  return {
    id: teacher._id.toString(),
    teacherId: teacher.teacherId,
    name: teacher.name,
    email: teacher.email,
    subject: teacher.subject,
    academicYear: teacher.academicYear || currentAcademicYear(),
    classes: teacher.classes || [],
    user: user
      ? {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role
        }
      : undefined
  };
}

router.get('/students', async (req, res) => {
  try {
    const filter = buildStudentFilter(req.query);
    const sort = normalizeSort(req.query.sortBy, req.query.order, ['name', 'studentId', 'className', 'section', 'academicYear', 'createdAt'], 'createdAt');
    const students = await Student.find(filter).sort(sort).lean();
    const userIds = students.map((student) => student.userId);
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    res.json(students.map((student) => resolveStudentPayload(student, userMap.get(student.userId.toString()))));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load students', error: error.message });
  }
});

router.post('/students', async (req, res) => {
  try {
    const { name, email, password, studentId, className, section, academicYear, gradeLevel } = req.body;

    if (!name || !email || !password || !studentId || !className || !section) {
      return res.status(400).json({ message: 'All student fields are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedStudentId = String(studentId).trim();

    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ message: 'Email already exists' });
    }
    if (await Student.findOne({ studentId: trimmedStudentId })) {
      return res.status(409).json({ message: 'Student ID already exists' });
    }

    const user = await createUserAndReturn(password, 'student', name, normalizedEmail);
    const student = await Student.create({
      userId: user._id,
      studentId: trimmedStudentId,
      name: name.trim(),
      email: normalizedEmail,
      className: className.trim(),
      section: section.trim(),
      academicYear: academicYear ? String(academicYear).trim() : currentAcademicYear(),
      gradeLevel: gradeLevel ? String(gradeLevel).trim() : ''
    });

    await logAudit({
      actor: req.user,
      action: 'CREATE',
      entityType: 'Student',
      entityId: student._id.toString(),
      summary: student.name
    });

    res.status(201).json(resolveStudentPayload(student, user));
  } catch (error) {
    res.status(500).json({ message: 'Unable to add student', error: error.message });
  }
});

router.patch('/students/:studentId', async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const user = await User.findById(student.userId);
    const {
      name,
      email,
      password,
      className,
      section,
      academicYear,
      gradeLevel
    } = req.body;

    if (name) {
      student.name = name.trim();
      if (user) user.name = name.trim();
    }
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: student.userId } });
      if (existing) {
        return res.status(409).json({ message: 'Email already exists' });
      }
      student.email = normalizedEmail;
      if (user) user.email = normalizedEmail;
    }
    if (className) student.className = className.trim();
    if (section) student.section = section.trim();
    if (academicYear) student.academicYear = String(academicYear).trim();
    if (gradeLevel !== undefined) student.gradeLevel = String(gradeLevel).trim();
    if (password) {
      if (user) {
        user.passwordHash = await bcrypt.hash(password, 10);
        user.passwordChangedAt = new Date();
      }
    }

    await student.save();
    if (user) await user.save();

    await logAudit({
      actor: req.user,
      action: 'UPDATE',
      entityType: 'Student',
      entityId: student._id.toString(),
      summary: student.name
    });

    res.json(resolveStudentPayload(student.toObject(), user));
  } catch (error) {
    res.status(500).json({ message: 'Unable to update student', error: error.message });
  }
});

router.delete('/students/:studentId', async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    await Attendance.deleteMany({ studentUserId: student.userId });
    await User.deleteOne({ _id: student.userId });
    await Student.deleteOne({ _id: student._id });
    await logAudit({
      actor: req.user,
      action: 'DELETE',
      entityType: 'Student',
      entityId: student._id.toString(),
      summary: student.name
    });

    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete student', error: error.message });
  }
});

router.get('/teachers', async (req, res) => {
  try {
    const filter = buildTeacherFilter(req.query);
    const sort = normalizeSort(req.query.sortBy, req.query.order, ['name', 'teacherId', 'subject', 'academicYear', 'createdAt'], 'createdAt');
    const teachers = await Teacher.find(filter).sort(sort).lean();
    const userIds = teachers.map((teacher) => teacher.userId);
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    res.json(teachers.map((teacher) => resolveTeacherPayload(teacher, userMap.get(teacher.userId.toString()))));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load teachers', error: error.message });
  }
});

router.post('/teachers', async (req, res) => {
  try {
    const { name, email, password, teacherId, subject, classes, academicYear } = req.body;

    if (!name || !email || !password || !teacherId || !subject) {
      return res.status(400).json({ message: 'All teacher fields are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedTeacherId = String(teacherId).trim();

    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ message: 'Email already exists' });
    }
    if (await Teacher.findOne({ teacherId: trimmedTeacherId })) {
      return res.status(409).json({ message: 'Teacher ID already exists' });
    }

    const teacherClasses = Array.isArray(classes) ? classes.filter((entry) => entry && entry.name) : [];
    const user = await createUserAndReturn(password, 'teacher', name, normalizedEmail);

    const teacher = await Teacher.create({
      userId: user._id,
      teacherId: trimmedTeacherId,
      name: name.trim(),
      email: normalizedEmail,
      subject: subject.trim(),
      academicYear: academicYear ? String(academicYear).trim() : currentAcademicYear(),
      classes: teacherClasses.length ? teacherClasses : [{ name: 'Unassigned', subject: subject.trim() }]
    });

    await logAudit({
      actor: req.user,
      action: 'CREATE',
      entityType: 'Teacher',
      entityId: teacher._id.toString(),
      summary: teacher.name
    });

    res.status(201).json(resolveTeacherPayload(teacher, user));
  } catch (error) {
    res.status(500).json({ message: 'Unable to add teacher', error: error.message });
  }
});

router.patch('/teachers/:teacherId', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ teacherId: req.params.teacherId });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const user = await User.findById(teacher.userId);
    const { name, email, password, subject, classes, academicYear } = req.body;

    if (name) {
      teacher.name = name.trim();
      if (user) user.name = name.trim();
    }
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: teacher.userId } });
      if (existing) {
        return res.status(409).json({ message: 'Email already exists' });
      }
      teacher.email = normalizedEmail;
      if (user) user.email = normalizedEmail;
    }
    if (subject) teacher.subject = subject.trim();
    if (academicYear) teacher.academicYear = String(academicYear).trim();
    if (classes && Array.isArray(classes)) {
      teacher.classes = classes.filter((entry) => entry && entry.name).map((entry) => ({
        name: String(entry.name).trim(),
        subject: String(entry.subject || teacher.subject).trim()
      }));
    }
    if (password) {
      if (user) {
        user.passwordHash = await bcrypt.hash(password, 10);
        user.passwordChangedAt = new Date();
      }
    }

    await teacher.save();
    if (user) await user.save();

    await logAudit({
      actor: req.user,
      action: 'UPDATE',
      entityType: 'Teacher',
      entityId: teacher._id.toString(),
      summary: teacher.name
    });

    res.json(resolveTeacherPayload(teacher.toObject(), user));
  } catch (error) {
    res.status(500).json({ message: 'Unable to update teacher', error: error.message });
  }
});

router.delete('/teachers/:teacherId', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ teacherId: req.params.teacherId });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    await User.deleteOne({ _id: teacher.userId });
    await Teacher.deleteOne({ _id: teacher._id });
    await logAudit({
      actor: req.user,
      action: 'DELETE',
      entityType: 'Teacher',
      entityId: teacher._id.toString(),
      summary: teacher.name
    });

    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete teacher', error: error.message });
  }
});

function parseChildStudentIds(rawChildren) {
  if (Array.isArray(rawChildren)) {
    return rawChildren.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof rawChildren === 'string' && rawChildren.trim()) {
    return rawChildren
      .split(',')
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  return [];
}

async function resolveParentChildren(studentIds) {
  if (!studentIds.length) return [];
  const students = await Student.find({ studentId: { $in: studentIds } }).lean();
  return students.map((student) => ({
    studentUserId: student.userId,
    studentId: student.studentId,
    relation: 'Guardian'
  }));
}

router.get('/parents', async (req, res) => {
  try {
    const parents = await Parent.find({}).sort({ createdAt: -1 }).lean();
    const users = await User.find({ _id: { $in: parents.map((parent) => parent.userId) } }).lean();
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    res.json(parents.map((parent) => ({
      id: parent._id.toString(),
      parentId: parent.parentId,
      name: parent.name,
      email: parent.email,
      phone: parent.phone || '',
      children: parent.children || [],
      user: userMap.get(parent.userId.toString()) ? {
        id: userMap.get(parent.userId.toString())._id.toString(),
        name: userMap.get(parent.userId.toString()).name,
        email: userMap.get(parent.userId.toString()).email,
        role: userMap.get(parent.userId.toString()).role
      } : undefined
    })));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load parents', error: error.message });
  }
});

router.post('/parents', async (req, res) => {
  try {
    const { name, email, password, parentId, phone, children } = req.body;
    if (!name || !email || !password || !parentId) {
      return res.status(400).json({ message: 'name, email, password, and parentId are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedParentId = String(parentId).trim();

    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ message: 'Email already exists' });
    }
    if (await Parent.findOne({ parentId: trimmedParentId })) {
      return res.status(409).json({ message: 'Parent ID already exists' });
    }

    const studentIds = parseChildStudentIds(children);
    const childPayload = await resolveParentChildren(studentIds);
    const user = await createUserAndReturn(password, 'parent', name, normalizedEmail);
    const parent = await Parent.create({
      userId: user._id,
      parentId: trimmedParentId,
      name: name.trim(),
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : '',
      children: childPayload
    });

    await logAudit({
      actor: req.user,
      action: 'CREATE',
      entityType: 'Parent',
      entityId: parent._id.toString(),
      summary: parent.name
    });

    res.status(201).json({
      id: parent._id.toString(),
      parentId: parent.parentId,
      name: parent.name,
      email: parent.email,
      phone: parent.phone || '',
      children: parent.children
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to add parent', error: error.message });
  }
});

router.patch('/parents/:parentId', async (req, res) => {
  try {
    const parent = await Parent.findOne({ parentId: req.params.parentId });
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    const user = await User.findById(parent.userId);
    const { name, email, password, phone, children } = req.body;
    if (name) {
      parent.name = String(name).trim();
      if (user) user.name = parent.name;
    }
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: parent.userId } });
      if (existing) {
        return res.status(409).json({ message: 'Email already exists' });
      }
      parent.email = normalizedEmail;
      if (user) user.email = normalizedEmail;
    }
    if (phone !== undefined) parent.phone = String(phone).trim();
    if (children !== undefined) {
      parent.children = await resolveParentChildren(parseChildStudentIds(children));
    }
    if (password) {
      if (user) {
        user.passwordHash = await bcrypt.hash(password, 10);
        user.passwordChangedAt = new Date();
      }
    }

    await parent.save();
    if (user) await user.save();

    await logAudit({
      actor: req.user,
      action: 'UPDATE',
      entityType: 'Parent',
      entityId: parent._id.toString(),
      summary: parent.name
    });

    res.json({
      id: parent._id.toString(),
      parentId: parent.parentId,
      name: parent.name,
      email: parent.email,
      phone: parent.phone || '',
      children: parent.children
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to update parent', error: error.message });
  }
});

router.delete('/parents/:parentId', async (req, res) => {
  try {
    const parent = await Parent.findOne({ parentId: req.params.parentId });
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    await User.deleteOne({ _id: parent.userId });
    await Parent.deleteOne({ _id: parent._id });
    await logAudit({
      actor: req.user,
      action: 'DELETE',
      entityType: 'Parent',
      entityId: parent._id.toString(),
      summary: parent.name
    });

    res.json({ message: 'Parent deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete parent', error: error.message });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const filter = buildAttendanceFilter(req.query);
    const sort = normalizeSort(req.query.sortBy, req.query.order, ['date', 'studentName', 'className', 'section', 'status', 'academicYear', 'term', 'createdAt'], 'date');
    const attendance = await Attendance.find(filter).sort(sort).lean();

    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load attendance', error: error.message });
  }
});

router.patch('/attendance/:attendanceId', async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.attendanceId);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    const {
      status,
      date,
      className,
      section,
      academicYear,
      term,
      subject
    } = req.body;

    if (status) attendance.status = status;
    if (date) attendance.date = date;
    if (className) attendance.className = className.trim();
    if (section) attendance.section = section.trim();
    if (academicYear) attendance.academicYear = String(academicYear).trim();
    if (term) attendance.term = normalizeTerm(term);
    if (subject !== undefined) attendance.subject = String(subject).trim();

    await attendance.save();
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: 'Unable to update attendance', error: error.message });
  }
});

router.delete('/attendance/:attendanceId', async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.attendanceId);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete attendance', error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const students = await Student.countDocuments();
    const teachers = await Teacher.countDocuments();
    const today = new Date().toISOString().slice(0, 10);
    const todaysAttendance = await Attendance.find({ date: today }).lean();
    const present = todaysAttendance.filter((record) => record.status === 'Present').length;
    const absent = todaysAttendance.filter((record) => record.status === 'Absent').length;
    const attendancePercentage = students > 0 ? Math.round((present / students) * 100) : 0;

    res.json({
      totalStudents: students,
      totalTeachers: teachers,
      todayAttendance: attendancePercentage,
      todayMarked: todaysAttendance.length,
      todayPresent: present,
      todayAbsent: absent
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load stats', error: error.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const records = await Attendance.find().lean();
    const byMonth = new Map();

    records.forEach((record) => {
      const month = record.date.slice(0, 7);
      const entry = byMonth.get(month) || { month, present: 0, absent: 0, total: 0 };
      entry.total += 1;
      if (record.status === 'Present') entry.present += 1;
      if (record.status === 'Absent') entry.absent += 1;
      byMonth.set(month, entry);
    });

    const monthlyTrend = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
    const byClass = new Map();

    records.forEach((record) => {
      const entry = byClass.get(record.className) || { className: record.className, present: 0, absent: 0 };
      if (record.status === 'Present') entry.present += 1;
      if (record.status === 'Absent') entry.absent += 1;
      byClass.set(record.className, entry);
    });

    res.json({
      monthlyTrend,
      classSummary: [...byClass.values()].sort((a, b) => a.className.localeCompare(b.className))
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load analytics', error: error.message });
  }
});

router.get('/reports/monthly', async (req, res) => {
  try {
    const { month, className, section, studentId, academicYear, term } = req.query;

    if (!month) {
      return res.status(400).json({ message: 'month is required' });
    }

    const filter = {
      date: new RegExp(`^${escapeRegex(month)}`)
    };
    if (className) filter.className = String(className).trim();
    if (section) filter.section = String(section).trim();
    if (studentId) filter.studentId = String(studentId).trim();
    if (academicYear) filter.academicYear = String(academicYear).trim();
    if (term) filter.term = normalizeTerm(term);

    const records = await Attendance.find(filter).sort({ date: 1, studentName: 1 }).lean();
    const summary = {
      present: records.filter((record) => record.status === 'Present').length,
      absent: records.filter((record) => record.status === 'Absent').length,
      total: records.length,
      attendanceRate: records.length ? Math.round((records.filter((record) => record.status === 'Present').length / records.length) * 100) : 0
    };

    res.json({ records, summary });
  } catch (error) {
    res.status(500).json({ message: 'Unable to build monthly report', error: error.message });
  }
});

router.get('/reports/student/:studentId', async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const records = await Attendance.find({ studentId: student.studentId }).sort({ date: 1 }).lean();
    const summary = {
      present: records.filter((record) => record.status === 'Present').length,
      absent: records.filter((record) => record.status === 'Absent').length,
      total: records.length,
      attendanceRate: records.length ? Math.round((records.filter((record) => record.status === 'Present').length / records.length) * 100) : 0
    };

    res.json({ student, records, summary });
  } catch (error) {
    res.status(500).json({ message: 'Unable to build student report', error: error.message });
  }
});

router.get('/reports/class/:className', async (req, res) => {
  try {
    const students = await Student.find({ className: req.params.className }).sort({ name: 1 }).lean();
    const records = await Attendance.find({ className: req.params.className }).sort({ date: 1 }).lean();
    const byStudent = new Map();

    students.forEach((student) => {
      const studentRecords = records.filter((record) => record.studentId === student.studentId);
      byStudent.set(student.studentId, {
        student,
        present: studentRecords.filter((record) => record.status === 'Present').length,
        absent: studentRecords.filter((record) => record.status === 'Absent').length,
        total: studentRecords.length,
        attendanceRate: studentRecords.length ? Math.round((studentRecords.filter((record) => record.status === 'Present').length / studentRecords.length) * 100) : 0
      });
    });

    res.json({
      className: req.params.className,
      students: [...byStudent.values()]
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to build class report', error: error.message });
  }
});

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function normalizeTimetableInput(body) {
  return {
    className: String(body.className || '').trim(),
    section: body.section ? String(body.section).trim() : '',
    academicYear: body.academicYear ? String(body.academicYear).trim() : currentAcademicYear(),
    term: normalizeTerm(body.term),
    day: String(body.day || '').trim(),
    period: String(body.period || '').trim(),
    subject: String(body.subject || '').trim(),
    teacherName: body.teacherName ? String(body.teacherName).trim() : ''
  };
}

router.get('/reports/export', async (req, res) => {
  try {
    const { format = 'csv', month, className, section, studentId, academicYear, term } = req.query;
    const filter = {};

    if (month) filter.date = new RegExp(`^${escapeRegex(month)}`);
    if (className) filter.className = String(className).trim();
    if (section) filter.section = String(section).trim();
    if (studentId) filter.studentId = String(studentId).trim();
    if (academicYear) filter.academicYear = String(academicYear).trim();
    if (term) filter.term = normalizeTerm(term);

    const records = await Attendance.find(filter).sort({ date: 1, studentName: 1 }).lean();

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=attendance-report.pdf');
      doc.pipe(res);

      doc.fontSize(18).text('Attendance Report', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).text(`Generated: ${new Date().toLocaleString()}`);
      if (month) doc.text(`Month: ${month}`);
      if (className) doc.text(`Class: ${className}`);
      if (section) doc.text(`Section: ${section}`);
      if (studentId) doc.text(`Student ID: ${studentId}`);
      doc.moveDown();

      records.forEach((record) => {
        doc.fontSize(10).text(`${record.date} | ${record.studentName} | ${record.className} | ${record.section} | ${record.status}`);
      });

      doc.end();
      return;
    }

    const headers = ['studentId', 'studentName', 'className', 'section', 'date', 'status', 'academicYear', 'term'];
    const lines = [headers.join(',')];
    records.forEach((record) => {
      lines.push([
        csvEscape(record.studentId),
        csvEscape(record.studentName),
        csvEscape(record.className),
        csvEscape(record.section),
        csvEscape(record.date),
        csvEscape(record.status),
        csvEscape(record.academicYear),
        csvEscape(record.term)
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance-report.csv');
    res.send(lines.join('\n'));
  } catch (error) {
    res.status(500).json({ message: 'Unable to export report', error: error.message });
  }
});

router.get('/timetable', async (req, res) => {
  try {
    const filter = {};
    if (req.query.className) filter.className = String(req.query.className).trim();
    if (req.query.section) filter.section = String(req.query.section).trim();
    if (req.query.academicYear) filter.academicYear = String(req.query.academicYear).trim();
    if (req.query.term) filter.term = normalizeTerm(req.query.term);

    const rows = await Timetable.find(filter).sort({ day: 1, period: 1 }).lean();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load timetable', error: error.message });
  }
});

router.post('/timetable', async (req, res) => {
  try {
    const payload = normalizeTimetableInput(req.body);
    if (!payload.className || !payload.day || !payload.period || !payload.subject) {
      return res.status(400).json({ message: 'className, day, period, and subject are required' });
    }

    const filter = {
      className: payload.className,
      section: payload.section,
      academicYear: payload.academicYear,
      term: payload.term,
      day: payload.day,
      period: payload.period
    };

    const existing = await Timetable.findOne(filter);
    if (existing) {
      existing.subject = payload.subject;
      existing.teacherName = payload.teacherName;
      await existing.save();
      return res.json(existing);
    }

    const row = await Timetable.create(payload);
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ message: 'Unable to create timetable row', error: error.message });
  }
});

router.patch('/timetable/:id', async (req, res) => {
  try {
    const row = await Timetable.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ message: 'Timetable row not found' });
    }

    const { className, section, academicYear, term, day, period, subject, teacherName } = req.body;
    if (className) row.className = className.trim();
    if (section !== undefined) row.section = String(section).trim();
    if (academicYear) row.academicYear = String(academicYear).trim();
    if (term) row.term = normalizeTerm(term);
    if (day) row.day = String(day).trim();
    if (period) row.period = String(period).trim();
    if (subject) row.subject = String(subject).trim();
    if (teacherName !== undefined) row.teacherName = String(teacherName).trim();

    await row.save();
    res.json(row);
  } catch (error) {
    res.status(500).json({ message: 'Unable to update timetable row', error: error.message });
  }
});

router.delete('/timetable/:id', async (req, res) => {
  try {
    const row = await Timetable.findByIdAndDelete(req.params.id);
    if (!row) {
      return res.status(404).json({ message: 'Timetable row not found' });
    }

    res.json({ message: 'Timetable row deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete timetable row', error: error.message });
  }
});

module.exports = router;
