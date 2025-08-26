import * as admin from "firebase-admin";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import sharp from "sharp";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { StorageObjectData } from "firebase-functions/storage";

const visionClient = new ImageAnnotatorClient();

export interface CardData {
  class: string;
  playerName: string;
  playerId: string;
  result: string;
}

export interface ProcessResult {
  newFilePath: string;
  fullText: string;
  classes: string[];
}

interface Word {
  text: string;
  x: number;
  y: number;
}

export async function processImage(
  object: StorageObjectData
): Promise<ProcessResult> {
  const bucket = admin.storage().bucket(object.bucket!);
  const filePath = object.name!;
  const fileName = path.basename(filePath);
  const tempFilePath = path.join(os.tmpdir(), fileName);

  // --- 1. ダウンロード ---
  await bucket.file(filePath).download({ destination: tempFilePath });

  // --- 2. OCR ---
  const [result] = await visionClient.documentTextDetection(tempFilePath);
  const annotations = result.fullTextAnnotation;

  const words: Word[] = [];
  annotations?.pages?.forEach((page) =>
    page.blocks?.forEach((block) =>
      block.paragraphs?.forEach((para) =>
        para.words?.forEach((word) => {
          const text = word.symbols?.map((s) => s.text).join("") || "";
          const box = word.boundingBox?.vertices;
          if (box && box.length === 4) {
            const x = (box[0].x! + box[1].x! + box[2].x! + box[3].x!) / 4;
            const y = (box[0].y! + box[1].y! + box[2].y! + box[3].y!) / 4;
            words.push({ text, x, y });
          }
        })
      )
    )
  );

  // --- 3. 回転角度計算 ---
  const angles: number[] = [];
  annotations?.pages?.forEach((page) =>
    page.blocks?.forEach((block) =>
      block.paragraphs?.forEach((para) =>
        para.words?.forEach((word) => {
          const box = word.boundingBox?.vertices;
          if (box && box.length === 4) {
            const dx = box[1].x! - box[0].x!;
            const dy = box[1].y! - box[0].y!;
            angles.push((Math.atan2(dy, dx) * 180) / Math.PI);
          }
        })
      )
    )
  );
  const rotateAngle =
    angles.length > 0
      ? angles.sort((a, b) => a - b)[Math.floor(angles.length / 2)]
      : 0;

  // --- 4. 回転 & JPEG化 ---
  const rotatedPath = path.join(os.tmpdir(), "rotated.jpg");
  await sharp(tempFilePath).rotate(-rotateAngle).jpeg({ quality: 80 }).toFile(rotatedPath);

  // --- 5. カードごとのJSON化 ---
  // x座標クラスタリングでカードごとに分割
  words.sort((a, b) => a.x - b.x);
  const clusters: Word[][] = [];
  const threshold = 50; // カード間のx座標差閾値
  words.forEach((w) => {
    let added = false;
    for (const cluster of clusters) {
      const avgX = cluster.reduce((sum, cw) => sum + cw.x, 0) / cluster.length;
      if (Math.abs(w.x - avgX) < threshold) {
        cluster.push(w);
        added = true;
        break;
      }
    }
    if (!added) clusters.push([w]);
  });

  const cards: CardData[] = clusters.map((cluster) => {
    // 右端の文字にクラス名・名前・IDがあると仮定
    cluster.sort((a, b) => b.x - a.x);
    const rightTexts = cluster.map((w) => w.text).join("");

    const classMatch = rightTexts.match(/([A-E]\d*級)/);
    const idMatch = rightTexts.match(/ID:(\d{4})/);
    const playerName = rightTexts
      .replace(classMatch?.[0] || "", "")
      .replace(idMatch?.[0] || "", "")
      .trim();

    // 左側の文字を成績情報と仮定
    const leftTexts = cluster
      .filter(
        (w) =>
          w.x <
          cluster.reduce((sum, cw) => sum + cw.x, 0) / cluster.length
      )
      .sort((a, b) => a.y - b.y)
      .map((w) => w.text)
      .join("");

    return {
      class: classMatch?.[1] || "UNKNOWN",
      playerName,
      playerId: idMatch?.[1] || "0000",
      result: leftTexts
    };
  });

  const fullText = JSON.stringify(cards, null, 2);

  // --- 6. ファイル名生成 ---
  const classStr = cards.map((c) => c.class).join("-") || "UNKNOWN";
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5).replace(":", "");
  let index = 1;
  let newFileName = `${classStr}_${hhmm}_${String(index).padStart(3, "0")}.jpg`;
  const dir = "uploads";

  while (await bucket.file(path.join(dir, newFileName)).exists().then((r) => r[0])) {
    index++;
    newFileName = `${classStr}_${hhmm}_${String(index).padStart(3, "0")}.jpg`;
  }
  const newFilePath = path.join(dir, newFileName);

  // --- 7. アップロード ---
  await bucket.upload(rotatedPath, {
    destination: newFilePath,
    contentType: "image/jpeg"
  });

  // --- 8. 元ファイル削除 ---
  await bucket.file(filePath).delete();

  // --- 9. 一時ファイル削除 ---
  await fs.promises.unlink(tempFilePath);
  await fs.promises.unlink(rotatedPath);

  return { newFilePath, fullText, classes: cards.map((c) => c.class) };
}
