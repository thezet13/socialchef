// apps/api/src/lib/openai.ts
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    '[OpenAI] OPENAI_API_KEY is not set. /ai endpoints will not work until you configure it.'
  );
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
