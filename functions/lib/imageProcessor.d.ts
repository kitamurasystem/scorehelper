import { StorageObjectData } from 'firebase-functions/storage';
export interface ProcessResult {
    newFilePath: string;
    thumbnailPath: string;
    fullText: string;
}
export declare function processImage(object: StorageObjectData): Promise<ProcessResult>;
