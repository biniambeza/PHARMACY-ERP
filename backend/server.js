require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const pharmacyRoutes = require('./routes/pharmacyRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const stockRoutes = require('./routes/stockRoutes');
const salesRoutes = require('./routes/salesRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const procurementRoutes = require('./routes/procurementRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

// Connect to Database
connectDB();

// Middlewares
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      process.env.NODE_ENV !== 'production' ||
      origin.endsWith('.vercel.app')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Test Route
app.get('/api/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Pharmacy ERP Backend API is running successfully!',
    timestamp: new Date().toISOString()
  });
});

// Routes (supports both /api/* and root /* for resilient deployment)
const apiRoutes = [
  ['/auth', authRoutes],
  ['/admin', adminRoutes],
  ['/pharmacy', pharmacyRoutes],
  ['/medicines', medicineRoutes],
  ['/stock', stockRoutes],
  ['/sales', salesRoutes],
  ['/suppliers', supplierRoutes],
  ['/procurement', procurementRoutes],
  ['/reports', reportRoutes]
];

apiRoutes.forEach(([path, router]) => {
  app.use(`/api${path}`, router);
  app.use(path, router);
});

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = app;
