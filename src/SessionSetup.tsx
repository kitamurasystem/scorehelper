// src/SessionSetup.tsx
import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  CircularProgress,
  Stack,
  Grid,
} from '@mui/material';
import { rdb } from './firebase';
import { ref as rref, set } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface SessionSetupProps {
  onSessionCreated: (sessionId: string, sessionLabel: string) => void;
}

interface ClassCounts {
  class_A: number;
  class_B: number;
  class_C: number;
  class_D: number;
  class_E: number;
  class_F: number;
}

interface ClassErrors {
  class_A: string;
  class_B: string;
  class_C: string;
  class_D: string;
  class_E: string;
  class_F: string;
}

interface DriveCheckResult {
  exists: boolean;
}

interface DriveCreateResult {
  folderId: string;
  folderIdMatches: string;
  folderIdResults: string;
}

const SessionSetup: React.FC<SessionSetupProps> = ({ onSessionCreated }) => {
  const [sessionLabel, setSessionLabel] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const [classCounts, setClassCounts] = useState<ClassCounts>({
    class_A: 0,
    class_B: 0,
    class_C: 0,
    class_D: 0,
    class_E: 0,
    class_F: 0,
  });

  const [classErrors, setClassErrors] = useState<ClassErrors>({
    class_A: '',
    class_B: '',
    class_C: '',
    class_D: '',
    class_E: '',
    class_F: '',
  });

  // GoogleドライブフォルダID
  const [driveFolderId, setDriveFolderId] = useState('');
  const [folderIdError, setFolderIdError] = useState('');

  const functions = getFunctions();

  const validateClassCount = (value: string): { isValid: boolean; error: string } => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0 || num > 50) {
      return { isValid: false, error: '0～50までの数値を入れてください' };
    }
    return { isValid: true, error: '' };
  };

  const handleClassCountChange = (classKey: keyof ClassCounts, value: string) => {
    const num = value === '' ? 0 : parseInt(value, 10);
    setClassCounts(prev => ({
      ...prev,
      [classKey]: isNaN(num) ? 0 : num,
    }));
  };

  const handleClassCountBlur = (classKey: keyof ClassCounts, value: string) => {
    const validation = validateClassCount(value);
    setClassErrors(prev => ({
      ...prev,
      [classKey]: validation.error,
    }));
  };

  // GoogleドライブフォルダIDの抽出と検証
  const extractAndValidateFolderId = (
    input: string
  ): { isValid: boolean; folderId: string; error: string } => {
    if (!input.trim()) {
      return { isValid: false, folderId: '', error: 'フォルダIDを入力してください' };
    }

    let folderId = input.trim();

    // URLの場合、フォルダIDを抽出
    if (folderId.includes('drive.google.com')) {
      // https://drive.google.com/drive/folders/FOLDER_ID?... 形式
      const match = folderId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (match) {
        folderId = match[1];
      } else {
        return { isValid: false, folderId: '', error: '有効なGoogleドライブURLではありません' };
      }
    }

    // GoogleドライブのフォルダIDは通常33文字程度の英数字、ハイフン、アンダースコア
    const folderIdPattern = /^[a-zA-Z0-9_-]{25,50}$/;
    if (!folderIdPattern.test(folderId)) {
      return { isValid: false, folderId: '', error: '有効なフォルダIDではありません' };
    }

    return { isValid: true, folderId, error: '' };
  };

  const handleFolderIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDriveFolderId(value);

    // リアルタイム検証
    if (value.trim()) {
      const validation = extractAndValidateFolderId(value);
      setFolderIdError(validation.error);
    } else {
      setFolderIdError('');
    }
  };

  // セッションIDとして使用可能かチェック
  const validateSessionId = (
    input: string
  ): { isValid: boolean; sessionId: string; error?: string } => {
    if (!input.trim()) {
      return { isValid: false, sessionId: '', error: '大会名を入力してください。' };
    }

    if (input.length > 50) {
      return { isValid: false, sessionId: '', error: '大会名は50文字以内で入力してください。' };
    }

    // Firebase のキーとして使用できない文字をチェック（. # $ [ ] /）
    const invalidChars = /[.#$[\]/]/;
    if (invalidChars.test(input)) {
      // 無効な文字が含まれている場合はタイムスタンプベースのIDを生成
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substr(2, 4);
      const sessionId = `session_${timestamp}_${randomSuffix}`;
      return { isValid: true, sessionId };
    }

    return { isValid: true, sessionId: input.trim() };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validation = validateSessionId(sessionLabel);
    if (!validation.isValid) {
      setError(validation.error || '入力内容に問題があります。');
      return;
    }

    // クラス数のバリデーション
    const hasClassError = Object.values(classErrors).some(err => err !== '');
    if (hasClassError) {
      setError('クラス数の入力に誤りがあります。');
      return;
    }

    // フォルダIDのバリデーション
    const folderValidation = extractAndValidateFolderId(driveFolderId);
    if (!folderValidation.isValid) {
      setError(folderValidation.error);
      return;
    }

    setIsCreating(true);

    try {
      // 1. フォルダの存在と権限を確認
      const checkFunction = httpsCallable<{ folderId: string }, DriveCheckResult>(
        functions,
        'checkDriveFolderExists'
      );
      const checkResult = await checkFunction({
        folderId: folderValidation.folderId,
      });

      if (!checkResult.data || !checkResult.data.exists) {
        setError('指定されたフォルダが見つからないか、アクセス権限がありません');
        setIsCreating(false);
        return;
      }

      // 2. GoogleドライブにMatchesとResultsフォルダを作成
      const createFunction = httpsCallable<{ folderId: string }, DriveCreateResult>(
        functions,
        'createDriveFolders'
      );
      const createResult = await createFunction({
        folderId: folderValidation.folderId,
      });

      if (!createResult.data) {
        throw new Error('フォルダ作成のレスポンスが不正です');
      }

      const folderData = createResult.data;

      // 3. データ検証
      if (!folderData.folderId || !folderData.folderIdMatches || !folderData.folderIdResults) {
        throw new Error('フォルダIDが正しく返されませんでした');
      }

      // 4. セッションデータを作成
      const sessionData = {
        id: validation.sessionId,
        label: sessionLabel.trim(),
        createdAt: Date.now(),
        ...classCounts,
        driveFolderId: folderData.folderId,
        driveFolderIdMatch: folderData.folderIdMatches,
        driveFolderIdResult: folderData.folderIdResults,
      };

      // 5. sessionデータをFirebase Realtime Databaseに保存
      await set(rref(rdb, 'session'), sessionData);

      console.log('Session created:', sessionData);
      onSessionCreated(validation.sessionId, sessionLabel.trim());
    } catch (error: unknown) {
      console.error('セッション作成エラー:', error);

      // エラーメッセージの詳細化
      let errorMessage = 'セッション作成エラー';

      if (error instanceof Error) {
        if (error.message.includes('permission')) {
          errorMessage = 'フォルダへのアクセス権限がありません';
        } else if (error.message.includes('not found')) {
          errorMessage = '指定されたフォルダが見つかりません';
        } else if (error.message.includes('quota')) {
          errorMessage = 'Google Drive の容量制限に達しています';
        } else {
          errorMessage = `エラー: ${error.message}`;
        }
      }

      setError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSessionLabel(value);

    // リアルタイムバリデーション
    if (value && error) {
      const validation = validateSessionId(value);
      if (validation.isValid) {
        setError('');
      }
    }
  };

  const classLabels: { key: keyof ClassCounts; label: string }[] = [
    { key: 'class_A', label: 'A級' },
    { key: 'class_B', label: 'B級' },
    { key: 'class_C', label: 'C級' },
    { key: 'class_D', label: 'D級' },
    { key: 'class_E', label: 'E級' },
    { key: 'class_F', label: 'F級' },
  ];

  const folderIdValidation = extractAndValidateFolderId(driveFolderId);
  const canSubmit =
    sessionLabel.trim() &&
    driveFolderId.trim() &&
    folderIdValidation.isValid &&
    !isCreating &&
    !error &&
    !folderIdError &&
    !Object.values(classErrors).some(err => err !== '');

  return (
    <Stack spacing={4} sx={{ maxWidth: 600, mx: 'auto', mt: 8, p: 3 }}>
      <Typography variant="h4" color="primary" align="center">
        新規セッション作成
      </Typography>

      <Paper elevation={3} sx={{ p: 4 }}>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={3}>
            <Typography variant="h6" color="text.secondary" align="center">
              大会名を入力してください
            </Typography>

            <TextField
              fullWidth
              label="大会名"
              value={sessionLabel}
              onChange={handleInputChange}
              error={!!error && error.includes('大会名')}
              helperText={
                error && error.includes('大会名')
                  ? error
                  : '例：2025年春季大会、第10回◯◯コンテストなど'
              }
              disabled={isCreating}
              placeholder="大会名を入力"
              autoFocus
              slotProps={{
                htmlInput: {
                  maxLength: 50,
                },
              }}
            />

            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                級別クラス数
              </Typography>
              <Grid container spacing={2}>
                {classLabels.map(({ key, label }) => (
                  <Grid size={{ xs: 6, sm: 4 }} key={key}>
                    <TextField
                      fullWidth
                      label={label}
                      type="number"
                      value={classCounts[key]}
                      onChange={e => handleClassCountChange(key, e.target.value)}
                      onBlur={e => handleClassCountBlur(key, e.target.value)}
                      error={!!classErrors[key]}
                      helperText={classErrors[key]}
                      disabled={isCreating}
                      slotProps={{
                        htmlInput: {
                          min: 0,
                          max: 50,
                        },
                      }}
                      size="small"
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>

            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                保存先Googleドライブのフォルダ 指定するフォルダは、
                <a href="scorehelper-3df2b@appspot.gserviceaccount.com"></a>に対する
                <strong>編集</strong>権限を付与してください。
                <br />
                ※共有の際、「通知」のチェックは外してください。
              </Typography>
              <TextField
                fullWidth
                label="フォルダID"
                value={driveFolderId}
                onChange={handleFolderIdChange}
                error={!!folderIdError}
                helperText={
                  folderIdError || 'GoogleドライブのフォルダIDまたはURLを入力してください'
                }
                disabled={isCreating}
                placeholder="フォルダIDまたはURLを入力"
              />
            </Box>

            {error && !error.includes('大会名') && <Alert severity="error">{error}</Alert>}

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={!canSubmit}
              sx={{ py: 1.5 }}
            >
              {isCreating ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  作成中...
                </>
              ) : (
                'セッション作成'
              )}
            </Button>

            <Typography variant="body2" color="text.secondary" align="center">
              作成後、画像のアップロードと解析が可能になります。
            </Typography>
          </Stack>
        </Box>
      </Paper>
    </Stack>
  );
};

export default SessionSetup;
