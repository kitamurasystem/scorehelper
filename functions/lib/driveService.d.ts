import * as functions from 'firebase-functions';
export declare const checkDriveFolderExists: functions.https.CallableFunction<any, Promise<{
    exists: boolean;
    folderName?: undefined;
} | {
    exists: boolean;
    folderName: string | null | undefined;
}>, unknown>;
export declare const createDriveFolders: functions.https.CallableFunction<any, Promise<{
    folderId: any;
    folderIdMatches: string;
    folderIdResults: string;
}>, unknown>;
