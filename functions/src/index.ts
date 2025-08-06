// functions/src/index.ts

import * as logger from "firebase-functions/logger";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import { analyzeCard } from "../../functions-ai/src/analyzeCard";

admin.initializeApp();

export const onImageUpload = onObjectFinalized({
  region: "asia-northeast1",
  memory: "1GiB",
  timeoutSeconds: 60,
}, async (event) => {
  const object = event.data;
  const name = object.name || "";
  if (!name.startsWith("uploads/")) return;

  const metadata = object.metadata || {};
  const { sessionId, order } = metadata;
  const orderNum = parseInt(order || "", 10);
  if (!sessionId || isNaN(orderNum)) return;

  const dbRef = admin
    .database()
    .ref(`/uploads/${sessionId}/${String(orderNum).padStart(2, "0")}`);

  await dbRef.set({
    status: "processing",
    imagePath: name,
    uploadedAt: admin.database.ServerValue.TIMESTAMP,
  });

  try {
    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${object.bucket}/o/${encodeURIComponent(name)}?alt=media`;
    const result = await analyzeCard(imageUrl);

    await dbRef.update({
      status: "done",
      className: result.className,
      playerName: result.playerName,
      playerId: result.playerId,
      affiliation: result.affiliation,
      rounds: result.rounds,
      parsedAt: admin.database.ServerValue.TIMESTAMP,
    });
  } catch (err) {
    await dbRef.update({
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    logger.error("解析エラー", err);
  }
});
