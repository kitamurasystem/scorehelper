// functions/src/driveService.ts
import { google } from 'googleapis';
import * as functions from 'firebase-functions';

const ROOT_FOLDER_ID = '1gsN8P5jhB8imRxizLCpvcH6ITchUpCTh';

// Google Drive APIクライアントの初期化
const getDriveClient = () => {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
};

// フォルダ存在チェック
export const checkDriveFolderExists = functions.https.onCall(async request => {
  try {
    const drive = getDriveClient();
    const { folderName } = request.data;

    const response = await drive.files.list({
      q: `name='${folderName}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });

    const exists = response.data.files && response.data.files.length > 0;
    return { exists };
  } catch (error) {
    console.error('フォルダチェックエラー:', error);
    throw new functions.https.HttpsError('internal', 'フォルダチェックに失敗しました');
  }
});

// 3つのフォルダを作成
export const createDriveFolders = functions.https.onCall(async request => {
  try {
    const drive = getDriveClient();
    const { folderName } = request.data;

    // 3つのフォルダ名
    const folderNames = [folderName, `${folderName}_tmp`, `${folderName}_thumb`];
    const folderIds: { [key: string]: string } = {};

    // 各フォルダを作成
    for (const name of folderNames) {
      const fileMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [ROOT_FOLDER_ID],
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
      });

      const key = name === folderName ? 'main' : name.endsWith('_tmp') ? 'tmp' : 'thumb';
      folderIds[key] = response.data.id!;
    }

    return {
      folderId: folderIds.main,
      folderIdTmp: folderIds.tmp,
      folderIdThumb: folderIds.thumb,
    };
  } catch (error) {
    console.error('フォルダ作成エラー:', error);
    throw new functions.https.HttpsError('internal', 'フォルダ作成に失敗しました');
  }
});
