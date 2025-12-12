import { createServer } from './server';

const PORT = process.env.PORT || 4001;

async function start() {
  const app = createServer();

  app.listen(PORT, () => {
    console.log(`🚀 SocialChef API running at http://localhost:${PORT}`);
  });
}

start();
