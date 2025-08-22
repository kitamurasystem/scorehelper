import { StorageObjectData } from "firebase-functions/storage";
export interface ProcessResult {
    newFilePath: string;
    fullText: string;
    classes: string[];
}
export declare function processImage(object: StorageObjectData): Promise<ProcessResult>;
