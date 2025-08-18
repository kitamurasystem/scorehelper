// functions/src/analyzeCardFlow.ts

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';
import { onCallGenkit } from 'firebase-functions/https';

// Genkit クライアント初期化
const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GENKIT_OPENAI_API_KEY ?? '' })],
  model: googleAI.model('gemini-1.5-flash'),
});

// スキーマ定義（省略）
const CardParseSchema = z.object({
  className: z.string(),
  playerName: z.string(),
  playerId: z.string(),
  affiliation: z.string().nullable(),
  rounds: z.array(
    z.object({
      round: z.number(),
      result: z.enum(['〇', '×']),
      score: z.number(),
    })
  ),
});

// Flow の定義
export const analyzeCardFlow = ai.defineFlow(
  {
    name: 'analyzeCardFlow',
    inputSchema: z.object({ imageUrl: z.string().url() }),
    outputSchema: CardParseSchema,
  },
  async ({ imageUrl }) => {
    const { output } = await ai.generate({
      prompt: `この画像に印刷されている試合結果カードについて…\n${imageUrl}`,
      output: { schema: CardParseSchema },
    });
    if (!output) throw new Error('解析結果がスキーマ定義と一致しませんでした');
    return output;
  }
);

// Callable 関数として公開
export const doAnalyzeCard = onCallGenkit(
  {
    secrets: ['GENKIT_OPENAI_API_KEY'],
    authPolicy: auth => !!auth?.token,
    enforceAppCheck: true,
    cors: 'your-domain.com',
  },
  analyzeCardFlow
);
