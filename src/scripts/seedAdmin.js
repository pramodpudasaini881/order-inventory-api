/**
 * One-off script to create (or promote) an admin user.
 * Public /auth/signup deliberately never accepts a "role" field, so this
 * is the sanctioned way to get an admin account for testing/bootstrapping.
 *
 * Usage:
 *   node src/scripts/seedAdmin.js admin@example.com somePassword123
 */
require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');

async function main() {
  const [, , email, password] = process.argv;

  if (!email || !password) {
    console.error('Usage: node src/scripts/seedAdmin.js <email> <password>');
    process.exit(1);
  }

  await connectDB();

  let user = await User.findOne({ email });
  if (user) {
    user.role = 'admin';
    await user.save();
    console.log(`Promoted existing user ${email} to admin.`);
  } else {
    user = await User.create({ email, password, role: 'admin' });
    console.log(`Created new admin user ${email}.`);
  }

  await disconnectDB();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to seed admin:', err);
  process.exit(1);
});
