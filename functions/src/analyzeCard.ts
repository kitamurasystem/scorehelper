// functions-ai/src/analyzeCard.ts

import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

// Genkit クライアントの構成（環境変数 GENKIT_OPENAI_API_KEY が必要）
const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GENKIT_OPENAI_API_KEY ?? '' })],
  // 例：モデルが gemini‑1.5‑flash の場合
  model: googleAI.model('gemini-1.5-flash'),
});

// スキーマと戻り値型定義
export const CardParseSchema = z.object({
  className: z.string().describe('級（例: A級）'),
  playerName: z.string().describe('選手名'),
  playerId: z.string().describe('選手ID'),
  affiliation: z.string().nullable().describe('会または学校名'),
  rounds: z
    .array(
      z.object({
        round: z.number().describe('回戦番号（1〜6）'),
        result: z.enum(['〇', '×']).describe('勝敗記号'),
        score: z.number().describe('勝利時の得点 or 0'),
      })
    )
    .describe('各回戦の勝敗と点数'),
});
export type CardParseResult = z.infer<typeof CardParseSchema>;

/**
 * 画像解析関数
 * @param imageUrl 解析対象画像の HTTPS URL
 */
export async function analyzeCard(imageUrl: string): Promise<CardParseResult> {
  const { output } = await ai.generate({
    prompt: `この画像に印刷されている試合結果カードについて、以下の形式でJSONを返してください [className, playerName, affiliation, rounds]：\n${imageUrl}`,
    output: { schema: CardParseSchema },
  });

  if (!output) {
    throw new Error('解析結果がスキーマ定義と一致しませんでした');
  }
  return output;
}
