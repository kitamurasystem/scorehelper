// src/SessionSetup.tsx
import { useState, useEffect } from 'react';
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

  // Googleドライブフォルダ名
  const [driveFolderName, setDriveFolderName] = useState('');
  const [folderNameError, setFolderNameError] = useState('');
  const [isCheckingFolder, setIsCheckingFolder] = useState(false);
  const [folderExists, setFolderExists] = useState(false);

  const functions = getFunctions();

  // 初期値として現在の日付を設定
  useEffect(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    setDriveFolderName(`${year}${month}${day}`);
  }, []);

  // フォルダ存在チェック（debounce付き）
  useEffect(() => {
    if (!driveFolderName || driveFolderName.length > 20) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsCheckingFolder(true);
      setFolderExists(false);

      try {
        const checkFunction = httpsCallable(functions, 'checkDriveFolderExists');
        const result = await checkFunction({ folderName: driveFolderName });
        const data = result.data as { exists: boolean };

        if (data.exists) {
          setFolderExists(true);
          setFolderNameError('この名前のフォルダが既に存在します');
        } else {
          setFolderNameError('');
        }
      } catch (error) {
        console.error('フォルダチェックエラー:', error);
        setFolderNameError('フォルダチェックに失敗しました');
      } finally {
        setIsCheckingFolder(false);
      }
    }, 500); // 500ms後にチェック

    return () => clearTimeout(timeoutId);
  }, [driveFolderName, functions]);

  const validateClassCount = (value: string): { isValid: boolean; error: string } => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0 || num > 50) {
      return { isValid: false, error: '0〜50までの数値を入れてください' };
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

  const handleFolderNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDriveFolderName(value);

    if (value.length > 20) {
      setFolderNameError('フォルダ名は20文字以内で入力してください');
    } else if (value.trim() === '') {
      setFolderNameError('フォルダ名を入力してください');
    } else {
      // 存在チェックはuseEffectで行う
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

    // フォルダ名のバリデーション
    if (!driveFolderName.trim()) {
      setError('フォルダ名を入力してください。');
      return;
    }

    if (driveFolderName.length > 20) {
      setError('フォルダ名は20文字以内で入力してください。');
      return;
    }

    if (folderExists) {
      setError('既に存在するフォルダ名は使用できません。');
      return;
    }

    setIsCreating(true);

    try {
      // Googleドライブにフォルダを作成
      const createFunction = httpsCallable(functions, 'createDriveFolders');
      const result = await createFunction({ folderName: driveFolderName });
      const folderData = result.data as {
        folderId: string;
        folderIdTmp: string;
        folderIdThumb: string;
      };

      const sessionData = {
        id: validation.sessionId,
        label: sessionLabel.trim(),
        createdAt: Date.now(),
        ...classCounts,
        driveFolderName: driveFolderName.trim(),
        driveFolderId: folderData.folderId,
        driveFolderIdTmp: folderData.folderIdTmp,
        driveFolderIdThumb: folderData.folderIdThumb,
      };

      // sessionデータをFirebase Realtime Databaseに保存
      await set(rref(rdb, 'session'), sessionData);

      console.log('Session created:', sessionData);
      onSessionCreated(validation.sessionId, sessionLabel.trim());
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('セッション作成エラー:', error);
        setError(`セッション作成エラー: ${error.message}`);
      } else {
        console.error('Unknown error occurred');
        setError('セッション作成エラー');
      }
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

  const canSubmit =
    sessionLabel.trim() &&
    driveFolderName.trim() &&
    driveFolderName.length <= 20 &&
    !folderExists &&
    !isCheckingFolder &&
    !isCreating &&
    !error &&
    !folderNameError &&
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
                  : '例：2025年春季大会、第10回○○コンテストなど'
              }
              disabled={isCreating}
              placeholder="大会名を入力"
              autoFocus
              inputProps={{
                maxLength: 50,
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
                      inputProps={{
                        min: 0,
                        max: 50,
                      }}
                      size="small"
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>

            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                保存先フォルダ名
              </Typography>
              <TextField
                fullWidth
                label="フォルダ名"
                value={driveFolderName}
                onChange={handleFolderNameChange}
                error={!!folderNameError}
                helperText={folderNameError || '例：20250128、春季大会など（20文字以内）'}
                disabled={isCreating}
                placeholder="フォルダ名を入力"
                inputProps={{
                  maxLength: 20,
                }}
                InputProps={{
                  endAdornment: isCheckingFolder ? <CircularProgress size={20} /> : null,
                }}
              />
            </Box>

            {error && <Alert severity="error">{error}</Alert>}

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
