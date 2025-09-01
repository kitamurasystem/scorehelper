// src/MainApp.tsx
import { useEffect, useState } from 'react';
import { Box, Typography, AppBar, Toolbar, Tab, Tabs, CircularProgress } from '@mui/material';
import { rdb } from './firebase';
import { ref as rref, onValue } from 'firebase/database';
import Home from './Home';
import Reset from './Reset';
import SessionSetup from './SessionSetup';

interface SessionData {
  id: string;
  label: string;
  createdAt: number;
}

type ViewMode = 'home' | 'reset';

const MainApp: React.FC = () => {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<ViewMode>('home');

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
    setCurrentView('home');
  };

  const handleResetComplete = () => {
    setSessionData(null);
    setCurrentView('home');
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: ViewMode) => {
    setCurrentView(newValue);
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
        <Tabs
          value={currentView}
          onChange={handleTabChange}
          centered
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab label="画像アップロード" value="home" />
          <Tab label="データリセット" value="reset" />
        </Tabs>
      </AppBar>

      <Box sx={{ p: 1 }}>
        {currentView === 'home' && <Home sessionId={sessionData.id} />}

        {currentView === 'reset' && (
          <Reset sessionId={sessionData.id} onResetComplete={handleResetComplete} />
        )}
      </Box>
    </Box>
  );
};

export default MainApp;
