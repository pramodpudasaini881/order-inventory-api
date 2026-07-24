const AppError = require('../utils/AppError');

// Validates req[source] against a Joi schema. Strips unknown keys so
// stray fields can't be smuggled into a Mongo query/update (defense
// against NoSQL-injection-style payload tampering).
const validate = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const message = error.details.map((d) => d.message).join(', ');
    return next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }

  req[source] = value;
  next();
};

module.exports = validate;
