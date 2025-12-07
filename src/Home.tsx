// src/MainApp.tsx
import { createContext, useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Tabs, Tab } from '@mui/material';
import { storage, rdb } from './firebase';
import { ref as rref, onValue, query } from 'firebase/database';
import CardUploader from './CardUploader';
import SessionSetup from './SessionSetup';
import List from './List';
import type { UploadRecord, UploadRecordRaw } from './types/Basic';
import { getDownloadURL, ref as sref } from 'firebase/storage';

interface SessionData {
  id: string;
  label: string;
  createdAt: number;
  class_A?: number;
  class_B?: number;
  class_C?: number;
  class_D?: number;
  class_E?: number;
  class_F?: number;
}

export const ContextAllRecords = createContext(
  {} as {
    allRecords: UploadRecord[];
  }
);

export const ContextSessionData = createContext(
  {} as {
    sessionData: SessionData;
  }
);

const Home: React.FC = () => {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [records, setRecords] = useState<UploadRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [value, setValue] = useState<number>(0);

  // セッション情報をチェック
  useEffect(() => {
    const sessionRef = rref(rdb, 'session');

    const unsubscribe = onValue(
      sessionRef,
      snapshot => {
        setIsLoading(false);
        if (snapshot.exists()) {
          const data = snapshot.val() as SessionData;
          setSessionData(data);
        } else {
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

  // アップロード記録の監視
  useEffect(() => {
    const uploadsRef = rref(rdb, 'uploads');
    const q = query(uploadsRef);

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
            let thumbnailUrl = '';
            if (rec.status === 'completed') {
              // サムネイルのStorageパスを取得
              const thumbPath = rec.thumbnailPath;
              if (thumbPath) {
                try {
                  thumbnailUrl = await getDownloadURL(sref(storage, thumbPath));
                } catch (e) {
                  console.error('getDownloadURL error for thumbnail path:', thumbPath, e);
                  // デフォルト画像やエラー処理
                }
              }
            }
            const formattedParsedAt = rec.parsedAt ? new Date(rec.parsedAt).toTimeString() : '';
            arr.push({
              uid: rec.uid || '',
              key: dataId,
              classesName: rec.classesName ? rec.classesName.split('_').join(',') : '',
              round: rec.round || undefined,
              uploadType: rec.uploadType || undefined,
              imagePath: imageUrl, // ← URLに変換
              thumbnailPath: thumbnailUrl, // ← サムネイルURLに変換
              status: rec.status,
              createdAt: rec.createdAt,
              parsedAt: rec.parsedAt,
              formattedParsedAt: formattedParsedAt,
            });
          }

          // parsedAt 降順にソートして表示順を最新に
          arr.sort((a, b) => {
            const aTime = a.parsedAt || a.createdAt;
            const bTime = b.parsedAt || b.createdAt;
            return bTime - aTime; // 降順（最新が上）
          });
          setRecords(arr);
        } else {
          setRecords([
            {
              uid: '',
              fullText: 'まだ解析記録がありません',
              imagePath: '',
              status: '',
              createdAt: 0,
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
  }, [sessionData]);

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
      <Typography variant="h5" sx={{ flexGrow: 1, mb: 2, textAlign: 'center' }}>
        {sessionData.label}
      </Typography>
      <Box sx={{ width: '100%' }}>
        <ContextSessionData.Provider value={{ sessionData: sessionData }}>
          <ContextAllRecords.Provider value={{ allRecords: records }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={value} onChange={handleChange} centered>
                <Tab label="画像アップロード" {...a11yProps(0)} />
                <Tab label="一覧" {...a11yProps(1)} />
              </Tabs>
            </Box>
            <CustomTabPanel value={value} index={0}>
              <CardUploader />
            </CustomTabPanel>
            <CustomTabPanel value={value} index={1}>
              <List />
            </CustomTabPanel>
          </ContextAllRecords.Provider>
        </ContextSessionData.Provider>
      </Box>
    </Box>
  );
};

export default Home;
