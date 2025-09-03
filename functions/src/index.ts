//src/index.ts

import * as logger from "firebase-functions/logger";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import { processImage } from "./imageProcessor";

admin.initializeApp();

export const onImageUpload = onObjectFinalized(
  {
    bucket: "scorehelper-3df2b.firebasestorage.app",
    region: "us-central1",
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const object = event.data;
    const name = object.name || "";
    if (!name.startsWith("temp/")) return;

    // アップロードされた画像のメタデータからsessionIdを取得
    const customMetadata = object.metadata;
    const sessionId = customMetadata?.sessionId || "default_session";

    const dbRef = admin
      .database()
      .ref(`/uploads/${sessionId}`);

    const newDbRef = await dbRef.push({
      uid: "", // 必要に応じて設定
      status: "processing",
      imagePath: name,
      createdAt: admin.database.ServerValue.TIMESTAMP,
    });

    try {
      const result = await processImage(object);

      await newDbRef.update({
        status: "completed", // "done" → "completed" に変更（フロントエンドと整合）
        fullText: result.fullText,
        imagePath: result.newFilePath,
        parsedAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });

    } catch (err) {
      await newDbRef.update({ // dbRef → newDbRef に修正
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
      logger.error("Image processing error", err);
    }
  }
);