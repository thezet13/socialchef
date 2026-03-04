import { createServer } from './server';

//const PORT = process.env.PORT || 4001;
const PORT = Number(process.env.PORT ?? 4000);

async function start() {
  const app = createServer();

  // app.listen(PORT, () => {
  //   console.log(`🚀 SocialChef API running at http://127.0.0.1:${PORT}`);
  // });

  app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 SocialChef API running at http://0.0.0.0:${PORT}`);
});

}

start();
