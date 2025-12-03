// src/List.tsx
import { useEffect, useState } from 'react';
import { Box, Typography, Button, Paper, Stack } from '@mui/material';
import { storage, rdb } from './firebase';
import { getDownloadURL, ref as sref } from 'firebase/storage';
import {
  limitToLast,
  onValue,
  orderByChild,
  query,
  ref as rref,
  get,
  serverTimestamp,
} from 'firebase/database';
import { useContext } from 'react';
import { ContextUserAccount } from './App';
import UploadedCard from './parts/UploadedCard';

// interface 定義
export interface UploadRecord {
  uid: string;
  key: string;
  className?: string;
  round?: number;
  fullText?: string;
  imagePath: string;
  thumbnailPath?: string;
  status: string;
  parsedAt?: number;
  formattedParsedAt?: string;
  uploadType?: string;
}

interface UploadRecordRaw {
  uid: string;
  classesName?: string;
  round?: number;
  fullText?: string;
  imagePath: string;
  thumbnailPath?: string;
  status: string;
  parsedAt?: number;
  uploadType?: string;
}

interface CuProps {
  sessionId: string;
}

interface ClassCounts {
  class_A: number;
  class_B: number;
  class_C: number;
  class_D: number;
  class_E: number;
  class_F: number;
}

interface ClassGroup {
  classKey: string;
  classNumber: string;
}

interface UploadSettings {
  classGroups: ClassGroup[];
  round: number;
  uploadType: 'match' | 'result';
}

const STORAGE_KEY = 'cardUploader_settings';

const List: React.FC<CuProps> = ({ sessionId }) => {
  const { userAccount } = useContext(ContextUserAccount);
  const [message, setMessage] = useState<string>('');
  const [classCounts, setClassCounts] = useState<ClassCounts | null>(null);
  const [round, setRound] = useState<number>(1);
  const [uploadType, setUploadType] = useState<'match' | 'result'>('match');
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([
    { classKey: '', classNumber: '' },
    { classKey: '', classNumber: '' },
    { classKey: '', classNumber: '' },
    { classKey: '', classNumber: '' },
  ]);

  // SessionからclassCountsを取得
  useEffect(() => {
    const sessionRef = rref(rdb, 'session');
    get(sessionRef)
      .then(snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setClassCounts({
            class_A: data.class_A || 0,
            class_B: data.class_B || 0,
            class_C: data.class_C || 0,
            class_D: data.class_D || 0,
            class_E: data.class_E || 0,
            class_F: data.class_F || 0,
          });
        }
      })
      .catch(error => {
        console.error('Error fetching session data:', error);
      });
  }, []);

  // 利用可能なクラスキーを取得(値が0でないもの)
  const getAvailableClasses = (): string[] => {
    if (!classCounts) return [];
    return Object.entries(classCounts)
      .filter(([, count]) => count > 0)
      .map(([key]) => key.replace('class_', ''));
  };

  // 指定されたクラスキーの最大数を取得
  const getMaxNumberForClass = (classKey: string): number => {
    if (!classCounts || !classKey) return 0;
    return classCounts[`class_${classKey}` as keyof ClassCounts] || 0;
  };

  // classesNameを生成
  const generateClassesName = (): string[] => {
    return classGroups
      .filter(group => group.classKey && group.classNumber)
      .map(group => `${group.classKey}${group.classNumber}`);
  };

  // クラスグループの変更ハンドラ
  const handleClassKeyChange = (index: number, value: string) => {
    const newGroups = [...classGroups];
    newGroups[index] = { classKey: value, classNumber: '' };
    setClassGroups(newGroups);
  };

  const [records, setRecords] = useState<UploadRecord[]>([]);

  useEffect(() => {
    const uploadsRef = rref(rdb, 'uploads');
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
              key: `${sessionId}/${dataId}`,
              className: rec.classesName ? rec.classesName.split('_').join(',') : '',
              round: rec.round || undefined,
              uploadType: rec.uploadType || undefined,
              imagePath: imageUrl, // ← URLに変換
              thumbnailPath: thumbnailUrl, // ← サムネイルURLに変換
              status: rec.status,
              parsedAt: rec.parsedAt,
              formattedParsedAt: formattedParsedAt,
            });
          }

          // parsedAt 降順にソートして表示順を最新に
          arr.sort((a, b) => (b.parsedAt || 0) - (a.parsedAt || 0));
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
        {message && (
          <Typography align="center" color={status === 'error' ? 'error' : 'textSecondary'}>
            {message}
          </Typography>
        )}
      </Stack>

      <Stack spacing={2} sx={{ px: 2 }}>
        {records.map((rec, i) => (
          <UploadedCard key={`uc_${i}`} rec={rec} />
        ))}
      </Stack>
    </>
  );
};

export default List;
