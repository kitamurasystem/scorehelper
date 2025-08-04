// functions-ai/src/analyzeCard.ts
import { GenkitClient } from "genkit";

environment;
// 環境変数 GENKIT_API_KEY を設定しておくこと
const client = new GenkitClient({ apiKey: process.env.GENKIT_API_KEY! });

/**
 * 解析結果の型定義
 */
export interface CardParseResult {
  className: string;
  playerName: string;
  affiliation: string;
  rounds: Record<string, { win: boolean; score: number }>;
}

/**
 * 画像解析を Genkit 経由で行う関数
 * @param object Cloud Storage オブジェクトメタデータ
 */
export async function analyzeCard(object: {
  bucket: string;
  name: string;
}): Promise<CardParseResult> {
  const imageUrl = `https://storage.googleapis.com/${object.bucket}/${object.name}`;

  // Genkit に画像URLを投げて解析を実行
  const response = await client.parseImage({
    imageUrl,
    model: "document-parser",
  });

  // Genkit のレスポンス例をパースして結果を構造化
  const data = response.data;
  return {
    className: data.fields["className"].stringValue,
    playerName: data.fields["playerName"].stringValue,
    affiliation: data.fields["affiliation"].stringValue,
    rounds: Object.fromEntries(
      Object.entries(data.fields["rounds"].mapValue.fields).map(
        ([key, val]) => [
          key,
          {
            win: val.mapValue.values[0].booleanValue,
            score: parseInt(val.mapValue.values[1].integerValue, 10),
          },
        ]
      )
    ),
  };
}
