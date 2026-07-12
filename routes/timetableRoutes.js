const express = require('express');
const Timetable = require('../models/Timetable');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../services/engagement');

const router = express.Router();

function normalizeTerm(term) {
  return term && String(term).trim() ? String(term).trim() : 'Term 1';
}

function currentAcademicYear() {
  return new Date().getFullYear().toString();
}

function normalizeTimetableInput(body) {
  return {
    className: String(body.className || '').trim(),
    section: body.section ? String(body.section).trim() : '',
    academicYear: body.academicYear ? String(body.academicYear).trim() : currentAcademicYear(),
    term: normalizeTerm(body.term),
    day: String(body.day || '').trim(),
    period: String(body.period || '').trim(),
    subject: String(body.subject || '').trim(),
    teacherName: body.teacherName ? String(body.teacherName).trim() : ''
  };
}

router.get('/', authenticate, async (req, res) => {
  try {
    const filter = {};
    if (req.query.className) filter.className = String(req.query.className).trim();
    if (req.query.section) filter.section = String(req.query.section).trim();
    if (req.query.academicYear) filter.academicYear = String(req.query.academicYear).trim();
    if (req.query.term) filter.term = normalizeTerm(req.query.term);

    const rows = await Timetable.find(filter).sort({ day: 1, period: 1 }).lean();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load timetable', error: error.message });
  }
});

router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const payload = normalizeTimetableInput(req.body);
    if (!payload.className || !payload.day || !payload.period || !payload.subject) {
      return res.status(400).json({ message: 'className, day, period, and subject are required' });
    }

    const filter = {
      className: payload.className,
      section: payload.section,
      academicYear: payload.academicYear,
      term: payload.term,
      day: payload.day,
      period: payload.period
    };

    const existing = await Timetable.findOne(filter);
    if (existing) {
      existing.subject = payload.subject;
      existing.teacherName = payload.teacherName;
      await existing.save();
      await logAudit({
        actor: req.user,
        action: 'UPDATE',
        entityType: 'Timetable',
        entityId: existing._id.toString(),
        summary: `${existing.className} ${existing.day} ${existing.period}`
      });
      return res.json(existing);
    }

    const row = await Timetable.create(payload);
    await logAudit({
      actor: req.user,
      action: 'CREATE',
      entityType: 'Timetable',
      entityId: row._id.toString(),
      summary: `${row.className} ${row.day} ${row.period}`
    });
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ message: 'Unable to create timetable row', error: error.message });
  }
});

router.patch('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const row = await Timetable.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ message: 'Timetable row not found' });
    }

    const { className, section, academicYear, term, day, period, subject, teacherName } = req.body;
    if (className) row.className = className.trim();
    if (section !== undefined) row.section = String(section).trim();
    if (academicYear) row.academicYear = String(academicYear).trim();
    if (term) row.term = normalizeTerm(term);
    if (day) row.day = String(day).trim();
    if (period) row.period = String(period).trim();
    if (subject) row.subject = String(subject).trim();
    if (teacherName !== undefined) row.teacherName = String(teacherName).trim();

    await row.save();
    await logAudit({
      actor: req.user,
      action: 'UPDATE',
      entityType: 'Timetable',
      entityId: row._id.toString(),
      summary: `${row.className} ${row.day} ${row.period}`
    });
    res.json(row);
  } catch (error) {
    res.status(500).json({ message: 'Unable to update timetable row', error: error.message });
  }
});

router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const row = await Timetable.findByIdAndDelete(req.params.id);
    if (!row) {
      return res.status(404).json({ message: 'Timetable row not found' });
    }

    await logAudit({
      actor: req.user,
      action: 'DELETE',
      entityType: 'Timetable',
      entityId: row._id.toString(),
      summary: `${row.className} ${row.day} ${row.period}`
    });

    res.json({ message: 'Timetable row deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete timetable row', error: error.message });
  }
});

module.exports = router;
