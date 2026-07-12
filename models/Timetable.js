const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema(
  {
    className: {
      type: String,
      required: true,
      trim: true
    },
    section: {
      type: String,
      default: ''
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
    day: {
      type: String,
      required: true,
      trim: true
    },
    period: {
      type: String,
      required: true,
      trim: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    teacherName: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

timetableSchema.index({ className: 1, section: 1, academicYear: 1, term: 1, day: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('Timetable', timetableSchema);
