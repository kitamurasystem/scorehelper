// src/Home.tsx
import { useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  LinearProgress,
} from '@mui/material';
import { storage } from './firebase';
import { ref, uploadBytesResumable } from 'firebase/storage';

const Home = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string>('');
  const [status, setStatus] = useState<'idle'|'processing'|'success'|'error'>('idle');
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
      const path = `uploads/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);
      return new Promise<void>((resolve, reject) => {
        task.on('state_changed',
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

  return (
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
          borderColor: status === 'processing' ? 'grey.400' : 'primary.main'
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
          ドラッグ＆ドロップまたはクリックして画像を選択
        </Typography>
      </Paper>

      <Typography align="center" color={
        status === 'error' ? 'error' :
        status === 'success' ? 'success.main' :
        'textSecondary'
      }>
        {message}
      </Typography>

      {status === 'processing' && <LinearProgress variant="determinate" value={progress} />}

      {files.length > 0 && (
        <Stack spacing={2}>
          {files.map((file, i) => (
            <Box key={i} display="flex" alignItems="center">
              <Box component="img"
                src={URL.createObjectURL(file)}
                alt={file.name}
                sx={{ width: 60, height: 60, objectFit: 'contain', border: 1, borderColor: 'grey.300', borderRadius: 1, mr: 2 }}
              />
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </Typography>
            </Box>
          ))}
          <Button variant="contained" color="primary" onClick={uploadAll} disabled={status === 'processing'}>
            一括アップロード
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

export default Home;