# Smart School Management System

This project is now a full Node.js and MongoDB application.

## Stack

- Backend: Node.js, Express
- Database: MongoDB with Mongoose
- Authentication: JWT
- Frontend: HTML, CSS, JavaScript

## Pages

- `index.html` - Login and student registration
- `admin.html` - Administrator dashboard
- `teacher.html` - Teacher dashboard
- `student.html` - Student dashboard

## Data Models

- `User` - auth accounts and roles
- `Student` - student profile data
- `Teacher` - teacher profile data and assigned classes
- `Attendance` - attendance records by student and date

## Features

- Student registration
- Role-based login
- Admin management for students and teachers
- Teacher attendance marking and viewing
- Student profile and monthly attendance summary
- MongoDB persistence

## Default Accounts

Administrator:

- Email: `admin@school.com`
- Password: `admin123`

Teacher:

- Email: `teacher@school.com`
- Password: `teacher123`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file from `.env.example`:

```bash
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/ssms
JWT_SECRET=your_secret_here
```

3. Start MongoDB locally.

4. Start the server:

```bash
npm start
```

5. Open:

```text
http://localhost:3000
```

## Project Structure

```text
.
├── config/
├── middleware/
├── models/
├── public/
│   ├── css/
│   ├── js/
│   ├── admin.html
│   ├── index.html
│   ├── student.html
│   └── teacher.html
├── routes/
├── seed/
├── server.js
└── README.md
```

## Notes

- The app seeds the default admin and teacher accounts on startup.
- Student attendance is stored in MongoDB and loaded by month in the student dashboard.
- The older localStorage prototype files are still in the repo, but the live app is the Node/Mongo version served from `public/`.
# Smart_School_Management_System
