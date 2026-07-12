const express = require('express');
const Notification = require('../models/Notification');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const { authenticate } = require('../middleware/auth');
const { getParentStudentIds, notificationMatchesUser } = require('../services/engagement');

const router = express.Router();

router.use(authenticate);

async function getStudentIdsForUser(user) {
  if (user.role === 'student') {
    const student = await Student.findOne({ userId: user._id }).lean();
    return student ? [student.studentId] : [];
  }

  if (user.role === 'parent') {
    return getParentStudentIds(user._id);
  }

  return [];
}

router.get('/', async (req, res) => {
  try {
    const studentIds = await getStudentIdsForUser(req.user);
    const notifications = await Notification.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const items = notifications.filter((notification) => notificationMatchesUser(notification, req.user, { studentIds }));
    res.json({
      unreadCount: items.filter((item) => !item.readBy.some((id) => String(id) === String(req.user._id))).length,
      notifications: items.map((item) => ({
        id: item._id.toString(),
        title: item.title,
        message: item.message,
        type: item.type,
        link: item.link,
        createdAt: item.createdAt,
        read: item.readBy.some((id) => String(id) === String(req.user._id))
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load notifications', error: error.message });
  }
});

router.patch('/:notificationId/read', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (!notification.readBy.some((id) => String(id) === String(req.user._id))) {
      notification.readBy.push(req.user._id);
      await notification.save();
    }

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to update notification', error: error.message });
  }
});

module.exports = router;
