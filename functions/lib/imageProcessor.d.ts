import { StorageObjectData } from "firebase-functions/storage";
export interface GameResult {
    round: number;
    opponentClub: string;
    opponentName: string;
    isWin: boolean;
    scoreDiff: number;
    resultType: 'normal' | 'forfeit';
}
export interface PlayerCard {
    className: string;
    club: string;
    playerName: string;
    school: string;
    furigana: string;
    playerId: string;
    gameResults: GameResult[];
}
export interface ProcessResult {
    newFilePath: string;
    fullText: string;
}
export declare function processImage(object: StorageObjectData): Promise<ProcessResult>;
