const express = require('express');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Timetable = require('../models/Timetable');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(value) {
  return String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.use(authenticate, requireRole('student'));

router.get('/profile', async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load profile', error: error.message });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    let selectedMonth = req.query.month ? String(req.query.month).trim() : '';
    if (!selectedMonth) {
      const latest = await Attendance.findOne({ studentId: student.studentId }).sort({ date: -1 }).lean();
      selectedMonth = latest ? latest.date.slice(0, 7) : new Date().toISOString().slice(0, 7);
    }

    const attendanceFilter = {
      studentId: student.studentId,
      date: new RegExp(`^${escapeRegex(selectedMonth)}`)
    };
    const { academicYear, term } = req.query;
    if (academicYear) attendanceFilter.academicYear = academicYear;
    if (term) attendanceFilter.term = term;

    const records = await Attendance.find(attendanceFilter)
      .sort({ date: 1 })
      .lean();

    const present = records.filter((record) => record.status === 'Present').length;
    const absent = records.filter((record) => record.status === 'Absent').length;
    const total = records.length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    res.json({
      monthUsed: selectedMonth,
      records,
      summary: {
        present,
        absent,
        percentage
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load attendance', error: error.message });
  }
});

router.get('/timetable', async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const filter = {
      className: student.className
    };
    if (req.query.academicYear) filter.academicYear = String(req.query.academicYear).trim();
    if (req.query.term) filter.term = String(req.query.term).trim();

    const rows = await Timetable.find(filter).sort({ day: 1, period: 1 }).lean();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load timetable', error: error.message });
  }
});

module.exports = router;
