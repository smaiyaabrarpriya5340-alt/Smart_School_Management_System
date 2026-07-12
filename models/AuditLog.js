const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true
    },
    entityType: {
      type: String,
      required: true,
      trim: true
    },
    entityId: {
      type: String,
      default: '',
      trim: true
    },
    summary: {
      type: String,
      default: '',
      trim: true
    },
    meta: {
      type: Object,
      default: {}
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    actorName: {
      type: String,
      required: true,
      trim: true
    },
    actorRole: {
      type: String,
      required: true,
      trim: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
