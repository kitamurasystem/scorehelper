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
    if (!name.startsWith("uploads/")) return;

    const metadata = object.metadata || {};
    const { order } = metadata;
    const orderNum = parseInt(order || "", 10);
    const sessionId = "20250821_sample"; // 固定の大会ID

    if (isNaN(orderNum)) {
      logger.debug("orderNum invalid: " + orderNum);
      return;
    }

    const dbRef = admin
      .database()
      .ref(`/uploads/${sessionId}/${String(orderNum).padStart(2, "0")}`);

    await dbRef.set({
      status: "processing",
      imagePath: name,
      uploadedAt: admin.database.ServerValue.TIMESTAMP,
    });

    try {
      const result = await processImage(object);

      await dbRef.update({
        status: "done",
        fullText: result.fullText,
        classes: result.classes,
        imagePath: result.newFilePath,
        parsedAt: admin.database.ServerValue.TIMESTAMP,
      });

      logger.debug("Image processed:", result.newFilePath);
    } catch (err) {
      await dbRef.update({
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      logger.error("Image processing error", err);
    }
  }
);
