const catchAsync = require('../utils/catchAsync');
const orderService = require('../services/orderService');

const createOrder = catchAsync(async (req, res) => {
  const items = req.body.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
  const order = await orderService.createOrder(req.user.id, items);
  res.status(201).json({ order });
});

const listOrders = catchAsync(async (req, res) => {
  const result = await orderService.listOrders(req.user, req.query);
  res.status(200).json(result);
});

const getOrder = catchAsync(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id, req.user);
  res.status(200).json({ order });
});

const cancelOrder = catchAsync(async (req, res) => {
  const order = await orderService.cancelOrder(req.params.id, req.user);
  res.status(200).json({ order });
});

module.exports = { createOrder, listOrders, getOrder, cancelOrder };
