const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    studentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    studentId: {
      type: String,
      required: true,
      trim: true
    },
    studentName: {
      type: String,
      required: true,
      trim: true
    },
    className: {
      type: String,
      required: true,
      trim: true
    },
    subject: {
      type: String,
      default: ''
    },
    section: {
      type: String,
      required: true,
      trim: true
    },
    academicYear: {
      type: String,
      required: true,
      default: () => new Date().getFullYear().toString()
    },
    term: {
      type: String,
      required: true,
      default: 'Term 1'
    },
    date: {
      type: String,
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: ['Present', 'Absent']
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

attendanceSchema.index({ studentUserId: 1, date: 1, academicYear: 1, term: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
