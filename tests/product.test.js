const request = require('supertest');
const app = require('../src/app');
const db = require('./setup');
const { createUserWithRole } = require('./helpers');

beforeAll(async () => db.connect());
afterEach(async () => db.clearDatabase());
afterAll(async () => db.closeDatabase());

describe('Products', () => {
  it('allows an admin to create a product', async () => {
    const { token } = await createUserWithRole('admin1@example.com', 'password123', 'admin');

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Widget', price: 9.99, stock: 100, category: 'Tools' });

    expect(res.status).toBe(201);
    expect(res.body.product.name).toBe('Widget');
    expect(res.body.product.category).toBe('tools'); // lowercased
  });

  it('blocks a customer from creating a product', async () => {
    const { token } = await createUserWithRole('cust1@example.com', 'password123', 'customer');

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Widget', price: 9.99, stock: 100, category: 'Tools' });

    expect(res.status).toBe(403);
  });

  it('blocks an unauthenticated request from creating a product', async () => {
    const res = await request(app)
      .post('/api/products')
      .send({ name: 'Widget', price: 9.99, stock: 100, category: 'Tools' });

    expect(res.status).toBe(401);
  });

  it('validates product input on create', async () => {
    const { token } = await createUserWithRole('admin2@example.com', 'password123', 'admin');

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', price: -5, stock: -1, category: '' });

    expect(res.status).toBe(400);
  });

  it('lists products with pagination and category filter', async () => {
    const { token } = await createUserWithRole('admin3@example.com', 'password123', 'admin');

    const categories = ['tools', 'tools', 'electronics'];
    for (const category of categories) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Item-${category}-${Math.random()}`, price: 5, stock: 10, category });
    }

    const res = await request(app).get('/api/products?category=tools&page=1&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it('allows an admin to update and delete a product', async () => {
    const { token } = await createUserWithRole('admin4@example.com', 'password123', 'admin');

    const created = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Gadget', price: 20, stock: 5, category: 'electronics' });

    const id = created.body.product._id;

    const updated = await request(app)
      .put(`/api/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ price: 25 });

    expect(updated.status).toBe(200);
    expect(updated.body.product.price).toBe(25);

    const deleted = await request(app)
      .delete(`/api/products/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleted.status).toBe(204);
  });
});
