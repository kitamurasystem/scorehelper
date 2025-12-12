import * as functions from 'firebase-functions';
export declare const onImageUpload: functions.CloudFunction<functions.storage.StorageEvent>;
export declare const deleteAnonymousUsers: functions.https.CallableFunction<any, Promise<{
    success: boolean;
    deletedCount: number;
}>, unknown>;
