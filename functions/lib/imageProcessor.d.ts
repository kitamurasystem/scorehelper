import { StorageObjectData } from "firebase-functions/storage";
export interface CardData {
    class: string;
    playerName: string;
    playerId: string;
    result: string;
}
export interface ProcessResult {
    newFilePath: string;
    fullText: string;
    classes: string[];
}
export declare function processImage(object: StorageObjectData): Promise<ProcessResult>;
