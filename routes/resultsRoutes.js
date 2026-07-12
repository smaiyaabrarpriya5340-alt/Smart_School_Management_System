const express = require('express');
const PDFDocument = require('pdfkit');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');
const Attendance = require('../models/Attendance');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit, createNotification, getParentStudentIds } = require('../services/engagement');

const router = express.Router();

router.use(authenticate);

function currentAcademicYear() {
  return new Date().getFullYear().toString();
}

function normalizeTerm(term) {
  return term && String(term).trim() ? String(term).trim() : 'Term 1';
}

function teacherHasClass(teacher, className) {
  return Boolean(
    teacher &&
    Array.isArray(teacher.classes) &&
    teacher.classes.some((entry) => entry.name === className)
  );
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase().trim());
  return Boolean(value);
}

function parseSubjects(raw, fallback = []) {
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry).trim()).filter(Boolean);
      }
    } catch (error) {
      return raw
        .split(',')
        .map((entry) => String(entry).trim())
        .filter(Boolean);
    }
  }

  return fallback;
}

function computeGrade(percentage) {
  if (percentage >= 90) return { grade: 'A+', gpa: 5, remark: 'Outstanding' };
  if (percentage >= 80) return { grade: 'A', gpa: 4, remark: 'Excellent' };
  if (percentage >= 70) return { grade: 'A-', gpa: 3.5, remark: 'Very Good' };
  if (percentage >= 60) return { grade: 'B', gpa: 3, remark: 'Good' };
  if (percentage >= 50) return { grade: 'C', gpa: 2, remark: 'Satisfactory' };
  if (percentage >= 40) return { grade: 'D', gpa: 1, remark: 'Pass' };
  return { grade: 'F', gpa: 0, remark: 'Needs Improvement' };
}

function computeMetrics(subjectMarks = []) {
  const marks = subjectMarks.map((entry) => ({
    subject: String(entry.subject || '').trim(),
    obtained: Number(entry.obtained || 0),
    fullMark: Number(entry.fullMark || 100),
    passMark: Number(entry.passMark || 40)
  })).filter((entry) => entry.subject);

  const totalObtained = marks.reduce((sum, entry) => sum + entry.obtained, 0);
  const totalFull = marks.reduce((sum, entry) => sum + entry.fullMark, 0);
  const percentage = totalFull > 0 ? Math.round((totalObtained / totalFull) * 100) : 0;
  const gradeInfo = computeGrade(percentage);

  return {
    subjectMarks: marks,
    totalObtained,
    totalFull,
    percentage,
    grade: gradeInfo.grade,
    gpa: gradeInfo.gpa,
    remark: gradeInfo.remark
  };
}

async function getTeacherForUser(userId) {
  return Teacher.findOne({ userId }).lean();
}

async function getStudentForUser(userId) {
  return Student.findOne({ userId }).lean();
}

async function getParentForUser(userId) {
  return Parent.findOne({ userId }).lean();
}

function buildExamFilter(req, roleContext = {}) {
  const filter = {};
  const { className, section, academicYear, term } = req.query;

  if (academicYear) filter.academicYear = String(academicYear).trim();
  if (term) filter.term = normalizeTerm(term);

  if (roleContext.student) {
    filter.className = roleContext.student.className;
    filter.section = { $in: ['', roleContext.student.section] };
    filter.published = true;
  } else if (roleContext.teacher) {
    if (className) {
      if (!teacherHasClass(roleContext.teacher, className)) {
        throw new Error('Class is not assigned to this teacher');
      }
      filter.className = String(className).trim();
    } else {
      filter.className = { $in: roleContext.teacher.classes.map((entry) => entry.name) };
    }
    if (section) filter.section = String(section).trim();
  } else if (className) {
    filter.className = String(className).trim();
    if (section) filter.section = String(section).trim();
  }

  return filter;
}

function resultPayload(result, rank = null) {
  if (!result) return null;
  return {
    id: result._id.toString(),
    examId: result.examId.toString(),
    examName: result.examName,
    studentUserId: result.studentUserId.toString(),
    studentId: result.studentId,
    studentName: result.studentName,
    className: result.className,
    section: result.section,
    academicYear: result.academicYear,
    term: result.term,
    subjectMarks: result.subjectMarks || [],
    totalObtained: result.totalObtained,
    totalFull: result.totalFull,
    percentage: result.percentage,
    grade: result.grade,
    gpa: result.gpa,
    remark: result.remark,
    published: result.published,
    locked: result.locked,
    rank
  };
}

function examPayload(exam) {
  if (!exam) return null;
  return {
    id: exam._id.toString(),
    name: exam.name,
    className: exam.className,
    section: exam.section,
    academicYear: exam.academicYear,
    term: exam.term,
    subjects: exam.subjects || [],
    published: exam.published,
    locked: exam.locked
  };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeReportCardPdf(doc, { exam, student, result, attendanceSummary }) {
  doc.fontSize(20).text('SMART SCHOOL MANAGEMENT SYSTEM', { align: 'center' });
  doc.fontSize(14).text('REPORT CARD', { align: 'center' });
  doc.moveDown(0.4);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#7b5b2a').stroke();
  doc.moveDown(0.6);

  doc.fontSize(11).fillColor('#111827').text(`Student Name: ${student.name}`);
  doc.text(`Student ID: ${student.studentId}`);
  doc.text(`Class: ${student.className}   Section: ${student.section}`);
  doc.text(`Exam: ${exam.name}`);
  doc.text(`Academic Year: ${exam.academicYear}   Term: ${exam.term}`);
  doc.moveDown();

  doc.fontSize(12).fillColor('#7b5b2a').text('SUBJECT MARKS');
  doc.moveDown(0.3);
  doc.fillColor('#111827');
  result.subjectMarks.forEach((mark) => {
    doc.text(`${mark.subject}: ${mark.obtained}/${mark.fullMark}`);
  });

  doc.moveDown();
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#d6c4a6').stroke();
  doc.moveDown(0.6);
  doc.fontSize(12).fillColor('#7b5b2a').text('RESULT SUMMARY');
  doc.fillColor('#111827');
  doc.text(`Total: ${result.totalObtained}/${result.totalFull}`);
  doc.text(`Percentage: ${result.percentage}%`);
  doc.text(`Grade: ${result.grade}`);
  doc.text(`GPA: ${result.gpa}`);
  doc.text(`Remark: ${result.remark}`);
  if (attendanceSummary) {
    doc.moveDown();
    doc.text(`Attendance: Present ${attendanceSummary.present} | Absent ${attendanceSummary.absent} | Rate ${attendanceSummary.percentage}%`);
  }
}

function writeClassSheetPdf(doc, { exam, rows }) {
  doc.fontSize(20).text('SMART SCHOOL MANAGEMENT SYSTEM', { align: 'center' });
  doc.fontSize(14).text('CLASS RESULT SHEET', { align: 'center' });
  doc.moveDown(0.4);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#7b5b2a').stroke();
  doc.moveDown(0.6);
  doc.fontSize(11).fillColor('#111827').text(`Exam: ${exam.name}`);
  doc.text(`Class: ${exam.className}   Section: ${exam.section || '-'}`);
  doc.text(`Academic Year: ${exam.academicYear}   Term: ${exam.term}`);
  doc.moveDown();

  rows.forEach((row, index) => {
    doc.text(`${index + 1}. ${row.studentName} (${row.studentId}) - ${row.percentage}% - ${row.grade}`);
  });
}

router.get('/exams', async (req, res) => {
  try {
    const role = req.user.role;
    let filter = {};

    if (role === 'student') {
      const student = await getStudentForUser(req.user._id);
      if (!student) {
        return res.status(404).json({ message: 'Student profile not found' });
      }
      filter = buildExamFilter(req, { student });
    } else if (role === 'teacher') {
      const teacher = await getTeacherForUser(req.user._id);
      if (!teacher) {
        return res.status(404).json({ message: 'Teacher profile not found' });
      }
      filter = buildExamFilter(req, { teacher });
    } else {
      filter = buildExamFilter(req);
    }

    const exams = await Exam.find(filter).sort({ createdAt: -1 }).lean();
    res.json(exams.map(examPayload));
  } catch (error) {
    const status = error.message.includes('not assigned') ? 403 : 500;
    res.status(status).json({ message: 'Unable to load exams', error: error.message });
  }
});

router.post('/exams', requireRole('admin'), async (req, res) => {
  try {
    const { name, className, section, academicYear, term, subjects, published, locked } = req.body;

    if (!name || !className) {
      return res.status(400).json({ message: 'name and className are required' });
    }

    const payload = {
      name: String(name).trim(),
      className: String(className).trim(),
      section: section ? String(section).trim() : '',
      academicYear: academicYear ? String(academicYear).trim() : currentAcademicYear(),
      term: normalizeTerm(term),
      subjects: parseSubjects(subjects),
      published: normalizeBoolean(published),
      locked: normalizeBoolean(locked),
      createdBy: req.user._id
    };

    const filter = {
      name: payload.name,
      className: payload.className,
      section: payload.section,
      academicYear: payload.academicYear,
      term: payload.term
    };

    const exam = await Exam.findOneAndUpdate(
      filter,
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await logAudit({
      actor: req.user,
      action: 'CREATE',
      entityType: 'Exam',
      entityId: exam._id.toString(),
      summary: exam.name
    });

    if (exam.published) {
      const students = await Student.find({ className: exam.className }).lean();
      await createNotification({
        title: `Exam published: ${exam.name}`,
        message: `${exam.className} ${exam.term} results are now available.`,
        type: 'result',
        link: '/student.html#results',
        audienceRoles: ['student', 'parent'],
        audienceStudentIds: students.map((student) => student.studentId),
        createdBy: req.user._id
      });
    }

    res.status(201).json(examPayload(exam));
  } catch (error) {
    res.status(500).json({ message: 'Unable to create exam', error: error.message });
  }
});

router.patch('/exams/:examId', requireRole('admin'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const { name, className, section, academicYear, term, subjects, published, locked } = req.body;
    if (name) exam.name = String(name).trim();
    if (className) exam.className = String(className).trim();
    if (section !== undefined) exam.section = String(section).trim();
    if (academicYear) exam.academicYear = String(academicYear).trim();
    if (term) exam.term = normalizeTerm(term);
    if (subjects !== undefined) exam.subjects = parseSubjects(subjects, exam.subjects);
    if (published !== undefined) exam.published = normalizeBoolean(published);
    if (locked !== undefined) exam.locked = normalizeBoolean(locked);

    await exam.save();
    await logAudit({
      actor: req.user,
      action: 'UPDATE',
      entityType: 'Exam',
      entityId: exam._id.toString(),
      summary: exam.name
    });

    if (published !== undefined && exam.published) {
      const students = await Student.find({ className: exam.className }).lean();
      await createNotification({
        title: `Exam published: ${exam.name}`,
        message: `${exam.className} ${exam.term} results are now available.`,
        type: 'result',
        link: '/student.html#results',
        audienceRoles: ['student', 'parent'],
        audienceStudentIds: students.map((student) => student.studentId),
        createdBy: req.user._id
      });
    }
    res.json(examPayload(exam));
  } catch (error) {
    res.status(500).json({ message: 'Unable to update exam', error: error.message });
  }
});

router.delete('/exams/:examId', requireRole('admin'), async (req, res) => {
  try {
    const exam = await Exam.findByIdAndDelete(req.params.examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    await Result.deleteMany({ examId: exam._id });
    await logAudit({
      actor: req.user,
      action: 'DELETE',
      entityType: 'Exam',
      entityId: exam._id.toString(),
      summary: exam.name
    });
    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete exam', error: error.message });
  }
});

router.get('/roster', async (req, res) => {
  try {
    const { examId } = req.query;
    if (!examId) {
      return res.status(400).json({ message: 'examId is required' });
    }

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (req.user.role === 'teacher') {
      const teacher = await getTeacherForUser(req.user._id);
      if (!teacherHasClass(teacher, exam.className)) {
        return res.status(403).json({ message: 'Class is not assigned to this teacher' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const studentFilter = { className: exam.className };
    if (exam.section) studentFilter.section = exam.section;

    const [students, results] = await Promise.all([
      Student.find(studentFilter).sort({ name: 1 }).lean(),
      Result.find({ examId: exam._id }).lean()
    ]);
    const resultMap = new Map(results.map((item) => [item.studentUserId.toString(), item]));

    res.json({
      exam: examPayload(exam),
      students: students.map((student) => ({
        id: student._id.toString(),
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        className: student.className,
        section: student.section,
        academicYear: student.academicYear,
        gradeLevel: student.gradeLevel || '',
        result: resultPayload(resultMap.get(student.userId.toString()))
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load roster', error: error.message });
  }
});

router.post('/entries', async (req, res) => {
  try {
    const { examId, studentId, subjectMarks, remark } = req.body;
    if (!examId || !studentId || !Array.isArray(subjectMarks) || !subjectMarks.length) {
      return res.status(400).json({ message: 'examId, studentId, and subjectMarks are required' });
    }

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    if (exam.locked && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'This exam is locked' });
    }

    if (req.user.role === 'teacher') {
      const teacher = await getTeacherForUser(req.user._id);
      if (!teacherHasClass(teacher, exam.className)) {
        return res.status(403).json({ message: 'Class is not assigned to this teacher' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const student = await Student.findOne({ studentId, className: exam.className });
    if (!student) {
      return res.status(404).json({ message: 'Student not found in this class' });
    }

    const metrics = computeMetrics(subjectMarks);
    const existing = await Result.findOne({ examId: exam._id, studentUserId: student.userId });
    if (existing && existing.locked && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'This result is locked' });
    }

    const result = await Result.findOneAndUpdate(
      { examId: exam._id, studentUserId: student.userId },
      {
        examId: exam._id,
        examName: exam.name,
        studentUserId: student.userId,
        studentId: student.studentId,
        studentName: student.name,
        className: student.className,
        section: student.section,
        academicYear: exam.academicYear,
        term: exam.term,
        subjectMarks: metrics.subjectMarks,
        totalObtained: metrics.totalObtained,
        totalFull: metrics.totalFull,
        percentage: metrics.percentage,
        grade: metrics.grade,
        gpa: metrics.gpa,
        remark: remark ? String(remark).trim() : metrics.remark,
        published: exam.published,
        locked: exam.locked,
        enteredBy: req.user._id
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (exam.published) {
      await createNotification({
        title: `Result updated: ${student.name}`,
        message: `${exam.name} marks are available for ${student.studentId}.`,
        type: 'result',
        link: '/student.html#results',
        audienceRoles: ['student', 'parent'],
        audienceStudentIds: [student.studentId],
        audienceUserIds: [student.userId],
        createdBy: req.user._id
      });
    }

    res.json(resultPayload(result));
  } catch (error) {
    res.status(500).json({ message: 'Unable to save result entry', error: error.message });
  }
});

router.patch('/entries/:resultId', requireRole('admin'), async (req, res) => {
  try {
    const result = await Result.findById(req.params.resultId);
    if (!result) {
      return res.status(404).json({ message: 'Result not found' });
    }

    const exam = await Exam.findById(result.examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const { subjectMarks, remark, published, locked } = req.body;
    if (Array.isArray(subjectMarks) && subjectMarks.length) {
      const metrics = computeMetrics(subjectMarks);
      result.subjectMarks = metrics.subjectMarks;
      result.totalObtained = metrics.totalObtained;
      result.totalFull = metrics.totalFull;
      result.percentage = metrics.percentage;
      result.grade = metrics.grade;
      result.gpa = metrics.gpa;
      result.remark = remark ? String(remark).trim() : metrics.remark;
    }
    if (remark !== undefined && !Array.isArray(subjectMarks)) {
      result.remark = String(remark).trim();
    }
    if (published !== undefined) result.published = normalizeBoolean(published);
    if (locked !== undefined) result.locked = normalizeBoolean(locked);

    await result.save();
    res.json(resultPayload(result));
  } catch (error) {
    res.status(500).json({ message: 'Unable to update result entry', error: error.message });
  }
});

router.get('/student/me', async (req, res) => {
  try {
    const student = await getStudentForUser(req.user._id);
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const filter = { studentUserId: student.userId, published: true };
    if (req.query.examId) filter.examId = req.query.examId;

    const results = await Result.find(filter).sort({ createdAt: -1 }).lean();
    res.json({
      student,
      results: results.map((result) => resultPayload(result))
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load student results', error: error.message });
  }
});

router.get('/student/:studentId', async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (req.user.role === 'teacher') {
      const teacher = await getTeacherForUser(req.user._id);
      if (!teacherHasClass(teacher, student.className)) {
        return res.status(403).json({ message: 'Class is not assigned to this teacher' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const filter = { studentUserId: student.userId };
    if (req.query.examId) filter.examId = req.query.examId;

    const results = await Result.find(filter).sort({ createdAt: -1 }).lean();
    res.json({
      student,
      results: results.map((result) => resultPayload(result))
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load student results', error: error.message });
  }
});

router.get('/class/:className', async (req, res) => {
  try {
    const { className } = req.params;

    if (req.user.role === 'teacher') {
      const teacher = await getTeacherForUser(req.user._id);
      if (!teacherHasClass(teacher, className)) {
        return res.status(403).json({ message: 'Class is not assigned to this teacher' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const filter = { className };
    if (req.query.examId) filter.examId = req.query.examId;

    const results = await Result.find(filter).sort({ percentage: -1, totalObtained: -1 }).lean();
    const ranked = results.map((result, index) => resultPayload(result, index + 1));

    res.json({ className, results: ranked });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load class results', error: error.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    const { format = 'pdf', examId, studentId, className } = req.query;
    const studentScope = Boolean(studentId || req.user.role === 'student');

    if (studentScope) {
      const student = req.user.role === 'student'
        ? await getStudentForUser(req.user._id)
        : await Student.findOne({ studentId }).lean();

      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }

      if (req.user.role === 'teacher') {
        const teacher = await getTeacherForUser(req.user._id);
        if (!teacherHasClass(teacher, student.className)) {
          return res.status(403).json({ message: 'Class is not assigned to this teacher' });
        }
      } else if (req.user.role === 'parent') {
        const childIds = await getParentStudentIds(req.user._id);
        if (!childIds.includes(student.studentId)) {
          return res.status(403).json({ message: 'Access denied' });
        }
      } else if (req.user.role === 'student' && student.studentId !== (await getStudentForUser(req.user._id)).studentId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const filter = { studentUserId: student.userId };
      if (req.user.role !== 'admin') {
        filter.published = true;
      }
      if (examId) filter.examId = examId;

      const results = await Result.find(filter).sort({ createdAt: -1 }).lean();
      const target = results[0];
      if (!target) {
        return res.status(404).json({ message: 'Result not found' });
      }

      const exam = await Exam.findById(target.examId).lean();
      const attendance = await Attendance.find({
        studentId: student.studentId,
        academicYear: exam.academicYear,
        term: exam.term
      }).lean();
      const attendanceSummary = {
        present: attendance.filter((record) => record.status === 'Present').length,
        absent: attendance.filter((record) => record.status === 'Absent').length,
        percentage: attendance.length ? Math.round((attendance.filter((record) => record.status === 'Present').length / attendance.length) * 100) : 0
      };

      if (format === 'csv') {
        const lines = [
          ['studentId', 'studentName', 'examName', 'subject', 'obtained', 'fullMark', 'grade', 'gpa', 'percentage'].join(',')
        ];
        target.subjectMarks.forEach((mark) => {
          lines.push([
            csvEscape(target.studentId),
            csvEscape(target.studentName),
            csvEscape(target.examName),
            csvEscape(mark.subject),
            csvEscape(mark.obtained),
            csvEscape(mark.fullMark),
            csvEscape(target.grade),
            csvEscape(target.gpa),
            csvEscape(target.percentage)
          ].join(','));
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${student.studentId}-report-card.csv"`);
        res.send(lines.join('\n'));
        return;
      }

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${student.studentId}-report-card.pdf"`);
      doc.pipe(res);
      writeReportCardPdf(doc, { exam, student, result: target, attendanceSummary });
      doc.end();
      return;
    }

    if (!className) {
      return res.status(400).json({ message: 'className is required for class export' });
    }

    if (req.user.role === 'teacher') {
      const teacher = await getTeacherForUser(req.user._id);
      if (!teacherHasClass(teacher, className)) {
        return res.status(403).json({ message: 'Class is not assigned to this teacher' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const results = await Result.find({ className, ...(examId ? { examId } : {}) }).sort({ percentage: -1, totalObtained: -1 }).lean();
    const exam = examId ? await Exam.findById(examId).lean() : await Exam.findOne({ className }).sort({ createdAt: -1 }).lean();

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (format === 'csv') {
      const lines = [
        ['rank', 'studentId', 'studentName', 'percentage', 'grade', 'gpa'].join(',')
      ];
      results.forEach((result, index) => {
        lines.push([
          csvEscape(index + 1),
          csvEscape(result.studentId),
          csvEscape(result.studentName),
          csvEscape(result.percentage),
          csvEscape(result.grade),
          csvEscape(result.gpa)
        ].join(','));
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${className}-results.csv"`);
      res.send(lines.join('\n'));
      return;
    }

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${className}-results.pdf"`);
    doc.pipe(res);
    writeClassSheetPdf(doc, { exam, rows: results });
    doc.end();
  } catch (error) {
    res.status(500).json({ message: 'Unable to export results', error: error.message });
  }
});

module.exports = router;
