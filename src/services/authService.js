const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

async function signup({ email, password }) {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('Email already registered', 409, 'EMAIL_TAKEN');
  }

  // role defaults to "customer" at the schema level - see validators/authValidators.js
  const user = await User.create({ email, password });
  const token = signToken(user);
  return { token, user: { id: user._id, email: user.email, role: user.role } };
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const token = signToken(user);
  return { token, user: { id: user._id, email: user.email, role: user.role } };
}

module.exports = { signup, login, signToken };
