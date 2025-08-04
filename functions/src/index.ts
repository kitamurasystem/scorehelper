// functions/src/index.ts
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { log, error as logError } from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { analyzeCard, CardParseResult } from "../../functions-ai/src/analyzeCard";  // ← 必ず定義・実装してください

admin.initializeApp();

export const onImageUpload = onObjectFinalized(
  // （bucket/region を指定しない場合はデフォルトバケットが使われます）
  async (event) => {
    // Gen-2 では event.data に StorageObjectMetadata が入っています
    const object = event.data;
    const name = object.name ?? "";
    const metadata = object.metadata ?? {};

    if (!name.startsWith("uploads/")) {
      log("Skipping non-uploads file:", name);
      return;
    }

    const sessionId = metadata.sessionId;
    const orderNum = parseInt(metadata.order ?? "", 10);
    if (!sessionId || isNaN(orderNum)) {
      logError("Invalid metadata on upload:", { name, metadata });
      return;
    }

    const orderKey = String(orderNum).padStart(3, "0");
    const dbRef = admin
      .database()
      .ref(`/uploads/${sessionId}/${orderKey}`);

    // 処理開始マーク
    await dbRef.set({
      status: "processing",
      imagePath: name,
      uploadedAt: admin.database.ServerValue.TIMESTAMP,
    });

    try {
      // ここで実際の解析を行う関数を呼び出し
      const result: CardParseResult = await analyzeCard(object);

      await dbRef.update({
        status: "done",
        className: result.className,
        playerName: result.playerName,
        affiliation: result.affiliation,
        rounds: result.rounds,
        parsedAt: admin.database.ServerValue.TIMESTAMP,
      });

      log("Analysis succeeded for:", name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await dbRef.update({
        status: "error",
        errorMessage: msg,
      });
      logError("Analysis failed for:", name, msg);
    }
  }
);
