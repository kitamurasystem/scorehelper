import * as logger from 'firebase-functions/logger';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as admin from 'firebase-admin';
import { processImageUpload } from './imageProcessor';

admin.initializeApp();

export const onImageUpload = onObjectFinalized(
  {
    bucket: 'scorehelper-3df2b.firebasestorage.app',
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 120,
  },
  async (event) => {
    const object = event.data;
    const name = object.name || '';

    if (!name.startsWith('uploads/')) {
      logger.debug('Skip non-upload file: ' + name);
      return;
    }

    const metadata = object.metadata || {};
    const { sessionId, order } = metadata;
    const orderNum = parseInt(order || '', 10);

    if (!sessionId || isNaN(orderNum)) {
      logger.debug('Invalid metadata', metadata);
      return;
    }

    const dbRef = admin
      .database()
      .ref(`/uploads/${sessionId}/${String(orderNum).padStart(2, '0')}`);

    await dbRef.set({
      status: 'processing',
      imagePath: name,
      uploadedAt: admin.database.ServerValue.TIMESTAMP,
    });
    logger.debug('Realtime database set OK');

    // 別モジュールに委譲
    await processImageUpload(object, dbRef);
  }
);
