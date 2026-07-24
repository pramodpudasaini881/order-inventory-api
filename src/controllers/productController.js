const catchAsync = require('../utils/catchAsync');
const productService = require('../services/productService');

const createProduct = catchAsync(async (req, res) => {
  const product = await productService.createProduct(req.body);
  res.status(201).json({ product });
});

const listProducts = catchAsync(async (req, res) => {
  const result = await productService.listProducts(req.query);
  res.status(200).json(result);
});

const getProduct = catchAsync(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  res.status(200).json({ product });
});

const updateProduct = catchAsync(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  res.status(200).json({ product });
});

const deleteProduct = catchAsync(async (req, res) => {
  await productService.deleteProduct(req.params.id);
  res.status(204).send();
});

module.exports = { createProduct, listProducts, getProduct, updateProduct, deleteProduct };
