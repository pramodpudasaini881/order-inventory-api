const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const createOrder = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        productId: objectId.required(),
        quantity: Joi.number().integer().min(1).required(),
      })
    )
    .min(1)
    .required(),
});

const listOrdersQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid('pending', 'confirmed', 'cancelled'),
});

module.exports = { createOrder, listOrdersQuery };
