const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for admin seeding...');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@pharmacy.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';

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
      console.log(`Password: ${adminPassword}`);
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
