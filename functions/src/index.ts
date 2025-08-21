// functions/src/index.ts

import * as logger from 'firebase-functions/logger';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as admin from 'firebase-admin';
// import { ImageAnnotatorClient } from '@google-cloud/vision';

admin.initializeApp();
// const visionClient = new ImageAnnotatorClient();

export const onImageUpload = onObjectFinalized(
  {
    bucket: 'scorehelper-3df2b.firebasestorage.app',
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 120, // OCRで多少時間がかかる可能性があるので延長
  },
  async (event) => {
      logger.debug('onImageUpload start');
    const object = event.data;
    const name = object.name || '';
      logger.debug("object.name: " + name);
    if (!name.startsWith('uploads/')) {
      logger.debug('!namestartsWith');
      return;
    }

    const metadata = object.metadata || {};
    const { sessionId, order } = metadata;
    const orderNum = parseInt(order || '', 10);
    if (!sessionId || isNaN(orderNum)) {
      logger.debug('sessionId: ' + sessionId);
      logger.debug('orderNum: ' + orderNum);
      return;
    }

    try {
      const dbRef = admin
        .database()
        .ref(`/uploads/${sessionId}/${String(orderNum).padStart(2, '0')}`);

      await dbRef.set({
        status: 'processing',
        imagePath: name,
        uploadedAt: admin.database.ServerValue.TIMESTAMP,
      });
        logger.debug('Realtime database set OK');
    } catch (err) {
      logger.error('RDB set error: ', err);
    }

    // try {
    //   // GCS URI 形式で Vision API に渡す
    //   const gcsUri = `gs://${object.bucket}/${name}`;

    //   // OCR実行
    //   const [result] = await visionClient.textDetection(gcsUri);
    //   const annotations = result.textAnnotations || [];

    //   // annotations[0].description に全文、annotations[1...] に個別ブロック
    //   const fullText = annotations[0]?.description || '';

    //   // 簡易的に行単位で解析（必要に応じて座標や正規表現で抽出）
    //   const lines = fullText.split(/\r?\n/).filter((l) => l.trim().length > 0);

    //   // ここで lines をもとに playerName や playerId、affiliation、rounds を抽出
    //   // 例: 正規表現や行番号でルールベース抽出
    //   // 今回はサンプルとしてそのまま lines を保存
    //   await dbRef.update({
    //     status: 'done',
    //     fullText,
    //     parsedLines: lines,
    //     parsedAt: admin.database.ServerValue.TIMESTAMP,
    //   });
    // } catch (err) {
    //   await dbRef.update({
    //     status: 'error',
    //     errorMessage: err instanceof Error ? err.message : String(err),
    //   });
    //   logger.error('Vision API解析エラー', err);
    // }
  }
);
