const mongoose = require('mongoose');

const subjectMarkSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: true,
      trim: true
    },
    obtained: {
      type: Number,
      required: true,
      default: 0
    },
    fullMark: {
      type: Number,
      required: true,
      default: 100
    },
    passMark: {
      type: Number,
      required: true,
      default: 40
    }
  },
  { _id: false }
);

const resultSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true
    },
    examName: {
      type: String,
      required: true,
      trim: true
    },
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
    section: {
      type: String,
      default: ''
    },
    academicYear: {
      type: String,
      required: true
    },
    term: {
      type: String,
      required: true
    },
    subjectMarks: {
      type: [subjectMarkSchema],
      default: []
    },
    totalObtained: {
      type: Number,
      default: 0
    },
    totalFull: {
      type: Number,
      default: 0
    },
    percentage: {
      type: Number,
      default: 0
    },
    grade: {
      type: String,
      default: 'F'
    },
    gpa: {
      type: Number,
      default: 0
    },
    remark: {
      type: String,
      default: ''
    },
    published: {
      type: Boolean,
      default: false
    },
    locked: {
      type: Boolean,
      default: false
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

resultSchema.index({ examId: 1, studentUserId: 1 }, { unique: true });

module.exports = mongoose.model('Result', resultSchema);
