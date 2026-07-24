const Joi = require('joi');

// Note: public signup intentionally does NOT accept a "role" field.
// Allowing clients to self-assign "admin" would be a privilege-escalation
// bug. Admin accounts should be created by seeding/promoting a user
// directly in the database (see README).
const signup = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

const login = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

module.exports = { signup, login };
