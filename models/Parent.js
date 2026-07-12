const mongoose = require('mongoose');

const parentChildSchema = new mongoose.Schema(
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
    relation: {
      type: String,
      default: 'Guardian',
      trim: true
    }
  },
  { _id: false }
);

const parentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    parentId: {
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
    phone: {
      type: String,
      default: '',
      trim: true
    },
    children: {
      type: [parentChildSchema],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Parent', parentSchema);
