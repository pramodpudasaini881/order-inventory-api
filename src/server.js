const app = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');

async function start() {
  await connectDB();
  // eslint-disable-next-line no-console
  console.log('Connected to MongoDB');

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${env.port}`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
