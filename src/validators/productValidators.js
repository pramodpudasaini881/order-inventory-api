const Joi = require('joi');

const createProduct = Joi.object({
  name: Joi.string().min(2).max(200).required(),
  price: Joi.number().min(0).required(),
  stock: Joi.number().integer().min(0).required(),
  category: Joi.string().min(2).max(100).required(),
});

const updateProduct = Joi.object({
  name: Joi.string().min(2).max(200),
  price: Joi.number().min(0),
  stock: Joi.number().integer().min(0),
  category: Joi.string().min(2).max(100),
}).min(1);

const listProductsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  category: Joi.string().min(1).max(100),
});

module.exports = { createProduct, updateProduct, listProductsQuery };
