const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema(
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
    audienceRole: {
      type: String,
      default: 'all',
      enum: ['all', 'admin', 'teacher', 'student', 'parent']
    },
    className: {
      type: String,
      default: '',
      trim: true
    },
    section: {
      type: String,
      default: '',
      trim: true
    },
    pinned: {
      type: Boolean,
      default: false
    },
    published: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notice', noticeSchema);
