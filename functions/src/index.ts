//src/index.ts

import * as logger from 'firebase-functions/logger';
import * as functions from 'firebase-functions';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as admin from 'firebase-admin';
import { processImage } from './imageProcessor';

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
    // 現在はCardUploader側で既に登録しているため、recordIdのみ使用
    const customMetadata = object.metadata;

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
export const deleteAnonymousUsers = functions.https.onCall(async context => {
  // 管理者権限チェック(必須)
  if (!context.auth || !isAdmin(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', '管理者権限が必要です');
  }

  try {
    let deletedCount = 0;
    let pageToken: string | undefined;

    do {
      const listResult = await admin.auth().listUsers(1000, pageToken);

      const anonymousUids = listResult.users
        .filter(user => user.providerData.length === 0)
        .map(user => user.uid);

      if (anonymousUids.length > 0) {
        await admin.auth().deleteUsers(anonymousUids);
        deletedCount += anonymousUids.length;
      }

      pageToken = listResult.pageToken;
    } while (pageToken);

    return { success: true, deletedCount };
  } catch (error) {
    console.error('削除エラー:', error);
    throw new functions.https.HttpsError('internal', '削除に失敗しました');
  }
});

// 管理者チェック関数(実装は環境に応じて調整)
function isAdmin(uid: string): boolean {
  // Custom Claimsやデータベースで管理者を確認
  if (uid) {
    return true; // 実装必要
  } else {
    return true;
  }
}
