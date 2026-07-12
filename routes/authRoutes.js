const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');
const Attendance = require('../models/Attendance');
const { authenticate, sanitizeUser, signToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Email, password, and role are required' });
    }

    const identifier = String(email).trim().toLowerCase();
    let user = await User.findOne({ email: identifier });

    if (!user && role === 'student') {
      const studentIdPattern = new RegExp(`^${String(email).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const student = await Student.findOne({
        $or: [
          { studentId: studentIdPattern },
          { email: identifier }
        ]
      }).lean();

      if (student) {
        user = await User.findById(student.userId);
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.role !== role) {
      return res.status(403).json({ message: 'Selected role does not match this account' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

router.post('/register-student', async (req, res) => {
  try {
    const { name, email, password, studentId, className, section } = req.body;

    if (!name || !email || !password || !studentId || !className || !section) {
      return res.status(400).json({ message: 'All student fields are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    const existingStudent = await Student.findOne({ studentId: studentId.trim() });

    if (existingUser || existingStudent) {
      return res.status(409).json({ message: 'Email or Student ID already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'student'
    });

    await Student.create({
      userId: user._id,
      studentId: studentId.trim(),
      name: name.trim(),
      email: normalizedEmail,
      className: className.trim(),
      section: section.trim()
    });

    const token = signToken(user);
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = sanitizeUser(req.user);
    let profile = null;

    if (req.user.role === 'student') {
      profile = await Student.findOne({ userId: req.user._id }).lean();
    } else if (req.user.role === 'teacher') {
      profile = await Teacher.findOne({ userId: req.user._id }).lean();
    } else if (req.user.role === 'parent') {
      profile = await Parent.findOne({ userId: req.user._id }).lean();
    }

    res.json({ user, profile });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load current user', error: error.message });
  }
});

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Current password and a new password of at least 8 characters are required' });
    }

    const validPassword = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    req.user.passwordHash = await bcrypt.hash(newPassword, 10);
    req.user.passwordChangedAt = new Date();
    req.user.resetPasswordToken = null;
    req.user.resetPasswordExpiresAt = null;
    await req.user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to change password', error: error.message });
  }
});

router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const resetToken = crypto.randomBytes(24).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    res.json({
      message: 'Password reset token created',
      resetToken
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to create password reset token', error: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Email, token, and new password of at least 8 characters are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.resetPasswordToken || !user.resetPasswordExpiresAt) {
      return res.status(400).json({ message: 'Reset token is invalid or expired' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    if (hashedToken !== user.resetPasswordToken || user.resetPasswordExpiresAt < new Date()) {
      return res.status(400).json({ message: 'Reset token is invalid or expired' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date();
    user.resetPasswordToken = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to reset password', error: error.message });
  }
});

module.exports = router;
