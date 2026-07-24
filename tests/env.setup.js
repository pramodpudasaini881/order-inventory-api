process.env.JWT_SECRET = 'test_secret_key_for_jest_runs_only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_SALT_ROUNDS = '4'; // fast hashing for tests
process.env.MONGO_URI = 'mongodb://placeholder/only-used-by-real-server';
process.env.NODE_ENV = 'test';
