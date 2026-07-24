const express = require('express');
const productController = require('../controllers/productController');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  createProduct,
  updateProduct,
  listProductsQuery,
} = require('../validators/productValidators');

const router = express.Router();

// Public: anyone can browse products
router.get('/', validate(listProductsQuery, 'query'), productController.listProducts);
router.get('/:id', productController.getProduct);

// Admin-only writes - role enforced via middleware, not inside the controller
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  validate(createProduct),
  productController.createProduct
);
router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate(updateProduct),
  productController.updateProduct
);
router.delete('/:id', authenticate, requireRole('admin'), productController.deleteProduct);

module.exports = router;
