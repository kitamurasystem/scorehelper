// src/Reset.tsx
import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Stack,
} from '@mui/material';
import { storage, rdb } from './firebase';
import { ref as sref, listAll, deleteObject } from 'firebase/storage';
import { ref as rref, remove } from 'firebase/database';

interface ResetProps {
  sessionId: string;
  onResetComplete: () => void;
}

const Reset: React.FC<ResetProps> = ({ sessionId, onResetComplete }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleResetClick = () => {
    setIsDialogOpen(true);
    setResetStatus('idle');
    setErrorMessage('');
  };

  const handleDialogClose = () => {
    if (!isResetting) {
      setIsDialogOpen(false);
    }
  };

  const executeReset = async () => {
    setIsResetting(true);
    setResetStatus('idle');

    try {
      // 1. Realtime Database のデータを削除
      console.log('Deleting database records...');
      await Promise.all([remove(rref(rdb, 'uploads')), remove(rref(rdb, 'session'))]);

      // 2. Storage の temp フォルダを削除
      console.log('Deleting temp storage files...');
      const tempRef = sref(storage, 'temp');
      try {
        const tempList = await listAll(tempRef);
        const tempDeletePromises = tempList.items.map(item => deleteObject(item));
        await Promise.all(tempDeletePromises);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.log('No temp files to delete or error:', error);
        } else {
          console.log('Unknown error occurred');
        }
      }

      // 3. Storage の thumbnail フォルダを削除
      console.log('Deleting upload storage files...');
      const thumbnailRef = sref(storage, 'thumbnail');
      try {
        const thumbnailList = await listAll(thumbnailRef);
        const thumbnailDeletePromises = thumbnailList.items.map(item => deleteObject(item));
        await Promise.all(thumbnailDeletePromises);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.log('No thumbnail files to delete or error:', error);
        } else {
          console.log('Unknown error occurred');
        }
      }

      // 4. Storage の match フォルダを削除
      console.log('Deleting match storage files...');
      const matchRef = sref(storage, 'match');
      try {
        const matchList = await listAll(matchRef);
        const matchDeletePromises = matchList.items.map(item => deleteObject(item));
        await Promise.all(matchDeletePromises);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.log('No match files to delete or error:', error);
        } else {
          console.log('Unknown error occurred');
        }
      }

      // 5. Storage の result フォルダを削除
      console.log('Deleting result storage files...');
      const resultRef = sref(storage, 'result');
      try {
        const resultList = await listAll(resultRef);
        const resultDeletePromises = resultList.items.map(item => deleteObject(item));
        await Promise.all(resultDeletePromises);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.log('No result files to delete or error:', error);
        } else {
          console.log('Unknown error occurred');
        }
      }

      console.log('Reset completed successfully');
      setResetStatus('success');

      // 2秒後にダイアログを閉じてコールバックを実行
      setTimeout(() => {
        setIsDialogOpen(false);
        onResetComplete();
      }, 2000);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.log('Reset error:', error.message);
        setResetStatus('error');
        setErrorMessage(error.message || 'リセット処理中にエラーが発生しました。');
      } else {
        console.log('Unknown error occurred');
        setResetStatus('error');
        setErrorMessage('リセット処理中にエラーが発生しました。');
      }
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <Stack spacing={3} sx={{ maxWidth: 600, mx: 'auto', mt: 4, p: 2 }}>
        <Typography variant="h4" color="primary" align="center">
          データリセット
        </Typography>

        <Alert severity="warning">
          <Typography variant="body1" sx={{ mb: 2 }}>
            以下のデータがすべて削除されます：
          </Typography>
          <Typography component="ul" variant="body2" align="left">
            <li>アップロードした画像ファイル（temp、thumbnailフォルダ）</li>
            <li>解析結果データ（セッション: {sessionId}）</li>
            <li>セッション情報</li>
            <li>※Googleドライブに保存された画像は削除されません。</li>
          </Typography>
          <Typography variant="body2" sx={{ mt: 2, fontWeight: 'bold' }}>
            この操作は取り消すことができません。
          </Typography>
        </Alert>

        <Button
          variant="contained"
          color="error"
          size="large"
          onClick={handleResetClick}
          sx={{ alignSelf: 'center', px: 4, py: 1.5 }}
        >
          すべてのデータをリセット
        </Button>
      </Stack>

      <Dialog open={isDialogOpen} onClose={handleDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h6" color="error">
            データリセットの確認
          </Typography>
        </DialogTitle>

        <DialogContent>
          {resetStatus === 'idle' && !isResetting && (
            <>
              <Typography variant="body1" sx={{ mb: 2 }}>
                本当にすべてのデータを削除しますか？
              </Typography>
              <Typography variant="body2" color="text.secondary">
                削除されるデータ：
              </Typography>
              <Typography component="ul" variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                <li>すべての解析結果</li>
                <li>アップロードされた画像ファイル</li>
                <li>セッション設定情報</li>
              </Typography>
            </>
          )}

          {isResetting && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
              <CircularProgress size={24} />
              <Typography>削除処理を実行中...</Typography>
            </Box>
          )}

          {resetStatus === 'success' && (
            <Alert severity="success">すべてのデータが正常に削除されました。</Alert>
          )}

          {resetStatus === 'error' && (
            <Alert severity="error">削除処理でエラーが発生しました：{errorMessage}</Alert>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={handleDialogClose} disabled={isResetting} variant="outlined">
            キャンセル
          </Button>
          <Button
            onClick={executeReset}
            disabled={isResetting || resetStatus === 'success'}
            variant="contained"
            color="error"
          >
            {isResetting ? '削除中...' : 'リセット実行'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Reset;
