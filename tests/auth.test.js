const request = require('supertest');
const app = require('../src/app');
const db = require('./setup');

beforeAll(async () => db.connect());
afterEach(async () => db.clearDatabase());
afterAll(async () => db.closeDatabase());

describe('Auth', () => {
  it('signs up a new user with hashed password and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'alice@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user.role).toBe('customer'); // default role
  });

  it('rejects signup with a role field (no privilege escalation)', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'evil@example.com', password: 'password123', role: 'admin' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('customer'); // role field silently stripped, not honored
  });

  it('rejects duplicate email signup', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'bob@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'bob@example.com', password: 'anotherpassword' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects signup with invalid email / short password', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', password: '123' });

    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'carol@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'carol@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'dave@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dave@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });
});
