import * as admin from "firebase-admin";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import sharp from "sharp";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { StorageObjectData } from "firebase-functions/storage";

const visionClient = new ImageAnnotatorClient();

export interface ProcessResult {
  newFilePath: string;
  fullText: string;
  classes: string[];
}

export async function processImage(
  object: StorageObjectData
): Promise<ProcessResult> {
  const bucket = admin.storage().bucket(object.bucket!);
  const filePath = object.name!;
  const fileName = path.basename(filePath);
  const tempFilePath = path.join(os.tmpdir(), fileName);

  // ダウンロード
  await bucket.file(filePath).download({ destination: tempFilePath });

  // OCR
  const [result] = await visionClient.documentTextDetection(tempFilePath);
  const annotations = result.fullTextAnnotation;
  const fullText = annotations?.text || "";

  // 回転角度計算
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

  // 回転 & jpg化
  const rotatedPath = path.join(os.tmpdir(), "rotated.jpg");
  await sharp(tempFilePath).rotate(-rotateAngle).jpeg({ quality: 80 }).toFile(rotatedPath);

  // クラス名抽出
  const matches = [...fullText.matchAll(/([A-E]\d*級)/g)].map((m) => m[1]);
  const uniqueClasses = Array.from(new Set(matches)).sort((a, b) => {
    const [aAlpha, aNum] = [a[0], parseInt(a.slice(1)) || 0];
    const [bAlpha, bNum] = [b[0], parseInt(b.slice(1)) || 0];
    return aAlpha.localeCompare(bAlpha) || aNum - bNum;
  });
  const classStr = uniqueClasses.join("-") || "UNKNOWN";

  // 新ファイル名生成
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5).replace(":", "");
  let index = 1;
  let newFileName = `${classStr}_${hhmm}_${String(index).padStart(3, "0")}.jpg`;
  //const dir = path.dirname(filePath);
  const dir = 'uploads';

  while (await bucket.file(path.join(dir, newFileName)).exists().then((r) => r[0])) {
    index++;
    newFileName = `${classStr}_${hhmm}_${String(index).padStart(3, "0")}.jpg`;
  }
  const newFilePath = path.join(dir, newFileName);

  // アップロード
  await bucket.upload(rotatedPath, { destination: newFilePath, contentType: "image/jpeg" });

  // 元ファイル削除
  await bucket.file(filePath).delete();

  // 一時ファイル削除
  fs.unlinkSync(tempFilePath);
  fs.unlinkSync(rotatedPath);

  return { newFilePath, fullText, classes: uniqueClasses };
}
