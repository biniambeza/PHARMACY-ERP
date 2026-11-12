const mongoose = require('mongoose');

// Connects to MongoDB. Throws on failure; the caller (server.js) decides what to do.
const connectDB = async (uri = process.env.MONGO_URI) => {
  if (!uri) throw new Error('MONGO_URI is not set');
  const conn = await mongoose.connect(uri);
  console.log(`MongoDB Connected: ${conn.connection.host}`);
  return conn;
};

module.exports = connectDB;
