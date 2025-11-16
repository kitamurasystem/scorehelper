import * as admin from 'firebase-admin';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { google } from 'googleapis';
import sharp from 'sharp';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { StorageObjectData } from 'firebase-functions/storage';

const visionClient = new ImageAnnotatorClient();

export interface ProcessResult {
  newFilePath: string; // GoogleドライブのファイルID
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
  const sessionId = customMetadata.sessionId || 'default_session';
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
  await sharp(tempFilePath).rotate(-rotateAngle).jpeg({ quality: 80 }).toFile(rotatedPath);

  // --- 5. サムネイル作成 (幅240px、高さ自動調整) ---
  const thumbnailPath = path.join(os.tmpdir(), 'thumbnail.jpg');
  await sharp(rotatedPath)
    .resize(240, null, { fit: 'inside' })
    .jpeg({ quality: 70 })
    .toFile(thumbnailPath);

  // --- 6. Realtime Databaseからセッション情報を取得 ---
  const sessionRef = admin.database().ref(`session`);
  const sessionSnapshot = await sessionRef.once('value');
  const sessionData = sessionSnapshot.val();

  if (!sessionData) {
    throw new Error(`Session data not found for session: ${sessionId}`);
  }

  const driveFolderIdMatch = sessionData.driveFolderIdMatch;
  const driveFolderIdResult = sessionData.driveFolderIdResult;

  if (!driveFolderIdMatch || !driveFolderIdResult) {
    throw new Error('Drive folder IDs not found in session data');
  }

  // --- 7. アップロード先フォルダIDを決定 ---
  const targetFolderId = uploadType === 'match' ? driveFolderIdMatch : driveFolderIdResult;

  // --- 8. ファイル名生成 ---
  const timestamp = Date.now();
  const driveFileName = `${classesName}_${round}_${timestamp}.jpg`;

  // --- 9. Google Driveに回転後の画像をアップロード ---
  const drive = google.drive({
    version: 'v3',
    auth: new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    }),
  });

  const fileStream = fs.createReadStream(rotatedPath);
  const driveResponse = await drive.files.create({
    requestBody: {
      name: driveFileName,
      parents: [targetFolderId],
    },
    media: {
      mimeType: 'image/jpeg',
      body: fileStream,
    },
    fields: 'id',
  });

  const driveFileId = driveResponse.data.id;
  if (!driveFileId) {
    throw new Error('Failed to upload file to Google Drive');
  }

  // --- 10. Firebase Storageにサムネイルをアップロード ---
  const thumbnailStoragePath = `thumbnail/${driveFileName}`;
  await bucket.upload(thumbnailPath, {
    destination: thumbnailStoragePath,
    contentType: 'image/jpeg',
  });

  // --- 11. 元ファイル削除 (temp/) ---
  await bucket.file(filePath).delete();

  // --- 12. 一時ファイル削除 ---
  await fs.promises.unlink(tempFilePath);
  await fs.promises.unlink(rotatedPath);
  await fs.promises.unlink(thumbnailPath);

  const fullText = annotations?.text || '';

  // GoogleドライブのファイルIDを返す
  return { newFilePath: driveFileId, fullText };
}
