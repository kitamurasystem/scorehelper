// src/MainApp.tsx
import { useEffect, useState } from 'react';
import { Box, Typography, AppBar, Toolbar, CircularProgress } from '@mui/material';
import { rdb } from './firebase';
import { ref as rref, onValue } from 'firebase/database';
import CardUploader from './CardUploader';
import SessionSetup from './SessionSetup';

interface SessionData {
  id: string;
  label: string;
  createdAt: number;
}

const Home: React.FC = () => {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // セッション情報をチェック
  useEffect(() => {
    const sessionRef = rref(rdb, 'session');

    const unsubscribe = onValue(
      sessionRef,
      snapshot => {
        setIsLoading(false);
        if (snapshot.exists()) {
          const data = snapshot.val() as SessionData;
          console.log('Session found:', data);
          setSessionData(data);
        } else {
          console.log('No session found');
          setSessionData(null);
        }
      },
      error => {
        console.error('Session check error:', error);
        setIsLoading(false);
        setSessionData(null);
      }
    );

    return unsubscribe;
  }, []);

  const handleSessionCreated = (sessionId: string, sessionLabel: string) => {
    setSessionData({
      id: sessionId,
      label: sessionLabel,
      createdAt: Date.now(),
    });
  };

  // ローディング中
  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2,
        }}
      >
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">
          セッション情報を確認中...
        </Typography>
      </Box>
    );
  }

  // セッションが存在しない場合は新規作成画面
  if (!sessionData) {
    return <SessionSetup onSessionCreated={handleSessionCreated} />;
  }

  // メインアプリケーション画面
  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {sessionData.label}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            セッションID: {sessionData.id}
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 1 }}>
        <CardUploader sessionId={sessionData.id} />
      </Box>
    </Box>
  );
};

export default Home;
