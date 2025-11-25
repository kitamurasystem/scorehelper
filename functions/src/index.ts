//src/index.ts

import * as logger from 'firebase-functions/logger';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as admin from 'firebase-admin';
import { processImage } from './imageProcessor';

export { checkDriveFolderExists, createDriveFolders } from './driveService';

admin.initializeApp();

export const onImageUpload = onObjectFinalized(
  {
    bucket: 'scorehelper-3df2b.firebasestorage.app',
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 120,
  },
  async event => {
    const object = event.data;
    const name = object.name || '';
    if (!name.startsWith('temp/')) return;

    // アップロードされた画像のメタデータからsessionId、classesName、round、uploadTypeを取得
    // 現在はCardUploaderでのアップロードに対応しているため、recordIdのみ使用
    const customMetadata = object.metadata;
    // const uid = customMetadata?.uid || 'anonymous';
    // const classesName = customMetadata?.classesName || '';
    // const round = customMetadata?.round || '';
    // const uploadType = customMetadata?.uploadType || '';

    const recordId = customMetadata?.recordId;
    if (!recordId) {
      logger.error('recordId not found in metadata');
      return;
    }
    const dbRef = admin.database().ref(`/uploads/${recordId}`);

    await dbRef.update({
      status: 'processing',
      imagePath: name,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    try {
      const result = await processImage(object);

      await dbRef.update({
        status: 'completed', // "done" → "completed" に変更（フロントエンドと整合）
        fullText: result.fullText,
        imagePath: result.newFilePath,
        thumbnailPath: result.thumbnailPath,
        parsedAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (err) {
      await dbRef.update({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
      logger.error('Image processing error', err);
    }
  }
);
