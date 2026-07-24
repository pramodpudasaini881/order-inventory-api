const Product = require('../models/Product');
const Order = require('../models/Order');
const AppError = require('../utils/AppError');

/**
 * Merge duplicate product IDs within a single order into one line item.
 * Handles the edge case: "what if two line items reference the same
 * product?" -> we sum their quantities rather than decrementing stock
 * twice for the same product in two separate operations.
 */
function mergeDuplicateItems(items) {
  const merged = new Map();
  for (const { productId, quantity } of items) {
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  return Array.from(merged.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

/**
 * Concurrency strategy: atomic conditional update per line item.
 *
 * We use Product.findOneAndUpdate with a filter that requires
 * stock >= quantity, combined with $inc: { stock: -quantity }.
 * MongoDB guarantees that a single document update (including the
 * filter check and the field mutation) is atomic - two concurrent
 * requests hitting the same document can never both read "stock: 5"
 * and both succeed in decrementing below zero, because the second
 * writer's filter is evaluated against the already-updated document
 * and will fail to match if stock has dropped too low.
 *
 * Why not a multi-document transaction instead? A transaction (via
 * session.withTransaction) is the more "textbook" way to guarantee
 * all-or-nothing atomicity across several documents, but it requires
 * a replica set, holds locks for longer, and adds latency/overhead
 * for what is fundamentally a set of independent per-product stock
 * checks. Since each line item only touches one Product document,
 * the atomic conditional update gives us the same correctness
 * guarantee per item with far less overhead. The trade-off is that
 * if item 2 of 3 fails (out of stock), items already decremented
 * need to be rolled back explicitly - which we do below - rather
 * than getting automatic rollback from the DB engine.
 */
async function decrementStockOrRollback(items) {
  const decremented = []; // items successfully decremented so far, for rollback

  for (const { productId, quantity } of items) {
    // eslint-disable-next-line no-await-in-loop
    const product = await Product.findOneAndUpdate(
      { _id: productId, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { new: true }
    );

    if (!product) {
      // Either the product doesn't exist, or there wasn't enough stock.
      // eslint-disable-next-line no-await-in-loop
      const exists = await Product.findById(productId);

      // Roll back everything decremented so far in this order.
      // eslint-disable-next-line no-await-in-loop
      await rollback(decremented);

      if (!exists) {
        throw new AppError(`Product not found: ${productId}`, 404, 'PRODUCT_NOT_FOUND');
      }
      throw new AppError(
        `Insufficient stock for product ${exists.name} (available: ${exists.stock}, requested: ${quantity})`,
        409,
        'INSUFFICIENT_STOCK'
      );
    }

    decremented.push({ productId, quantity, priceAtOrder: product.price });
  }

  return decremented;
}

async function rollback(decremented) {
  await Promise.all(
    decremented.map(({ productId, quantity }) =>
      Product.updateOne({ _id: productId }, { $inc: { stock: quantity } })
    )
  );
}

async function createOrder(userId, rawItems) {
  const items = mergeDuplicateItems(rawItems);

  const resolvedItems = await decrementStockOrRollback(items);

  const totalAmount = resolvedItems.reduce(
    (sum, item) => sum + item.priceAtOrder * item.quantity,
    0
  );

  try {
    const order = await Order.create({
      user: userId,
      items: resolvedItems.map((i) => ({
        product: i.productId,
        quantity: i.quantity,
        priceAtOrder: i.priceAtOrder,
      })),
      totalAmount,
      status: 'confirmed',
    });
    return order;
  } catch (err) {
    // If order document creation itself fails after stock was already
    // decremented, restore stock so it isn't lost.
    await rollback(resolvedItems);
    throw err;
  }
}

/**
 * Cancel an order and atomically restore stock for each item.
 * (This is the "add order cancellation" stretch feature called out
 * in the assignment's live-coding step - included here as a
 * reference implementation.)
 */
async function cancelOrder(orderId, requestingUser) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }
  if (requestingUser.role !== 'admin' && order.user.toString() !== requestingUser.id) {
    throw new AppError('Not authorized to cancel this order', 403, 'FORBIDDEN');
  }
  if (order.status === 'cancelled') {
    throw new AppError('Order is already cancelled', 400, 'ALREADY_CANCELLED');
  }

  await Promise.all(
    order.items.map((item) =>
      Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } })
    )
  );

  order.status = 'cancelled';
  await order.save();
  return order;
}

async function listOrders(user, { page, limit, status }) {
  const filter = {};
  if (status) filter.status = status;
  // Customers only ever see their own orders; admins see everything.
  if (user.role !== 'admin') {
    filter.user = user.id;
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find(filter)
      .populate('items.product', 'name category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function getOrderById(orderId, user) {
  const order = await Order.findById(orderId).populate('items.product', 'name category');
  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }
  if (user.role !== 'admin' && order.user.toString() !== user.id) {
    throw new AppError('Not authorized to view this order', 403, 'FORBIDDEN');
  }
  return order;
}

module.exports = {
  createOrder,
  cancelOrder,
  listOrders,
  getOrderById,
  mergeDuplicateItems, // exported for unit testing
};
