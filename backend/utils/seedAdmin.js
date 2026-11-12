// Creates the initial system admin account.
// Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... node utils/seedAdmin.js
// (or set both in backend/.env). The password is never printed.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const seedAdmin = async () => {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  const missing = ['MONGO_URI', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required environment variable(s): ${missing.join(', ')}.`);
    console.error('Set them in backend/.env or the shell before running the admin seeder.');
    process.exit(1);
  }
  if (adminPassword.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters long.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for admin seeding...');

    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log(`Admin account already exists with email: ${adminEmail}`);
    } else {
      await User.create({
        name: 'System Admin',
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
      });
      console.log('---------------------------------------------');
      console.log('Admin account created successfully!');
      console.log(`Email:    ${adminEmail}`);
      console.log('Password: (value of ADMIN_PASSWORD)');
      console.log('Role:     admin');
      console.log('---------------------------------------------');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(`Error seeding admin: ${error.message}`);
    process.exit(1);
  }
};

seedAdmin();
