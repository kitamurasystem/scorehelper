// src/List.tsx
import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  FormControl,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Paper,
  CircularProgress,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { storage, rdb } from './firebase';
import { getDownloadURL, ref as sref } from 'firebase/storage';
import { onValue, ref as rref, get } from 'firebase/database';
import UploadedCard from './parts/UploadedCard';
import type { UploadRecord } from './CardUploader';

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

interface ListProps {
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

const List: React.FC<ListProps> = ({ sessionId }) => {
  const [allRecords, setAllRecords] = useState<UploadRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<UploadRecord[]>([]);
  const [displayedRecords, setDisplayedRecords] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // フィルター条件
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedRound, setSelectedRound] = useState<number | ''>('');
  const [selectedType, setSelectedType] = useState<'match' | 'result' | ''>('');

  const [availableClasses, setAvailableClasses] = useState<string[]>([]);

  // Sessionからクラス情報を取得
  useEffect(() => {
    const sessionRef = rref(rdb, 'session');
    get(sessionRef)
      .then(snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const counts: ClassCounts = {
            class_A: data.class_A || 0,
            class_B: data.class_B || 0,
            class_C: data.class_C || 0,
            class_D: data.class_D || 0,
            class_E: data.class_E || 0,
            class_F: data.class_F || 0,
          };

          // 利用可能なクラスを抽出
          const classes = Object.entries(counts)
            .filter(([, count]) => count > 0)
            .map(([key]) => key.replace('class_', ''));
          setAvailableClasses(classes);
        }
      })
      .catch(error => {
        console.error('Error fetching session data:', error);
      });
  }, []);

  // 全レコードを取得
  useEffect(() => {
    const uploadsRef = rref(rdb, 'uploads');

    const unsubscribe = onValue(
      uploadsRef,
      async snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const arr: UploadRecord[] = [];

          for (const [dataId, rec] of Object.entries(data) as [string, UploadRecordRaw][]) {
            let imageUrl = '';
            if (rec.imagePath) {
              try {
                imageUrl = await getDownloadURL(sref(storage, rec.imagePath));
              } catch (e) {
                console.error('getDownloadURL error for path:', rec.imagePath, e);
              }
            }

            let thumbnailUrl = '';
            if (rec.status === 'completed' && rec.thumbnailPath) {
              try {
                thumbnailUrl = await getDownloadURL(sref(storage, rec.thumbnailPath));
              } catch (e) {
                console.error('getDownloadURL error for thumbnail path:', rec.thumbnailPath, e);
              }
            }

            arr.push({
              uid: rec.uid || '',
              key: `${sessionId}/${dataId}`,
              className: rec.classesName ? rec.classesName.split('_').join(',') : '',
              round: rec.round || undefined,
              uploadType: rec.uploadType || undefined,
              imagePath: imageUrl,
              thumbnailPath: thumbnailUrl,
              status: rec.status,
              parsedAt: rec.parsedAt,
            });
          }

          // parsedAtで降順ソート
          arr.sort((a, b) => (b.parsedAt || 0) - (a.parsedAt || 0));
          setAllRecords(arr);
          setLoading(false);
        } else {
          setAllRecords([]);
          setLoading(false);
        }
      },
      error => {
        console.error('onValue error', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [sessionId]);

  // フィルタリング処理
  useEffect(() => {
    let filtered = [...allRecords];

    if (selectedClass) {
      filtered = filtered.filter(
        rec => rec.className && rec.className.split(',').some(cls => cls.startsWith(selectedClass))
      );
    }

    if (selectedRound !== '') {
      filtered = filtered.filter(rec => rec.round === selectedRound);
    }

    if (selectedType) {
      filtered = filtered.filter(rec => rec.uploadType === selectedType);
    }

    setFilteredRecords(filtered);
    setDisplayedRecords(filtered.slice(0, 20));
  }, [allRecords, selectedClass, selectedRound, selectedType]);

  // 一括ダウンロード
  const handleBulkDownload = async () => {
    if (filteredRecords.length === 0) return;

    setDownloading(true);
    try {
      for (const rec of filteredRecords) {
        if (!rec.imagePath || rec.status !== 'completed') continue;

        const storageRef = sref(storage, rec.imagePath);
        const url = await getDownloadURL(storageRef);
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;

        const filename = `${rec.className}_${rec.round}回戦_${rec.uploadType === 'match' ? '組合せ' : '結果'}.jpg`;
        link.download = filename;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);

        // ダウンロード間隔を設ける
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('一括ダウンロードに失敗しました:', error);
    } finally {
      setDownloading(false);
    }
  };

  const canBulkDownload =
    selectedClass && selectedRound !== '' && selectedType && filteredRecords.length > 0;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 900, mx: 'auto', p: 1 }}>
      {/* フィルター */}
      <Paper elevation={3} sx={{ p: 3, mt: 1 }}>
        <Typography variant="h6" gutterBottom>
          絞り込み条件
        </Typography>
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* クラス選択 */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                displayEmpty
              >
                <MenuItem value="">全クラス</MenuItem>
                {availableClasses.map(cls => (
                  <MenuItem key={cls} value={cls}>
                    {cls}級
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* 回戦選択 */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={selectedRound}
                onChange={e => setSelectedRound(e.target.value || '')}
                displayEmpty
              >
                <MenuItem value="">全回戦</MenuItem>
                {[1, 2, 3, 4, 5, 6, 7].map(num => (
                  <MenuItem key={num} value={num}>
                    {num}回戦
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* タイプ選択 */}
            <ToggleButtonGroup
              color="primary"
              value={selectedType}
              exclusive
              onChange={(_, newValue) => setSelectedType(newValue || '')}
              size="small"
            >
              <ToggleButton value="">全て</ToggleButton>
              <ToggleButton value="match">組合せ</ToggleButton>
              <ToggleButton value="result">結果</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Typography variant="body2" color="text.secondary">
            {filteredRecords.length}件のレコードが見つかりました
            {displayedRecords.length < filteredRecords.length &&
              ` (${displayedRecords.length}件を表示中)`}
          </Typography>

          {/* 一括ダウンロードボタン */}
          {canBulkDownload && (
            <Button
              variant="contained"
              color="success"
              startIcon={<DownloadIcon />}
              onClick={handleBulkDownload}
              disabled={downloading}
            >
              {downloading
                ? 'ダウンロード中...'
                : `全${filteredRecords.length}件を一括ダウンロード`}
            </Button>
          )}
        </Stack>
      </Paper>

      {/* レコード一覧 */}
      <Stack spacing={2}>
        {displayedRecords.length === 0 ? (
          <Typography align="center" color="text.secondary">
            該当するレコードがありません
          </Typography>
        ) : (
          displayedRecords.map((rec, i) => <UploadedCard key={`uc_${i}`} rec={rec} />)
        )}
      </Stack>
    </Stack>
  );
};

export default List;
