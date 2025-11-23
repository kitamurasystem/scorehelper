// src/parts/UploadedCard.tsx
import React from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { Avatar } from '@mui/material';
import type { UploadRecord } from '../CardUploader';

interface UploadedCardProps {
  index: number;
  rec: UploadRecord;
}
const UploadedCard: React.FC<UploadedCardProps> = ({ index, rec }) => {
  return (
    <Box
      key={index || Math.random()}
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
        src={
          typeof rec.thumbnailPath === 'string' && rec.thumbnailPath ? rec.thumbnailPath : undefined
        }
        alt="thumbnail"
        sx={{ width: 240, height: 180, mr: 2 }}
      />
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          {rec.status || '待機中'}
        </Typography>
        <Typography variant="body2">
          <small>{rec.className}</small>
          <br />
          <small>{rec.round}</small>
        </Typography>
      </Box>
    </Box>
  );
};

export default UploadedCard;
