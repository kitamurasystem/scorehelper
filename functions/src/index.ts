// functions/src/index.ts

import * as logger from 'firebase-functions/logger';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as admin from 'firebase-admin';

admin.initializeApp();

export const onImageUpload = onObjectFinalized(
  {
    region: 'asia-northeast1',
    memory: '1GiB',
    timeoutSeconds: 60,
  },
  async event => {
    const object = event.data;
    const name = object.name || '';
    if (!name.startsWith('uploads/')) return;

    const metadata = object.metadata || {};
    const { sessionId, order } = metadata;
    const orderNum = parseInt(order || '', 10);
    if (!sessionId || isNaN(orderNum)) return;

    const dbRef = admin
      .database()
      .ref(`/uploads/${sessionId}/${String(orderNum).padStart(2, '0')}`);

    await dbRef.set({
      status: 'processing',
      imagePath: name,
      uploadedAt: admin.database.ServerValue.TIMESTAMP,
    });

    try {
      const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${object.bucket}/o/${encodeURIComponent(
        name
      )}?alt=media`;

      // HTTP 経由で doAnalyzeCard 関数を呼び出す
      const functionUrl =
        'https://asia-northeast2-<YOUR_PROJECT_ID>.cloudfunctions.net/doAnalyzeCard';
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 必要に応じて認証トークンを追加
          // 'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ imageUrl }),
      });

      if (!response.ok) {
        throw new Error(`Function call failed: ${response.statusText}`);
      }

      const result = (await response.json()) as {
        data: {
          className: string;
          playerName: string;
          playerId: string;
          affiliation: string;
          rounds: any;
        };
      };

      const { className, playerName, playerId, affiliation, rounds } = result.data;

      await dbRef.update({
        status: 'done',
        className,
        playerName,
        playerId,
        affiliation,
        rounds,
        parsedAt: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (err) {
      await dbRef.update({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      logger.error('解析エラー', err);
    }
  }
);
