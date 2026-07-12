const mongoose = require('mongoose');

const teacherClassSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    }
  },
  { _id: false }
);

const teacherSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    teacherId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    academicYear: {
      type: String,
      required: true,
      default: () => new Date().getFullYear().toString()
    },
    classes: {
      type: [teacherClassSchema],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Teacher', teacherSchema);
