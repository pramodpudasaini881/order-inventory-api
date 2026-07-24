const catchAsync = require('../utils/catchAsync');
const authService = require('../services/authService');

const signup = catchAsync(async (req, res) => {
  const result = await authService.signup(req.body);
  res.status(201).json(result);
});

const login = catchAsync(async (req, res) => {
  const result = await authService.login(req.body);
  res.status(200).json(result);
});

module.exports = { signup, login };
