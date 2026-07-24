const request = require('supertest');
const app = require('../src/app');
const db = require('./setup');
const { createUserWithRole } = require('./helpers');
const Product = require('../src/models/Product');
const orderService = require('../src/services/orderService');

beforeAll(async () => db.connect());
afterEach(async () => db.clearDatabase());
afterAll(async () => db.closeDatabase());

async function makeProduct(overrides = {}) {
  return Product.create({
    name: 'Test Product',
    price: 10,
    stock: 10,
    category: 'general',
    ...overrides,
  });
}

describe('Order creation - core logic', () => {
  it('creates an order and decrements stock', async () => {
    const { token } = await createUserWithRole('cust@example.com', 'password123', 'customer');
    const product = await makeProduct({ stock: 10 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: product._id.toString(), quantity: 3 }] });

    expect(res.status).toBe(201);
    expect(res.body.order.totalAmount).toBe(30);

    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(7);
  });

  it('rejects an order that exceeds available stock', async () => {
    const { token } = await createUserWithRole('cust2@example.com', 'password123', 'customer');
    const product = await makeProduct({ stock: 2 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: product._id.toString(), quantity: 5 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

    const unchanged = await Product.findById(product._id);
    expect(unchanged.stock).toBe(2); // untouched
  });

  it('rejects an order referencing a non-existent product', async () => {
    const { token } = await createUserWithRole('cust3@example.com', 'password123', 'customer');
    const fakeId = '64b64b64b64b64b64b64b64b';

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: fakeId, quantity: 1 }] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('rejects an order with an invalid (zero/negative) quantity', async () => {
    const { token } = await createUserWithRole('cust4@example.com', 'password123', 'customer');
    const product = await makeProduct();

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: product._id.toString(), quantity: 0 }] });

    expect(res.status).toBe(400);
  });

  it('merges duplicate product line items instead of double-decrementing', async () => {
    const { token } = await createUserWithRole('cust5@example.com', 'password123', 'customer');
    const product = await makeProduct({ stock: 10 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { productId: product._id.toString(), quantity: 2 },
          { productId: product._id.toString(), quantity: 3 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.order.items.length).toBe(1);
    expect(res.body.order.items[0].quantity).toBe(5);

    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(5); // 10 - (2+3)
  });

  it('rolls back earlier decrements if a later item in the same order fails', async () => {
    const { token } = await createUserWithRole('cust6@example.com', 'password123', 'customer');
    const productA = await makeProduct({ name: 'Product A', stock: 10 });
    const productB = await makeProduct({ name: 'Product B', stock: 1 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { productId: productA._id.toString(), quantity: 5 }, // succeeds
          { productId: productB._id.toString(), quantity: 5 }, // fails - only 1 in stock
        ],
      });

    expect(res.status).toBe(409);

    const a = await Product.findById(productA._id);
    const b = await Product.findById(productB._id);
    expect(a.stock).toBe(10); // rolled back
    expect(b.stock).toBe(1); // untouched
  });
});

describe('Order creation - concurrency / race condition', () => {
  it('never oversells stock under concurrent order requests', async () => {
    const product = await makeProduct({ stock: 5 });

    const buyers = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createUserWithRole(`buyer${i}@example.com`, 'password123', 'customer')
      )
    );

    // Fire 10 concurrent requests to buy 1 unit each, against only 5 units of stock.
    const results = await Promise.all(
      buyers.map(({ token }) =>
        request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${token}`)
          .send({ items: [{ productId: product._id.toString(), quantity: 1 }] })
      )
    );

    const succeeded = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status === 409);

    expect(succeeded.length).toBe(5); // exactly the available stock
    expect(failed.length).toBe(5);

    const finalProduct = await Product.findById(product._id);
    expect(finalProduct.stock).toBe(0); // never goes negative, never oversold
  });

  it('service-level: concurrent createOrder calls never drive stock negative', async () => {
    const product = await makeProduct({ stock: 3 });
    const buyerId = '64b64b64b64b64b64b64b64b';

    const attempts = Array.from({ length: 8 }, () =>
      orderService
        .createOrder(buyerId, [{ productId: product._id.toString(), quantity: 1 }])
        .then(() => 'ok')
        .catch(() => 'failed')
    );

    const outcomes = await Promise.all(attempts);
    const okCount = outcomes.filter((o) => o === 'ok').length;

    expect(okCount).toBe(3);

    const finalProduct = await Product.findById(product._id);
    expect(finalProduct.stock).toBe(0);
  });
});

describe('Order cancellation', () => {
  it('restores stock when an order is cancelled', async () => {
    const { token, user } = await createUserWithRole(
      'cancelcust@example.com',
      'password123',
      'customer'
    );
    const product = await makeProduct({ stock: 10 });

    const order = await orderService.createOrder(user._id.toString(), [
      { productId: product._id.toString(), quantity: 4 },
    ]);

    const afterOrder = await Product.findById(product._id);
    expect(afterOrder.stock).toBe(6);

    const res = await request(app)
      .patch(`/api/orders/${order._id}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('cancelled');

    const afterCancel = await Product.findById(product._id);
    expect(afterCancel.stock).toBe(10); // restored
  });
});
