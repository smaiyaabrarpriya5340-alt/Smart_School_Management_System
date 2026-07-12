const express = require('express');
const Fee = require('../models/Fee');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Teacher = require('../models/Teacher');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit, createNotification, getParentStudentIds } = require('../services/engagement');

const router = express.Router();

router.use(authenticate);

async function getParentChildren(userId) {
  const ids = await getParentStudentIds(userId);
  if (!ids.length) return [];
  return Student.find({ studentId: { $in: ids } }).lean();
}

router.get('/', async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const fees = await Fee.find({}).sort({ createdAt: -1 }).lean();
      return res.json(fees);
    }

    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id }).lean();
      if (!student) return res.json([]);
      const fees = await Fee.find({ studentUserId: student.userId }).sort({ createdAt: -1 }).lean();
      return res.json(fees);
    }

    if (req.user.role === 'parent') {
      const children = await getParentChildren(req.user._id);
      const studentUserIds = children.map((child) => child.userId);
      const fees = await Fee.find({ studentUserId: { $in: studentUserIds } }).sort({ createdAt: -1 }).lean();
      return res.json(fees);
    }

    if (req.user.role === 'teacher') {
      const teacher = await Teacher.findOne({ userId: req.user._id }).lean();
      const classNames = (teacher && teacher.classes || []).map((entry) => entry.name);
      const fees = await Fee.find({ className: { $in: classNames } }).sort({ createdAt: -1 }).lean();
      return res.json(fees);
    }

    res.json([]);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load fees', error: error.message });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const {
      studentId,
      className,
      title,
      amount,
      dueDate,
      academicYear,
      term,
      notes
    } = req.body;

    if (!title || !amount || (!studentId && !className)) {
      return res.status(400).json({ message: 'title, amount, and studentId or className are required' });
    }

    const targets = [];
    if (studentId) {
      const student = await Student.findOne({ studentId }).lean();
      if (!student) return res.status(404).json({ message: 'Student not found' });
      targets.push(student);
    } else {
      const students = await Student.find({ className }).lean();
      targets.push(...students);
    }

    const created = [];
    for (const student of targets) {
      const fee = await Fee.create({
        studentUserId: student.userId,
        studentId: student.studentId,
        studentName: student.name,
        className: student.className,
        section: student.section,
        academicYear: academicYear || student.academicYear,
        term: term || 'Term 1',
        title: String(title).trim(),
        amount: Number(amount),
        dueDate: dueDate || '',
        status: 'Due',
        notes: notes ? String(notes).trim() : '',
        createdBy: req.user._id
      });
      created.push(fee);

      await createNotification({
        title: `Fee due: ${student.name}`,
        message: `${title} for ${student.studentId} is due.`,
        type: 'fee',
        link: '/fees',
        audienceRoles: ['student', 'parent'],
        audienceStudentIds: [student.studentId],
        audienceUserIds: [student.userId],
        createdBy: req.user._id
      });
    }

    await logAudit({
      actor: req.user,
      action: 'CREATE',
      entityType: 'Fee',
      entityId: created[0] ? created[0]._id.toString() : '',
      summary: `${title} (${created.length} record(s))`
    });

    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: 'Unable to create fee record', error: error.message });
  }
});

router.patch('/:feeId', requireRole('admin'), async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.feeId);
    if (!fee) {
      return res.status(404).json({ message: 'Fee not found' });
    }

    const { status, notes, paidAt, amount, dueDate, title, academicYear, term } = req.body;
    if (status !== undefined) fee.status = status;
    if (notes !== undefined) fee.notes = String(notes).trim();
    if (paidAt !== undefined) fee.paidAt = paidAt || null;
    if (amount !== undefined) fee.amount = Number(amount);
    if (dueDate !== undefined) fee.dueDate = String(dueDate).trim();
    if (title !== undefined) fee.title = String(title).trim();
    if (academicYear !== undefined) fee.academicYear = String(academicYear).trim();
    if (term !== undefined) fee.term = String(term).trim();

    await fee.save();
    await logAudit({
      actor: req.user,
      action: 'UPDATE',
      entityType: 'Fee',
      entityId: fee._id.toString(),
      summary: fee.title
    });

    res.json(fee);
  } catch (error) {
    res.status(500).json({ message: 'Unable to update fee record', error: error.message });
  }
});

router.delete('/:feeId', requireRole('admin'), async (req, res) => {
  try {
    const fee = await Fee.findByIdAndDelete(req.params.feeId);
    if (!fee) {
      return res.status(404).json({ message: 'Fee not found' });
    }

    await logAudit({
      actor: req.user,
      action: 'DELETE',
      entityType: 'Fee',
      entityId: fee._id.toString(),
      summary: fee.title
    });
    res.json({ message: 'Fee deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete fee record', error: error.message });
  }
});

module.exports = router;
