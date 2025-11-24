// src/parts/UploadedCard.tsx
import React from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { Avatar } from '@mui/material';
import type { UploadRecord } from '../CardUploader';

interface UploadedCardProps {
  rec: UploadRecord;
}
const UploadedCard: React.FC<UploadedCardProps> = ({ rec }) => {
  return (
    <Box
      key={rec.key || Math.random()}
      sx={{
        display: 'flex',
        alignItems: 'center',
        p: 1,
        borderRadius: 1,
        backgroundColor: rec.uploadType === 'match' ? 'info.light' : 'success.light',
        color: 'white',
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
      <Box sx={{ textAlign: 'left' }}>
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          {rec.status || '待機中'}
        </Typography>
        <Typography variant="body2">
          <small>{rec.className}</small>
          <br />
          <small>{rec.round ? `${rec.round}回戦` : ''}</small>
          <br />
          <small>{rec.uploadType === 'match' ? '組合せ' : '結果'}</small>
        </Typography>
      </Box>
    </Box>
  );
};

export default UploadedCard;
