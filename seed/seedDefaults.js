const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');

async function ensureUser({ name, email, password, role }) {
  const existing = await User.findOne({ email });
  if (existing) {
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  return User.create({
    name,
    email,
    passwordHash,
    role
  });
}

async function seedDefaults() {
  const admin = await ensureUser({
    name: 'Administrator',
    email: 'admin@school.com',
    password: 'admin123',
    role: 'admin'
  });

  const teacherUser = await ensureUser({
    name: 'Md.Abdullah Ibn Noor Teacher',
    email: 'teacher@school.com',
    password: 'teacher123',
    role: 'teacher'
  });

  const studentUser = await ensureUser({
    name: 'Student Demo',
    email: 'student@school.com',
    password: 'student123',
    role: 'student'
  });

  const student = await Student.findOne({ studentId: 'STU-10001' });
  if (!student) {
    await Student.create({
      userId: studentUser._id,
      studentId: 'STU-10001',
      name: studentUser.name,
      email: studentUser.email,
      className: 'Class A',
      section: 'A',
      academicYear: new Date().getFullYear().toString(),
      gradeLevel: '1'
    });
  }

  const parentUser = await ensureUser({
    name: 'Parent Demo',
    email: 'parent@school.com',
    password: 'parent123',
    role: 'parent'
  });

  const parent = await Parent.findOne({ parentId: 'PAR-10001' });
  if (!parent) {
    await Parent.create({
      userId: parentUser._id,
      parentId: 'PAR-10001',
      name: parentUser.name,
      email: parentUser.email,
      phone: '0000000000',
      children: student ? [{ studentUserId: student.userId, studentId: student.studentId, relation: 'Guardian' }] : []
    });
  }

  const teacher = await Teacher.findOne({ teacherId: 'teacher001' });
  if (!teacher) {
    await Teacher.create({
      userId: teacherUser._id,
      teacherId: 'teacher001',
      name: teacherUser.name,
      email: teacherUser.email,
      subject: 'WEB DEVELOPMENT',
      classes: [
        { name: 'Class A', subject: 'WEB DEVELOPMENT' },
        { name: 'Class B', subject: 'SOFTWARE DEVELOPMENT' }
      ]
    });
  }

  if (admin && teacherUser && studentUser && parentUser) {
    return true;
  }
}

module.exports = { seedDefaults };
