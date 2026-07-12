const mongoose = require('mongoose');

const feeSchema = new mongoose.Schema(
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
    section: {
      type: String,
      required: true,
      trim: true
    },
    academicYear: {
      type: String,
      required: true,
      trim: true
    },
    term: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    dueDate: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['Due', 'Paid', 'Partially Paid'],
      default: 'Due'
    },
    paidAt: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Fee', feeSchema);
