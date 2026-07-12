const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const Parent = require('../models/Parent');

async function logAudit({ actor, action, entityType, entityId = '', summary = '', meta = {} }) {
  if (!actor) return null;
  return AuditLog.create({
    action,
    entityType,
    entityId: entityId ? String(entityId) : '',
    summary,
    meta,
    actorUserId: actor._id,
    actorName: actor.name,
    actorRole: actor.role
  });
}

async function createNotification({
  title,
  message,
  type = 'info',
  link = '',
  audienceRoles = ['all'],
  audienceUserIds = [],
  audienceStudentIds = [],
  createdBy
}) {
  return Notification.create({
    title,
    message,
    type,
    link,
    audienceRoles,
    audienceUserIds,
    audienceStudentIds,
    createdBy
  });
}

async function getParentStudentIds(userId) {
  const parent = await Parent.findOne({ userId }).lean();
  return parent ? parent.children.map((child) => child.studentId) : [];
}

function notificationMatchesUser(notification, user, options = {}) {
  if (!notification || !user) return false;
  if (Array.isArray(notification.audienceUserIds) && notification.audienceUserIds.some((id) => String(id) === String(user._id))) {
    return true;
  }

  const roles = notification.audienceRoles || [];
  if (roles.includes('all') || roles.includes(user.role)) {
    if (user.role !== 'student' && user.role !== 'parent') {
      return true;
    }

    const studentIds = options.studentIds || [];
    if (user.role === 'student') {
      return notification.audienceStudentIds.length === 0 || notification.audienceStudentIds.some((id) => studentIds.includes(id));
    }

    if (user.role === 'parent') {
      return notification.audienceStudentIds.length === 0 || notification.audienceStudentIds.some((id) => studentIds.includes(id));
    }
  }

  return false;
}

module.exports = {
  logAudit,
  createNotification,
  getParentStudentIds,
  notificationMatchesUser
};
