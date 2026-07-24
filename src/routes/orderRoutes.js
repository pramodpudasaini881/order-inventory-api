const express = require('express');
const orderController = require('../controllers/orderController');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { createOrder, listOrdersQuery } = require('../validators/orderValidators');

const router = express.Router();

// All order routes require authentication
router.use(authenticate);

// Customers place orders; admins are not blocked from placing them either
// unless you want to restrict it - kept open per "customers place orders"
// requirement, admins are just not the primary actor here.
router.post('/', requireRole('customer'), validate(createOrder), orderController.createOrder);

// Customers see only their own orders; admins see all (enforced in service layer)
router.get('/', validate(listOrdersQuery, 'query'), orderController.listOrders);
router.get('/:id', orderController.getOrder);
router.patch('/:id/cancel', orderController.cancelOrder);

module.exports = router;
