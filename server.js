const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const connectDBModule = require('./config/db');
const { seedDefaults } = require('./seed/seedDefaults');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const studentRoutes = require('./routes/studentRoutes');
const metaRoutes = require('./routes/metaRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const resultsRoutes = require('./routes/resultsRoutes');
const noticeRoutes = require('./routes/noticeRoutes');
const feeRoutes = require('./routes/feeRoutes');
const parentRoutes = require('./routes/parentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const auditRoutes = require('./routes/auditRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit', auditRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

async function start() {
  try {
    await connectDBModule();
  } catch (error) {
    const message = connectDBModule.formatMongoConnectionError(error, process.env.MONGO_URI);
    console.error(message);
    process.exit(1);
  }

  await seedDefaults();

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
