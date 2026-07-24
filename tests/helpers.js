const User = require('../src/models/User');
const authService = require('../src/services/authService');

// Creates a user directly against the model so tests can mint an admin
// account (public signup deliberately can't self-assign the admin role).
async function createUserWithRole(email, password, role) {
  const user = await User.create({ email, password, role });
  const token = authService.signToken(user);
  return { user, token };
}

module.exports = { createUserWithRole };
