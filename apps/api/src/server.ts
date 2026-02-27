import express from 'express';
import cors from 'cors';
import cookieParser from "cookie-parser";
import { requireCsrf } from "./middleware/requireCsrf";

import { prisma } from './lib/prisma';
import postsRouter from './modules/posts/post.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { authRouter } from './modules/auth/auth.routes';
import aiUsageRouter from './modules/ai/ai.usage.routes';
import path from "path";
import imagesRouter from './modules/images/images.routes';
import { presetsRouter } from './modules/presets/presets.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { stylesRouter } from './modules/styles/styles.routes';
import { brandStylesRouter } from './modules/brand-styles/brandStyles.routes';

export function createServer() {
  const app = express();

  const allowlist = new Set([
    "http://127.0.0.1:3000",
    "http://127.0.0.1:4000",
    "http://127.0.0.1:4001",
    "http://localhost:3000",
    "https://app.socialchef.net",
  ]);

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true); // curl/postman
        cb(null, allowlist.has(origin));
      },
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(express.json());

  app.use(requireCsrf);

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'socialchef-api' });
  });

  app.get('/users', async (req, res) => {
    const users = await prisma.user.findMany();
    res.json(users);
  });

  app.use("/admin", adminRouter);

  app.use('/auth', authRouter);
  app.use('/ai', aiRouter);
  app.use("/posts", postsRouter);
  app.use("/ai", aiUsageRouter);
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  app.use("/images", imagesRouter);
  app.use("/presets", presetsRouter);
  app.use("/styles", stylesRouter);
  app.use("/brand-styles", brandStylesRouter);

  return app;
}
