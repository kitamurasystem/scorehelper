// src/parts/UploadedCard.tsx
import React from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { Avatar, Button, Chip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { storage } from '../firebase';
import { getDownloadURL, ref as sref } from 'firebase/storage';
import type { UploadRecord } from '../CardUploader';

interface UploadedCardProps {
  rec: UploadRecord;
}

const UploadedCard: React.FC<UploadedCardProps> = ({ rec }) => {
  // ダウンロード処理関数
  const imageName = rec.imagePath?.split('/').pop() || '';
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
      const filename = `${rec.className}_${rec.round}回戦_${rec.uploadType === 'match' ? '組合せ' : '結果'}.jpg`;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('ダウンロードに失敗しました:', error);
    }
  };

  return (
    <Box
      key={rec.key || Math.random()}
      sx={{
        display: 'flex',
        alignItems: 'center',
        p: '0 1 0 0',
        boxShadow: '0 0 5px rgba(0,0,0,0.05)',
      }}
    >
      <Avatar
        variant="rounded"
        src={
          typeof rec.thumbnailPath === 'string' && rec.thumbnailPath ? rec.thumbnailPath : undefined
        }
        alt="thumbnail"
        sx={{ width: 240, height: 180, mr: 2 }}
      />
      <Box sx={{ textAlign: 'left', flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          {rec.status || '待機中'}
        </Typography>
        <Chip
          label={rec.uploadType === 'match' ? '組合せ' : '結果'}
          size="small"
          color={rec.uploadType === 'match' ? 'primary' : 'success'}
        />
        <Typography variant="body2">
          <small>{imageName}</small>
          <br />
          <small>{rec.className}</small>
          <br />
          <small>{rec.round ? `${rec.round}回戦` : ''}</small>
          <br />
          <small>{rec.parsedAt}</small>
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          disabled={!rec.imagePath || rec.status !== 'completed'}
          sx={{
            bgcolor: 'white',
            color: rec.uploadType === 'match' ? 'info.main' : 'success.main',
            '&:hover': {
              bgcolor: 'grey.100',
            },
            '&.Mui-disabled': {
              bgcolor: 'grey.300',
              color: 'grey.500',
            },
          }}
        ></Button>
      </Box>
    </Box>
  );
};

export default UploadedCard;
