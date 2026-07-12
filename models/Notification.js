const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      default: 'info',
      trim: true
    },
    link: {
      type: String,
      default: '',
      trim: true
    },
    audienceRoles: {
      type: [String],
      default: ['all']
    },
    audienceUserIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: []
    },
    audienceStudentIds: {
      type: [String],
      default: []
    },
    readBy: {
      type: [mongoose.Schema.Types.ObjectId],
      default: []
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
