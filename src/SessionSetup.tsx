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
} from '@mui/material';
import { rdb } from './firebase';
import { ref as rref, set } from 'firebase/database';

interface SessionSetupProps {
  onSessionCreated: (sessionId: string, sessionLabel: string) => void;
}

const SessionSetup: React.FC<SessionSetupProps> = ({ onSessionCreated }) => {
  const [sessionLabel, setSessionLabel] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

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

    // 日本語を含む文字列をIDとして使用可能かチェック
    // Firebase のキーとして使用できない文字をチェック（. # $ [ ] /）
    const invalidChars = /[.#$[\]/]/;
    if (invalidChars.test(input)) {
      // 無効な文字が含まれている場合はタイムスタンプベースのIDを生成
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substr(2, 4);
      const sessionId = `session_${timestamp}_${randomSuffix}`;
      return { isValid: true, sessionId };
    }

    // 日本語やその他の文字が含まれていてもFirebaseキーとして有効な場合は、そのまま使用
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

    setIsCreating(true);

    try {
      const sessionData = {
        id: validation.sessionId,
        label: sessionLabel.trim(),
        createdAt: Date.now(),
      };

      // sessionデータをFirebase Realtime Databaseに保存
      await set(rref(rdb, 'session'), sessionData);

      console.log('Session created:', sessionData);
      onSessionCreated(validation.sessionId, sessionLabel.trim());
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.log('Reset error:', error);
        setError(`セッション作成エラー: ${error.message}`);
      } else {
        console.log('Unknown error occurred');
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

  return (
    <Stack spacing={4} sx={{ maxWidth: 500, mx: 'auto', mt: 8, p: 3 }}>
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
              error={!!error}
              helperText={error || '例：2025年春季大会、第10回○○コンテストなど'}
              disabled={isCreating}
              placeholder="大会名を入力"
              autoFocus
              inputProps={{
                maxLength: 50,
              }}
            />

            {error && <Alert severity="error">{error}</Alert>}

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={!sessionLabel.trim() || isCreating || !!error}
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
