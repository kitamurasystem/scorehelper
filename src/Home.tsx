// src/MainApp.tsx
import { useEffect, useState } from 'react';
import { Box, Typography, AppBar, Toolbar, CircularProgress, Tabs, Tab } from '@mui/material';
import { rdb } from './firebase';
import { ref as rref, onValue } from 'firebase/database';
import CardUploader from './CardUploader';
import SessionSetup from './SessionSetup';
import List from './List';

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
          //console.log('Session found:', data);
          setSessionData(data);
        } else {
          //console.log('No session found');
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

  const [value, setValue] = useState(0);

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
  }

  function CustomTabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
      <div
        role="tabpanel"
        hidden={value !== index}
        id={`simple-tabpanel-${index}`}
        aria-labelledby={`simple-tab-${index}`}
        {...other}
      >
        {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
      </div>
    );
  }

  function a11yProps(index: number) {
    return {
      id: `simple-tab-${index}`,
      'aria-controls': `simple-tabpanel-${index}`,
    };
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
      <Box sx={{ width: '20%', margin: 4 }}>
        <Tabs value={value} onChange={handleChange} centered>
          <Tab label="画像アップロード" {...a11yProps(0)} />
          <Tab label="一覧" {...a11yProps(1)} />

          <CustomTabPanel value={value} index={0}>
            <CardUploader sessionId={sessionData.id} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={1}>
            <List sessionId={sessionData.id} />
          </CustomTabPanel>
        </Tabs>
      </Box>
    </Box>
  );
};

export default Home;
