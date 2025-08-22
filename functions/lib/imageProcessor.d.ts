import * as admin from 'firebase-admin';
import { StorageObjectData } from 'firebase-functions/storage';
/**
 * 画像を処理して結果をRealtime DBに保存
 */
export declare function processImageUpload(object: StorageObjectData, dbRef: admin.database.Reference): Promise<void>;
