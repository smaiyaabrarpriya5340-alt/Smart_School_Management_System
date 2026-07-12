const mongoose = require('mongoose');

const examSchema = new mongoose.Schema(
  {
    name: {
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
      required: true,
      default: () => new Date().getFullYear().toString()
    },
    term: {
      type: String,
      required: true,
      default: 'Term 1'
    },
    subjects: {
      type: [String],
      default: []
    },
    published: {
      type: Boolean,
      default: false
    },
    locked: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

examSchema.index({ className: 1, section: 1, academicYear: 1, term: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Exam', examSchema);
