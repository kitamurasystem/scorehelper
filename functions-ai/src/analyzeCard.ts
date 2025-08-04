// functions-ai/src/analyzeCard.ts

import { genkit, z } from 'genkit';
import { googleAI } from '@genkit‑ai/googleai';

const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini‑2.5‑flash'),
});

// レスポンスの型定義
export const CardParseSchema = z.object({
  className: z.string().describe('クラス名（例：A級／B級）'),
  playerName: z.string().describe('選手のフルネーム'),
  affiliation: z.string().nullable().describe('会・学校'),
  rounds: z.array(
    z.object({
      round: z.number().describe('回戦番号'),
      result: z.enum(['〇', '×']).describe('勝敗記号'),
      score: z.number().describe('点数（勝：得点／敗：0）'),
    })
  ),
});

// 解析時に呼び出す関数
export async function analyzeCard(imageUrl: string): Promise<z.infer<typeof CardParseSchema>> {
  const { output } = await ai.generate({
    prompt: `以下の試合カード画像についてJSON形式で解析してください：\n${imageUrl}`,
    output: { schema: CardParseSchema },
  });

  if (!output) {
    throw new Error('カード解析の結果がスキーマと一致しませんでした');
  }
  return output;
}
