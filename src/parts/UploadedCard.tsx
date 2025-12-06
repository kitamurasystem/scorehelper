// src/parts/UploadedCard.tsx
import React from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { Avatar, Button } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { storage } from '../firebase';
import { getDownloadURL, ref as sref } from 'firebase/storage';
import type { UploadRecord } from '../types/Basic';

interface UploadedCardProps {
  rec: UploadRecord;
}
const formatDate = (timestamp: number | null): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${month}/${day} ${hours}:${minutes}:${seconds}`;
};

const UploadedCard: React.FC<UploadedCardProps> = ({ rec }) => {
  // ダウンロード処理関数
  const handleDownload = async () => {
    if (!rec.imagePath || rec.status !== 'completed') return;

    try {
      // Firebase StorageのパスからURLを取得
      const storageRef = sref(storage, rec.imagePath);
      const url = await getDownloadURL(storageRef);

      // 取得したURLから画像をダウンロード
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;

      // ファイル名を生成
      const filename = `${rec.classesName}_${rec.round}回戦_${rec.uploadType === 'match' ? '組合せ' : '結果'}.jpg`;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('ダウンロードに失敗しました:', error);
    }
  };
  const formattedDate = formatDate(rec.parsedAt || null);

  return (
    <Box
      key={rec.key || Math.random()}
      sx={{
        display: 'flex',
        alignItems: 'center',
        boxShadow: '0 0 10px rgba(0,0,0,0.2)',
      }}
    >
      <Avatar
        variant="rounded"
        src={
          typeof rec.thumbnailPath === 'string' && rec.thumbnailPath ? rec.thumbnailPath : undefined
        }
        alt="thumbnail"
        sx={{ width: 240, height: 180, mr: 1 }}
      />
      <Box sx={{ textAlign: 'left', flex: 1, p: 1, mr: 1 }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 'bold', display: rec.status === 'completed' ? 'none' : 'block' }}
        >
          {rec.status || '待機中...'}
        </Typography>
        <Typography variant="body2">
          {rec.classesName}
          <br />
          {rec.round ? `${rec.round}回戦` : ''}
          <br />
          <small>{formattedDate}</small>
        </Typography>
        <Button
          variant="contained"
          color={rec.uploadType === 'match' ? 'primary' : 'success'}
          size="small"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          disabled={!rec.imagePath || rec.status !== 'completed'}
          sx={{
            '&.Mui-disabled': {
              bgcolor: 'grey.300',
              color: 'grey.500',
            },
          }}
        >
          {rec.uploadType === 'match' ? '組合せ' : '結果'}
        </Button>
      </Box>
    </Box>
  );
};

export default UploadedCard;
