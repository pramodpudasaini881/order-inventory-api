const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/User');

// Verifies the JWT and attaches the authenticated user to req.user
const authenticate = catchAsync(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401, 'NO_TOKEN');
  }

  const token = header.split(' ')[1];
  const decoded = jwt.verify(token, env.jwtSecret);

  const user = await User.findById(decoded.sub);
  if (!user) {
    throw new AppError('User no longer exists', 401, 'USER_NOT_FOUND');
  }

  req.user = { id: user._id.toString(), role: user.role, email: user.email };
  next();
});

// Role guard - use AFTER authenticate. Enforced at the route/middleware
// layer (not inside controllers) per the assignment requirement.
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
  }
  next();
};

module.exports = { authenticate, requireRole };
