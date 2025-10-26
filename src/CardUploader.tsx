// src/CardUploader.tsx (Updated)
import { useEffect, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { Box, Typography, Button, Paper, Stack, LinearProgress, Avatar } from '@mui/material';
import { storage, rdb } from './firebase';
import { getDownloadURL, ref as sref, uploadBytesResumable } from 'firebase/storage';
import { limitToLast, onValue, orderByChild, query, ref as rref } from 'firebase/database';

// interface 定義
interface UploadRecord {
  uid: string;
  key: string;
  fullText?: string;
  imagePath: string;
  status: string;
  parsedAt?: number;
}

interface UploadRecordRaw {
  uid: string;
  fullText?: string;
  lines?: string[];
  imagePath: string;
  status: string;
  parsedAt?: number;
}

interface CuProps {
  sessionId: string;
}

const CardUploader: React.FC<CuProps> = ({ sessionId }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState<number>(0);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      setMessage('ファイルが選択されていません。');
      setFiles([]);
      return;
    }
    const arr = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    setFiles(arr);
    setStatus('idle');
    setMessage(`${arr.length} 個の画像を選択しました。`);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => e.preventDefault();
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files);

  const uploadAll = () => {
    if (files.length === 0) {
      setStatus('error');
      setMessage('アップロードする画像がありません。');
      return;
    }
    setStatus('processing');
    setMessage('アップロード中…');
    setProgress(0);

    const uploadPromises = files.map(file => {
      //仮フォルダにup
      const path = `temp/${Date.now()}_${file.name}`;
      const storageRef = sref(storage, path);

      // カスタムメタデータを設定（sessionIdを動的に使用）
      const metadata = {
        contentType: file.type,
        customMetadata: {
          sessionId: sessionId,
        },
      };

      const task = uploadBytesResumable(storageRef, file, metadata);

      return new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snapshot => {
            const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setProgress(prev => Math.max(prev, prog));
          },
          error => {
            reject(error);
          },
          () => {
            resolve();
          }
        );
      });
    });

    Promise.all(uploadPromises)
      .then(() => {
        setStatus('success');
        setMessage('アップロード成功しました。');
        setFiles([]);
      })
      .catch(err => {
        console.error(err);
        setStatus('error');
        setMessage(`エラー：${err.message}`);
      });
  };

  const [records, setRecords] = useState<UploadRecord[]>([]);

  useEffect(() => {
    const uploadsRef = rref(rdb, `uploads/${sessionId}`);
    const q = query(uploadsRef, orderByChild('parsedAt'), limitToLast(10));

    const unsubscribe = onValue(
      q,
      async snapshot => {
        if (snapshot.exists()) {
          const data: UploadRecordRaw[] = snapshot.val() || [];
          const arr: UploadRecord[] = [];

          for (const [dataId, rec] of Object.entries(data)) {
            const imagePath = rec.imagePath;
            let imageUrl = '';
            if (imagePath) {
              try {
                imageUrl = await getDownloadURL(sref(storage, imagePath));
              } catch (e) {
                console.error('getDownloadURL error for path:', imagePath, e);
                // デフォルト画像やエラー処理
              }
            }
            console.log('imageUrl: ', imageUrl);
            arr.push({
              uid: rec.uid || '',
              key: `${sessionId}/${dataId}`,
              fullText: rec.fullText || rec.lines?.join('\n'),
              imagePath: imageUrl, // ← URLに変換
              status: rec.status,
              parsedAt: rec.parsedAt,
            });
          }

          // parsedAt 降順にソートして表示順を最新に
          arr.sort((a, b) => (a.parsedAt || 0) - (b.parsedAt || 0));
          setRecords(arr);
        } else {
          setRecords([
            {
              uid: '',
              key: ``,
              fullText: 'まだ解析記録がありません',
              imagePath: '',
              status: '',
              parsedAt: 0,
            },
          ]);
        }
      },
      error => {
        console.error('onValue error', error);
      }
    );

    return unsubscribe;
  }, [sessionId]);

  return (
    <>
      <Stack spacing={3} sx={{ maxWidth: 700, mx: 'auto', mt: 4, p: 2 }}>
        <Typography variant="h4" color="primary" align="center">
          画像アップロード
        </Typography>

        <Paper
          elevation={3}
          variant="outlined"
          sx={{
            p: 4,
            textAlign: 'center',
            bgcolor: status === 'processing' ? 'grey.200' : 'background.paper',
            cursor: 'pointer',
            border: '2px dashed',
            borderColor: status === 'processing' ? 'grey.400' : 'primary.main',
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept="image/*"
            multiple
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />
          <Typography variant="body1" color="textSecondary">
            クリックして画像を選択
          </Typography>
        </Paper>

        <Typography
          align="center"
          color={
            status === 'error' ? 'error' : status === 'success' ? 'success.main' : 'textSecondary'
          }
        >
          {message}
        </Typography>

        {status === 'processing' && <LinearProgress variant="determinate" value={progress} />}

        {files.length > 0 && (
          <Stack spacing={2}>
            {files.map((file, i) => (
              <Box key={i} display="flex" alignItems="center">
                <Box
                  component="img"
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  sx={{
                    width: 60,
                    height: 60,
                    objectFit: 'contain',
                    border: 1,
                    borderColor: 'grey.300',
                    borderRadius: 1,
                    mr: 2,
                  }}
                />
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                  {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </Typography>
              </Box>
            ))}
            <Button
              variant="contained"
              color="primary"
              onClick={uploadAll}
              disabled={status === 'processing'}
            >
              一括アップロード
            </Button>
          </Stack>
        )}
      </Stack>

      <Typography variant="h5" sx={{ mt: 4, px: 2 }}>
        解析結果一覧（最新10件）
      </Typography>
      <Stack spacing={2} sx={{ px: 2 }}>
        {records.map(rec => (
          <Box
            key={rec.key || Math.random()}
            sx={{
              display: 'flex',
              alignItems: 'center',
              p: 1,
              borderColor: rec.status === 'processing' ? 'warning.light' : 'primary.light',
              borderWidth: 1,
              borderLeftWidth: 4,
              borderRadius: 1,
              borderStyle: 'solid',
            }}
          >
            <Avatar
              variant="rounded"
              src={typeof rec.imagePath === 'string' && rec.imagePath ? rec.imagePath : undefined}
              alt="thumbnail"
              sx={{ width: 60, height: 60, mr: 2 }}
            />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {rec.status || '待機中'}
              </Typography>
              <Box sx={{ height: '150px', overflow: 'auto', mt: 1 }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  <small>{rec.fullText}</small>
                </Typography>
              </Box>
            </Box>
          </Box>
        ))}
      </Stack>
    </>
  );
};

export default CardUploader;
