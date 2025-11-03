import * as functions from 'firebase-functions';
export declare const checkDriveFolderExists: functions.https.CallableFunction<any, Promise<{
    exists: boolean | undefined;
}>, unknown>;
export declare const createDriveFolders: functions.https.CallableFunction<any, Promise<{
    folderId: string;
    folderIdTmp: string;
    folderIdThumb: string;
}>, unknown>;
