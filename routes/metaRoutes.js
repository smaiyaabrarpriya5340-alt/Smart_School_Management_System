const express = require('express');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');

const router = express.Router();

router.get('/catalog', async (req, res) => {
  try {
    const [students, teachers] = await Promise.all([
      Student.find().lean(),
      Teacher.find().lean()
    ]);

    const classMap = new Map();

    students.forEach((student) => {
      if (student.className) {
        classMap.set(student.className, {
          name: student.className,
          subject: '',
          source: 'student'
        });
      }
    });

    teachers.forEach((teacher) => {
      (teacher.classes || []).forEach((entry) => {
        if (!entry || !entry.name) return;
        classMap.set(entry.name, {
          name: entry.name,
          subject: entry.subject || teacher.subject || '',
          source: 'teacher'
        });
      });
    });

    const classes = [...classMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    const sections = [...new Set(students.map((student) => student.section).filter(Boolean))].sort();

    if (!classes.length) {
      classes.push(
        { name: 'Class A', subject: 'Mathematics', source: 'default' },
        { name: 'Class B', subject: 'English', source: 'default' },
        { name: 'Class C', subject: 'Science', source: 'default' }
      );
    }

    if (!sections.length) {
      sections.push('A', 'B');
    }

    res.json({ classes, sections });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load catalog', error: error.message });
  }
});

module.exports = router;
