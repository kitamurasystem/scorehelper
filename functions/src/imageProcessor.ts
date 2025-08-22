import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { StorageObjectData } from 'firebase-functions/storage';

const visionClient = new ImageAnnotatorClient();

/**
 * 画像を処理して結果をRealtime DBに保存
 */
export async function processImageUpload(
  object: StorageObjectData,
  dbRef: admin.database.Reference
): Promise<void> {
  try {
    const gcsUri = `gs://${object.bucket}/${object.name}`;
    logger.debug(`Processing image: ${gcsUri}`);

    // OCR
    const [result] = await visionClient.textDetection(gcsUri);
    const annotations = result.textAnnotations || [];
    const fullText = annotations[0]?.description || '';

    // 改行ごとに行単位で切り出し
    const lines = fullText.split(/\r?\n/).filter((l) => l.trim().length > 0);

    await dbRef.update({
      status: 'done',
      fullText,
      parsedLines: lines,
      parsedAt: admin.database.ServerValue.TIMESTAMP,
    });

    logger.debug(`Image processing done: ${object.name}`);
  } catch (err) {
    await dbRef.update({
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    logger.error('Vision API解析エラー', err);
  }
}
