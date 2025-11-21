import * as admin from 'firebase-admin';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import sharp from 'sharp';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { StorageObjectData } from 'firebase-functions/storage';

const visionClient = new ImageAnnotatorClient();

export interface ProcessResult {
  newFilePath: string; // Firebase Storageのパス (match/ or result/)
  thumbnailPath: string; // Firebase Storageのサムネイルパス
  fullText: string;
}

interface Word {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function processImage(object: StorageObjectData): Promise<ProcessResult> {
  const bucket = admin.storage().bucket(object.bucket!);
  const filePath = object.name!;
  const fileName = path.basename(filePath);
  const tempFilePath = path.join(os.tmpdir(), fileName);

  // customMetadataから必要な情報を取得
  const customMetadata = object.metadata || {};
  const classesName = customMetadata.classesName || 'unknown';
  const round = customMetadata.round || '1';
  const uploadType = customMetadata.uploadType || 'match';

  // --- 1. ダウンロード ---
  await bucket.file(filePath).download({ destination: tempFilePath });

  // --- 2. OCR ---
  const [result] = await visionClient.documentTextDetection(tempFilePath);
  const annotations = result.fullTextAnnotation;

  const words: Word[] = [];
  annotations?.pages?.forEach(page =>
    page.blocks?.forEach(block =>
      block.paragraphs?.forEach(para =>
        para.words?.forEach(word => {
          const text = word.symbols?.map(s => s.text).join('') || '';
          const box = word.boundingBox?.vertices;
          if (box && box.length === 4) {
            const x = Math.min(...box.map(v => v.x || 0));
            const y = Math.min(...box.map(v => v.y || 0));
            const width = Math.max(...box.map(v => v.x || 0)) - x;
            const height = Math.max(...box.map(v => v.y || 0)) - y;
            words.push({ text, x, y, width, height });
          }
        })
      )
    )
  );

  // --- 3. 回転角度計算 ---
  const angles: number[] = [];
  annotations?.pages?.forEach(page =>
    page.blocks?.forEach(block =>
      block.paragraphs?.forEach(para =>
        para.words?.forEach(word => {
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
    angles.length > 0 ? angles.sort((a, b) => a - b)[Math.floor(angles.length / 2)] : 0;

  // --- 4. 回転 & JPEG化 ---
  const rotatedPath = path.join(os.tmpdir(), 'rotated.jpg');
  await sharp(tempFilePath)
    .rotate(-rotateAngle)
    .resize(1600, 1200, { fit: 'inside' })
    .jpeg({ quality: 90 })
    .toFile(rotatedPath);

  // --- 5. サムネイル作成 (幅240px、高さ自動調整) ---
  const thumbnailPath = path.join(os.tmpdir(), `thumbnail_${fileName}`);
  await sharp(rotatedPath)
    .resize(240, 180, { fit: 'inside' })
    .jpeg({ quality: 80 })
    .toFile(thumbnailPath);

  // --- 6. ファイル名生成 ---
  const timestamp = Date.now();
  const newFileName = `${classesName}_${round}_${timestamp}.jpg`;

  // --- 7. Firebase Storageに回転後の画像をアップロード (match/ or result/) ---
  const targetFolder = uploadType === 'match' ? 'match' : 'result';
  const rotatedStoragePath = `${targetFolder}/${newFileName}`;

  await bucket.upload(rotatedPath, {
    destination: rotatedStoragePath,
    contentType: 'image/jpeg',
  });

  // --- 8. Firebase Storageにサムネイルをアップロード ---
  const thumbnailStoragePath = `thumbnail/${newFileName}`;
  await bucket.upload(thumbnailPath, {
    destination: thumbnailStoragePath,
    contentType: 'image/jpeg',
  });

  // --- 9. 元ファイル削除 (temp/) ---
  await bucket.file(filePath).delete();

  // --- 10. 一時ファイル削除 ---
  await fs.promises.unlink(tempFilePath);
  await fs.promises.unlink(rotatedPath);
  await fs.promises.unlink(thumbnailPath);

  const fullText = annotations?.text || '';

  // Storage パスを返す
  return { newFilePath: rotatedStoragePath, thumbnailPath: thumbnailStoragePath, fullText };
}
