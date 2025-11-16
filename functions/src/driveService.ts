// functions/src/driveService.ts
import { google } from 'googleapis';
import { GaxiosError } from 'gaxios';
import * as functions from 'firebase-functions';

// Google Drive APIクライアントの初期化
const getDriveClient = () => {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
};

// フォルダ存在チェックと権限確認
export const checkDriveFolderExists = functions.https.onCall(async request => {
  try {
    const drive = getDriveClient();
    const { folderId } = request.data;

    if (!folderId) {
      throw new functions.https.HttpsError('invalid-argument', 'フォルダIDが指定されていません');
    }

    // フォルダIDの存在、種類、権限を確認
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, trashed, capabilities(canAddChildren, canListChildren)',
      supportsAllDrives: true,
    });

    const file = response.data;

    // フォルダが存在し、削除されておらず、フォルダタイプであることを確認
    if (!file.id || file.trashed) {
      return { exists: false };
    }

    // フォルダタイプであることを確認
    if (file.mimeType !== 'application/vnd.google-apps.folder') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        '指定されたIDはフォルダではありません'
      );
    }

    // 子要素追加権限があることを確認
    const canAddChildren = file.capabilities?.canAddChildren ?? false;
    if (!canAddChildren) {
      throw new functions.https.HttpsError('permission-denied', 'フォルダへの編集権限がありません');
    }

    return { exists: true, folderName: file.name };
  } catch (error) {
    console.error('フォルダチェックエラー:', error);

    // Google API エラーの詳細処理
    if (error instanceof GaxiosError) {
      if (error.code === '404') {
        return { exists: false };
      }

      if (error.code === '403') {
        throw new functions.https.HttpsError(
          'permission-denied',
          'フォルダへのアクセス権限がありません'
        );
      }
    }

    // 既にHttpsErrorの場合はそのまま投げる
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError('internal', 'フォルダチェックに失敗しました');
  }
});

// 2つのフォルダを作成
export const createDriveFolders = functions.https.onCall(async request => {
  try {
    const drive = getDriveClient();
    const { folderId } = request.data;

    if (!folderId) {
      throw new functions.https.HttpsError('invalid-argument', 'フォルダIDが指定されていません');
    }

    // まず親フォルダの存在と権限を再確認
    const parentCheck = await drive.files.get({
      fileId: folderId,
      fields: 'id, mimeType, trashed, capabilities(canAddChildren)',
      supportsAllDrives: true,
    });

    if (
      !parentCheck.data.id ||
      parentCheck.data.trashed ||
      parentCheck.data.mimeType !== 'application/vnd.google-apps.folder' ||
      !parentCheck.data.capabilities?.canAddChildren
    ) {
      throw new functions.https.HttpsError(
        'permission-denied',
        '親フォルダへのアクセスまたは編集権限がありません'
      );
    }

    // 既存のサブフォルダをチェック
    const existingFolders = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and (name='Matches' or name='Results')`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (existingFolders.data.files && existingFolders.data.files.length > 0) {
      const existingNames = existingFolders.data.files.map(f => f.name).join(', ');
      throw new functions.https.HttpsError(
        'already-exists',
        `フォルダ「${existingNames}」が既に存在します`
      );
    }

    // 2つのフォルダ名
    const folderNames = ['Matches', 'Results'];
    const createdFolderIds: { [key: string]: string } = {};

    // 各フォルダを作成
    for (const name of folderNames) {
      try {
        const fileMetadata = {
          name: name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [folderId], // ★ 配列に修正
        };

        const response = await drive.files.create({
          requestBody: fileMetadata,
          fields: 'id, name',
          supportsAllDrives: true,
        });

        if (!response.data.id) {
          throw new Error(`フォルダ「${name}」の作成に失敗しました`);
        }

        createdFolderIds[name] = response.data.id;
        console.log(`フォルダ作成成功: ${name} (${response.data.id})`);
      } catch (error) {
        console.error(`フォルダ「${name}」作成エラー:`, error);

        // 既に作成したフォルダがあれば削除を試みる（ロールバック）
        for (const [createdName, createdId] of Object.entries(createdFolderIds)) {
          try {
            await drive.files.delete({
              fileId: createdId,
              supportsAllDrives: true,
            });
            console.log(`ロールバック: フォルダ「${createdName}」を削除しました`);
          } catch (deleteError) {
            console.error(`ロールバック失敗: フォルダ「${createdName}」の削除に失敗`, deleteError);
          }
        }

        throw error;
      }
    }

    // 両方のフォルダIDが取得できたか確認
    if (!createdFolderIds.Matches || !createdFolderIds.Results) {
      throw new Error('フォルダIDの取得に失敗しました');
    }

    return {
      folderId: folderId,
      folderIdMatches: createdFolderIds.Matches,
      folderIdResults: createdFolderIds.Results,
    };
  } catch (error) {
    console.error('フォルダ作成エラー:', error);

    // 既にHttpsErrorの場合はそのまま投げる
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    // Google API エラーの詳細処理
    if (error instanceof GaxiosError) {
      if (error.code === '404') {
        throw new functions.https.HttpsError('not-found', '親フォルダが見つかりません');
      }

      if (error.code === '403') {
        throw new functions.https.HttpsError('permission-denied', 'フォルダ作成の権限がありません');
      }

      if (error.code === '429') {
        throw new functions.https.HttpsError('resource-exhausted', 'API制限に達しました');
      }
    }

    const errorMessage = error instanceof Error ? error.message : '不明なエラー';
    throw new functions.https.HttpsError('internal', `フォルダ作成に失敗しました: ${errorMessage}`);
  }
});
