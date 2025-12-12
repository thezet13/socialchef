import express from 'express';
import cors from 'cors';
import { prisma } from './lib/prisma';
import postsRouter from './modules/posts/post.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { authRouter } from './modules/auth/auth.routes';
import aiUsageRouter from './modules/ai/ai.usage.routes';
import path from "path";
import imagesRouter from './modules/images/images.routes';

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'socialchef-api' });
  });

  app.get('/users', async (req, res) => {
    const users = await prisma.user.findMany();
    res.json(users);
  });

    app.use('/auth', authRouter);
    app.use('/ai', aiRouter);
    app.use("/posts", postsRouter);
    app.use("/ai", aiUsageRouter);
    app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
    app.use("/images", imagesRouter);
    
  return app;
}
