// src/CardUploader.tsx (Updated with localStorage)
import { useEffect, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  LinearProgress,
  Avatar,
  Select,
  MenuItem,
  FormControl,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { storage, rdb } from './firebase';
import { getDownloadURL, ref as sref, uploadBytesResumable } from 'firebase/storage';
import { limitToLast, onValue, orderByChild, query, ref as rref, get } from 'firebase/database';

// interface 定義
interface UploadRecord {
  uid: string;
  key: string;
  fullText?: string;
  imagePath: string;
  thumbnailPath?: string;
  status: string;
  parsedAt?: number;
}

interface UploadRecordRaw {
  uid: string;
  fullText?: string;
  lines?: string[];
  imagePath: string;
  thumbnailPath?: string;
  status: string;
  parsedAt?: number;
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

const CardUploader: React.FC<CuProps> = ({ sessionId }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [classCounts, setClassCounts] = useState<ClassCounts | null>(null);
  const [round, setRound] = useState<number>(1);
  const [uploadType, setUploadType] = useState<'match' | 'result'>('match');
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([
    { classKey: '', classNumber: '' },
    { classKey: '', classNumber: '' },
    { classKey: '', classNumber: '' },
    { classKey: '', classNumber: '' },
  ]);

  // localStorageから設定を復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const settings: UploadSettings = JSON.parse(saved);
        setClassGroups(settings.classGroups);
        setRound(settings.round);
        setUploadType(settings.uploadType);
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
    }
  }, []);

  // 設定が変更されたらlocalStorageに保存
  useEffect(() => {
    try {
      const settings: UploadSettings = {
        classGroups,
        round,
        uploadType,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }, [classGroups, round, uploadType]);

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
  const generateClassesName = (): string => {
    return classGroups
      .filter(group => group.classKey && group.classNumber)
      .map(group => `${group.classKey}${group.classNumber}`)
      .join('_');
  };

  // クラスグループの変更ハンドラ
  const handleClassKeyChange = (index: number, value: string) => {
    const newGroups = [...classGroups];
    newGroups[index] = { classKey: value, classNumber: '' };
    setClassGroups(newGroups);
  };

  const handleClassNumberChange = (index: number, value: string) => {
    const newGroups = [...classGroups];
    newGroups[index] = { ...newGroups[index], classNumber: value };
    setClassGroups(newGroups);
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      setMessage('ファイルが選択されていません。');
      setFiles([]);
      return;
    }
    const arr = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    setFiles(arr);
    setStatus('idle');
    setMessage(`${arr.length} 個の画像を選択しました。`);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => e.preventDefault();
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files);

  const uploadAll = () => {
    if (files.length === 0) {
      setStatus('error');
      setMessage('アップロードする画像がありません。');
      return;
    }

    const classesName = generateClassesName();
    if (!classesName) {
      setStatus('error');
      setMessage('少なくとも1つのクラスグループを選択してください。');
      return;
    }

    setStatus('processing');
    setMessage('アップロード中…');
    setProgress(0);

    const uploadPromises = files.map((file, i) => {
      //仮フォルダにup
      const path = `temp/${Date.now()}_${i}_${file.name}`;
      const storageRef = sref(storage, path);

      // カスタムメタデータを設定(sessionId、classesName、round、uploadTypeを動的に使用)
      const metadata = {
        contentType: file.type,
        customMetadata: {
          sessionId: sessionId,
          classesName: classesName,
          round: round.toString(),
          uploadType: uploadType,
        },
      };

      const task = uploadBytesResumable(storageRef, file, metadata);

      return new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snapshot => {
            const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setProgress(prev => Math.max(prev, prog));
          },
          error => {
            reject(error);
          },
          () => {
            resolve();
          }
        );
      });
    });

    Promise.all(uploadPromises)
      .then(() => {
        setStatus('success');
        setMessage('アップロード成功しました。');
        setFiles([]);
      })
      .catch(err => {
        console.error(err);
        setStatus('error');
        setMessage(`エラー: ${err.message}`);
      });
  };

  const [records, setRecords] = useState<UploadRecord[]>([]);

  useEffect(() => {
    const uploadsRef = rref(rdb, `uploads/${sessionId}`);
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
            arr.push({
              uid: rec.uid || '',
              key: `${sessionId}/${dataId}`,
              fullText: rec.fullText || rec.lines?.join('\n'),
              imagePath: imageUrl, // ← URLに変換
              thumbnailPath: thumbnailUrl, // ← サムネイルURLに変換
              status: rec.status,
              parsedAt: rec.parsedAt,
            });
          }

          // parsedAt 降順にソートして表示順を最新に
          arr.sort((a, b) => (a.parsedAt || 0) - (b.parsedAt || 0));
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

  const availableClasses = getAvailableClasses();

  return (
    <>
      <Stack spacing={3} sx={{ maxWidth: 700, mx: 'auto', mt: 4, p: 2 }}>
        <Typography variant="h4" color="primary" align="center">
          画像アップロード
        </Typography>

        <Paper
          elevation={3}
          variant="outlined"
          sx={{
            p: 4,
            textAlign: 'center',
            bgcolor: status === 'processing' ? 'grey.200' : 'background.paper',
            cursor: 'pointer',
            border: '2px dashed',
            borderColor: status === 'processing' ? 'grey.400' : 'primary.main',
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept="image/*"
            multiple
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />
          <Typography variant="body1" color="textSecondary">
            クリックして画像を選択
          </Typography>
        </Paper>

        <Typography
          align="center"
          color={
            status === 'error' ? 'error' : status === 'success' ? 'success.main' : 'textSecondary'
          }
        >
          {message}
        </Typography>

        {status === 'processing' && <LinearProgress variant="determinate" value={progress} />}

        {files.length > 0 && (
          <Stack spacing={2}>
            {/* クラスグループ選択 */}
            <Paper elevation={2} sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                クラス選択
              </Typography>
              <Typography variant="body2">
                含まれるクラスが4つ以上となる場合は、分けてアップロードしてください。
              </Typography>
              <Grid container spacing={2}>
                {classGroups.map((group, index) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={index}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <FormControl size="small" sx={{ minWidth: 80 }}>
                        <Select
                          value={group.classKey}
                          onChange={e => handleClassKeyChange(index, e.target.value)}
                          displayEmpty
                        >
                          <MenuItem value="">
                            <em>-</em>
                          </MenuItem>
                          {availableClasses.map(cls => (
                            <MenuItem key={cls} value={cls}>
                              {cls}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControl size="small" sx={{ minWidth: 80 }} disabled={!group.classKey}>
                        <Select
                          value={group.classNumber}
                          onChange={e => handleClassNumberChange(index, e.target.value)}
                          displayEmpty
                        >
                          <MenuItem value="">
                            <em>-</em>
                          </MenuItem>
                          {Array.from(
                            { length: getMaxNumberForClass(group.classKey) },
                            (_, i) => i + 1
                          ).map(num => (
                            <MenuItem key={num} value={num.toString()}>
                              {num}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Paper>

            {/* 回戦選択 */}
            <Paper elevation={2} sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                回戦
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <Select value={round} onChange={e => setRound(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6, 7].map(num => (
                      <MenuItem key={num} value={num}>
                        {num}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography>回戦</Typography>
              </Box>
            </Paper>

            {/* タイプ選択 */}
            <Paper elevation={2} sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                タイプ
              </Typography>
              <ToggleButtonGroup
                color="primary"
                value={uploadType}
                exclusive
                onChange={(_, newValue) => {
                  if (newValue !== null) {
                    setUploadType(newValue);
                  }
                }}
                aria-label="upload type"
                size="small"
              >
                <ToggleButton value="match" aria-label="組み合わせ">
                  組み合わせ
                </ToggleButton>
                <ToggleButton value="result" aria-label="結果(負け)">
                  結果(負け)
                </ToggleButton>
              </ToggleButtonGroup>
            </Paper>

            {/* ファイル一覧 */}
            {files.map((file, i) => (
              <Box key={i} display="flex" alignItems="center">
                <Box
                  component="img"
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  sx={{
                    width: 60,
                    height: 60,
                    objectFit: 'contain',
                    border: 1,
                    borderColor: 'grey.300',
                    borderRadius: 1,
                    mr: 2,
                  }}
                />
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                  {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </Typography>
              </Box>
            ))}
            <Button
              variant="contained"
              color="primary"
              onClick={uploadAll}
              disabled={status === 'processing'}
            >
              一括アップロード
            </Button>
          </Stack>
        )}
      </Stack>

      <Typography variant="h5" sx={{ mt: 4, px: 2 }}>
        解析結果一覧(最新10件)
      </Typography>
      <Stack spacing={2} sx={{ px: 2 }}>
        {records.map(rec => (
          <Box
            key={rec.key || Math.random()}
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
                typeof rec.thumbnailPath === 'string' && rec.thumbnailPath
                  ? rec.thumbnailPath
                  : undefined
              }
              alt="thumbnail"
              sx={{ width: 240, mr: 2 }}
            />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {rec.status || '待機中'}
              </Typography>
              <Box sx={{ height: '150px', overflow: 'auto', mt: 1 }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  <small>{rec.fullText}</small>
                </Typography>
              </Box>
            </Box>
          </Box>
        ))}
      </Stack>
    </>
  );
};

export default CardUploader;
