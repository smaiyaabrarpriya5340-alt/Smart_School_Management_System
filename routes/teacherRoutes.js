const express = require('express');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Attendance = require('../models/Attendance');
const Timetable = require('../models/Timetable');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole('teacher'));

async function getTeacherForUser(userId) {
  return Teacher.findOne({ userId }).lean();
}

function teacherHasClass(teacher, className) {
  return Boolean(
    teacher &&
    Array.isArray(teacher.classes) &&
    teacher.classes.some((entry) => entry.name === className)
  );
}

router.get('/classes', async (req, res) => {
  const teacher = await getTeacherForUser(req.user._id);
  res.json(teacher ? teacher.classes : []);
});

router.get('/students', async (req, res) => {
  try {
    const { className, date, academicYear, term } = req.query;
    const teacher = await getTeacherForUser(req.user._id);

    if (!className) {
      return res.status(400).json({ message: 'className is required' });
    }
    if (!teacherHasClass(teacher, className)) {
      return res.status(403).json({ message: 'Class is not assigned to this teacher' });
    }

    const students = await Student.find({ className }).sort({ name: 1 }).lean();
    const attendanceFilter = { className };
    if (date) attendanceFilter.date = date;
    if (academicYear) attendanceFilter.academicYear = academicYear;
    if (term) attendanceFilter.term = term;
    const attendance = await Attendance.find(attendanceFilter).lean();

    const byStudentId = new Map(attendance.map((record) => [record.studentId, record]));
    const payload = students.map((student) => ({
      studentId: student.studentId,
      name: student.name,
      className: student.className,
      section: student.section,
      status: byStudentId.get(student.studentId)?.status || null
    }));

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load students', error: error.message });
  }
});

router.post('/attendance', async (req, res) => {
  try {
    const { studentId, className, date, status, academicYear, term, subject } = req.body;

    if (!studentId || !className || !date || !status) {
      return res.status(400).json({ message: 'studentId, className, date, and status are required' });
    }

    const teacher = await getTeacherForUser(req.user._id);
    if (!teacherHasClass(teacher, className)) {
      return res.status(403).json({ message: 'Class is not assigned to this teacher' });
    }

    const student = await Student.findOne({ studentId, className });
    if (!student) {
      return res.status(404).json({ message: 'Student not found in this class' });
    }

    const record = await Attendance.findOneAndUpdate(
      { studentUserId: student.userId, date },
      {
        studentUserId: student.userId,
        studentId: student.studentId,
        studentName: student.name,
        className: student.className,
        section: student.section,
        academicYear: academicYear || student.academicYear || new Date().getFullYear().toString(),
        term: term || 'Term 1',
        subject: subject || '',
        date,
        status,
        markedBy: req.user._id
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(record);
  } catch (error) {
    res.status(500).json({ message: 'Unable to save attendance', error: error.message });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const { className, date, academicYear, term } = req.query;
    const teacher = await getTeacherForUser(req.user._id);

    if (!className || !date) {
      return res.status(400).json({ message: 'className and date are required' });
    }
    if (!teacherHasClass(teacher, className)) {
      return res.status(403).json({ message: 'Class is not assigned to this teacher' });
    }

    const filter = { className, date };
    if (academicYear) filter.academicYear = academicYear;
    if (term) filter.term = term;

    const records = await Attendance.find(filter)
      .sort({ studentName: 1 })
      .lean();

    const students = await Student.find({ className }).sort({ name: 1 }).lean();
    const byStudentId = new Map(records.map((record) => [record.studentId, record]));

    res.json(
      students.map((student) => ({
        studentId: student.studentId,
        name: student.name,
        status: byStudentId.get(student.studentId)?.status || 'Not Marked'
      }))
    );
  } catch (error) {
    res.status(500).json({ message: 'Unable to load attendance', error: error.message });
  }
});

router.get('/timetable', async (req, res) => {
  try {
    const filter = {};
    if (req.query.className) filter.className = String(req.query.className).trim();
    if (req.query.section) filter.section = String(req.query.section).trim();
    if (req.query.academicYear) filter.academicYear = String(req.query.academicYear).trim();
    if (req.query.term) filter.term = String(req.query.term).trim();

    const rows = await Timetable.find(filter).sort({ day: 1, period: 1 }).lean();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load timetable', error: error.message });
  }
});

module.exports = router;
