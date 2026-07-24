const Product = require('../models/Product');
const AppError = require('../utils/AppError');

async function createProduct(data) {
  return Product.create(data);
}

async function listProducts({ page, limit, category }) {
  // Whitelist the filter fields we build the Mongo query from - never
  // pass raw req.query straight into a Mongoose filter object, since
  // an attacker could smuggle operators like { "$gt": "" } through it.
  const filter = {};
  if (category) {
    filter.category = category.toLowerCase();
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getProductById(id) {
  const product = await Product.findById(id);
  if (!product) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
  }
  return product;
}

async function updateProduct(id, updates) {
  const product = await Product.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!product) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
  }
  return product;
}

async function deleteProduct(id) {
  const product = await Product.findByIdAndDelete(id);
  if (!product) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
  }
  return product;
}

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
