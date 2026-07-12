const express = require('express');
const Notice = require('../models/Notice');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit, createNotification, getParentStudentIds } = require('../services/engagement');

const router = express.Router();

router.use(authenticate);

async function getStudentContext(user) {
  if (user.role === 'student') {
    return Student.findOne({ userId: user._id }).lean();
  }

  if (user.role === 'parent') {
    const childIds = await getParentStudentIds(user._id);
    return Student.find({ studentId: { $in: childIds } }).lean();
  }

  if (user.role === 'teacher') {
    return Teacher.findOne({ userId: user._id }).lean();
  }

  return null;
}

function noticeMatchesRole(notice, user, context) {
  if (user.role === 'admin') return true;
  if (!notice.published) return false;

  if (notice.audienceRole !== 'all' && notice.audienceRole !== user.role) {
    return false;
  }

  if (user.role === 'teacher') {
    const classes = (context && context.classes) || [];
    if (!notice.className) return true;
    return classes.some((entry) => entry.name === notice.className);
  }

  if (user.role === 'student') {
    if (notice.className && notice.className !== context.className) return false;
    if (notice.section && notice.section !== context.section) return false;
    return true;
  }

  if (user.role === 'parent') {
    const children = Array.isArray(context) ? context : [];
    if (notice.audienceRole !== 'all' && notice.audienceRole !== 'parent' && notice.audienceRole !== 'student') {
      return false;
    }
    if (!notice.className) return true;
    return children.some((child) => child.className === notice.className && (!notice.section || child.section === notice.section));
  }

  return false;
}

router.get('/', async (req, res) => {
  try {
    const context = await getStudentContext(req.user);
    const notices = await Notice.find({}).sort({ pinned: -1, createdAt: -1 }).lean();
    const items = notices.filter((notice) => noticeMatchesRole(notice, req.user, context));
    res.json(items.map((notice) => ({
      id: notice._id.toString(),
      title: notice.title,
      message: notice.message,
      audienceRole: notice.audienceRole,
      className: notice.className,
      section: notice.section,
      pinned: notice.pinned,
      published: notice.published,
      createdAt: notice.createdAt
    })));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load notices', error: error.message });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { title, message, audienceRole, className, section, pinned, published } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: 'title and message are required' });
    }

    const notice = await Notice.create({
      title: String(title).trim(),
      message: String(message).trim(),
      audienceRole: audienceRole || 'all',
      className: className ? String(className).trim() : '',
      section: section ? String(section).trim() : '',
      pinned: Boolean(pinned),
      published: published !== false,
      createdBy: req.user._id
    });

    const studentFilter = {};
    if (notice.className) studentFilter.className = notice.className;
    if (notice.section) studentFilter.section = notice.section;
    const students = notice.className ? await Student.find(studentFilter).lean() : [];

    await createNotification({
      title: notice.title,
      message: notice.message,
      type: 'notice',
      link: '/notices',
      audienceRoles: notice.audienceRole === 'all' ? ['all'] : [notice.audienceRole],
      audienceStudentIds: students.map((student) => student.studentId),
      createdBy: req.user._id
    });
    await logAudit({
      actor: req.user,
      action: 'CREATE',
      entityType: 'Notice',
      entityId: notice._id.toString(),
      summary: notice.title
    });

    res.status(201).json({
      id: notice._id.toString(),
      title: notice.title,
      message: notice.message,
      audienceRole: notice.audienceRole,
      className: notice.className,
      section: notice.section,
      pinned: notice.pinned,
      published: notice.published
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to create notice', error: error.message });
  }
});

router.patch('/:noticeId', requireRole('admin'), async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.noticeId);
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' });
    }

    const { title, message, audienceRole, className, section, pinned, published } = req.body;
    if (title !== undefined) notice.title = String(title).trim();
    if (message !== undefined) notice.message = String(message).trim();
    if (audienceRole !== undefined) notice.audienceRole = audienceRole;
    if (className !== undefined) notice.className = String(className).trim();
    if (section !== undefined) notice.section = String(section).trim();
    if (pinned !== undefined) notice.pinned = Boolean(pinned);
    if (published !== undefined) notice.published = Boolean(published);

    await notice.save();
    await logAudit({
      actor: req.user,
      action: 'UPDATE',
      entityType: 'Notice',
      entityId: notice._id.toString(),
      summary: notice.title
    });

    res.json({ id: notice._id.toString(), title: notice.title, message: notice.message, audienceRole: notice.audienceRole, className: notice.className, section: notice.section, pinned: notice.pinned, published: notice.published });
  } catch (error) {
    res.status(500).json({ message: 'Unable to update notice', error: error.message });
  }
});

router.delete('/:noticeId', requireRole('admin'), async (req, res) => {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.noticeId);
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' });
    }

    await logAudit({
      actor: req.user,
      action: 'DELETE',
      entityType: 'Notice',
      entityId: notice._id.toString(),
      summary: notice.title
    });
    res.json({ message: 'Notice deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete notice', error: error.message });
  }
});

module.exports = router;
