const express = require('express');
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Result = require('../models/Result');
const Fee = require('../models/Fee');
const Notice = require('../models/Notice');
const Timetable = require('../models/Timetable');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole('parent'));

async function getParentProfile(userId) {
  return Parent.findOne({ userId }).lean();
}

function hasLinkedStudent(parent, studentId) {
  return Boolean(parent && Array.isArray(parent.children) && parent.children.some((child) => child.studentId === studentId));
}

router.get('/profile', async (req, res) => {
  try {
    const parent = await getParentProfile(req.user._id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    res.json(parent);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load parent profile', error: error.message });
  }
});

router.get('/children', async (req, res) => {
  try {
    const parent = await getParentProfile(req.user._id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const childIds = parent.children.map((child) => child.studentId);
    const children = await Student.find({ studentId: { $in: childIds } }).lean();
    const results = await Result.find({ studentId: { $in: childIds }, published: true }).sort({ createdAt: -1 }).lean();
    const fees = await Fee.find({ studentId: { $in: childIds } }).sort({ createdAt: -1 }).lean();

    res.json(children.map((child) => {
      const childResults = results.filter((result) => result.studentId === child.studentId);
      const childFees = fees.filter((fee) => fee.studentId === child.studentId);
      const attendanceRecords = childIds.length ? null : [];
      return {
        ...child,
        latestResult: childResults[0] || null,
        feeSummary: {
          due: childFees.filter((fee) => fee.status !== 'Paid').length,
          paid: childFees.filter((fee) => fee.status === 'Paid').length
        }
      };
    }));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load children', error: error.message });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const parent = await getParentProfile(req.user._id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const studentId = req.query.studentId || (parent.children[0] && parent.children[0].studentId);
    if (!studentId) {
      return res.json({ records: [], summary: { present: 0, absent: 0, percentage: 0 } });
    }
    if (!hasLinkedStudent(parent, studentId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const student = await Student.findOne({ studentId }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const records = await Attendance.find({
      studentId,
      date: new RegExp(`^${month.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    }).sort({ date: 1 }).lean();
    const present = records.filter((record) => record.status === 'Present').length;
    const absent = records.filter((record) => record.status === 'Absent').length;
    const total = records.length;

    res.json({ records, summary: { present, absent, percentage: total ? Math.round((present / total) * 100) : 0 } });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load attendance', error: error.message });
  }
});

router.get('/results', async (req, res) => {
  try {
    const parent = await getParentProfile(req.user._id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const studentId = req.query.studentId || (parent.children[0] && parent.children[0].studentId);
    if (!studentId) {
      return res.json([]);
    }
    if (!hasLinkedStudent(parent, studentId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const student = await Student.findOne({ studentId }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const results = await Result.find({ studentUserId: student.userId, published: true }).sort({ createdAt: -1 }).lean();
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load results', error: error.message });
  }
});

router.get('/fees', async (req, res) => {
  try {
    const parent = await getParentProfile(req.user._id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const childIds = parent.children.map((child) => child.studentId);
    const fees = await Fee.find({ studentId: { $in: childIds } }).sort({ createdAt: -1 }).lean();
    res.json(fees);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load fees', error: error.message });
  }
});

router.get('/notices', async (req, res) => {
  try {
    const notices = await Notice.find({ published: true }).sort({ pinned: -1, createdAt: -1 }).lean();
    res.json(notices.map((notice) => ({
      id: notice._id.toString(),
      title: notice.title,
      message: notice.message,
      audienceRole: notice.audienceRole,
      className: notice.className,
      section: notice.section,
      pinned: notice.pinned,
      createdAt: notice.createdAt
    })));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load notices', error: error.message });
  }
});

router.get('/timetable', async (req, res) => {
  try {
    const parent = await getParentProfile(req.user._id);
    if (!parent || !parent.children.length) {
      return res.json([]);
    }

    const studentId = req.query.studentId || parent.children[0].studentId;
    const student = await Student.findOne({ studentId }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    if (!hasLinkedStudent(parent, studentId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const filter = { className: student.className };
    if (req.query.academicYear) filter.academicYear = String(req.query.academicYear).trim();
    if (req.query.term) filter.term = String(req.query.term).trim();

    const rows = await Timetable.find(filter).sort({ day: 1, period: 1 }).lean();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load timetable', error: error.message });
  }
});

module.exports = router;
