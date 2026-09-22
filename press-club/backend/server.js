require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

require('./db'); // opens the database and seeds it on first run

const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const queueRoutes = require('./routes/queue');
const editorsRoutes = require('./routes/editors');
const uploadRoutes = require('./routes/upload');
const boardRoutes = require('./routes/board');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Uploaded photos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API
app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/editors', editorsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/board', boardRoutes);
app.use('/api/settings', settingsRoutes);

// Frontend (serves ../frontend as the site itself, so the whole app is one process/one port)
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Basic error handler (e.g. multer errors that slip through)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error.' });
});

app.listen(PORT, () => {
  console.log(`The Wire is running at http://localhost:${PORT}`);
});
