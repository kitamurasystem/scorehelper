// src/CardUploader.tsx (Updated)
import { useEffect, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
} from '@mui/material';
import { storage, rdb } from './firebase';
import { ref as sref, uploadBytesResumable } from 'firebase/storage';
import { ref as rref, serverTimestamp, update, runTransaction, set } from 'firebase/database';
import { useContext } from 'react';
import { ContextUserAccount } from './App';
import UploadedCard from './parts/UploadedCard';
import type { ClassCounts, UploadRecord } from './types/Basic';
import { ContextAllRecords, ContextSessionData } from './Home';

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

const CardUploader: React.FC = () => {
  const { userAccount } = useContext(ContextUserAccount);
  const { sessionData } = useContext(ContextSessionData);
  const { allRecords } = useContext(ContextAllRecords);
  const [recentRecords, setRecentRecords] = useState<UploadRecord[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'error'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [classCounts, setClassCounts] = useState<ClassCounts | null>(null);
  const [round, setRound] = useState<number>(1);
  const [uploadType, setUploadType] = useState<'match' | 'result'>('match');
  const [cmt, setCmt] = useState<string>('');
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([
    { classKey: '', classNumber: '' },
    { classKey: '', classNumber: '' },
    { classKey: '', classNumber: '' },
    { classKey: '', classNumber: '' },
  ]);

  const [availableClasses, setAvailableClasses] = useState<string[]>([]);

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
    const cc = {
      class_A: sessionData.class_A || 0,
      class_B: sessionData.class_B || 0,
      class_C: sessionData.class_C || 0,
      class_D: sessionData.class_D || 0,
      class_E: sessionData.class_E || 0,
      class_F: sessionData.class_F || 0,
    };
    setClassCounts(cc);
    if (!cc.class_A && !cc.class_B && !cc.class_C && !cc.class_D && !cc.class_E && !cc.class_F) {
      setAvailableClasses([]);
    } else {
      const ac = Object.entries(cc)
        .filter(([, count]) => count > 0)
        .map(([key]) => key.replace('class_', ''));
      setAvailableClasses(ac);
    }
  }, [sessionData]);

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

  // ファイル削除用のハンドラを追加
  const handleRemoveFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    if (newFiles.length === 0) {
      setMessage('');
    } else {
      setMessage(`${newFiles.length} 個の画像を選択しました。`);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => e.preventDefault();
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files);

  const handleCmtChange = (value: string) => {
    if (value.length > 100) {
      setMessage('コメントは100文字以内で入力してください。');
    } else {
      setCmt(value);
    }
  };
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
    setMessage('');
    setProgress(0);

    const uploadPromises = files.map(async (file, i) => {
      // 1. 次のIDを取得してDBレコード作成
      const nextId = await getNextId();
      const recordId = nextId.toString();

      const dbRef = rref(rdb, `uploads/${recordId}`);
      const uploadRec = {
        uid: userAccount?.uid || 'anonymous',
        classesName: classesName,
        round: round,
        status: 'uploading',
        cmt: cmt,
        uploadType: uploadType,
        createdAt: serverTimestamp(),
      };
      //console.log('Creating DB record:', uploadRec);
      await set(dbRef, uploadRec);

      // 2. 仮フォルダにアップロード
      const path = `temp/${Date.now()}_${i}_${file.name}`;
      const storageRef = sref(storage, path);
      console.log('Uploading file to path:', path);

      // カスタムメタデータを設定(recordIdを追加)
      const metadata = {
        contentType: file.type,
        customMetadata: {
          recordId: recordId || '',
          sessionId: sessionData.id,
          classesName: classesName,
          round: round.toString(),
          uploadType: uploadType,
          uid: userAccount?.uid || 'anonymous',
        },
      };

      const task = uploadBytesResumable(storageRef, file, metadata);
      console.log('Upload task started for file:', file.name);

      return new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snapshot => {
            const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setProgress(prev => Math.max(prev, prog));
          },
          async error => {
            // アップロード失敗時はDBをerrorに更新
            if (recordId) {
              await update(rref(rdb, `uploads/${recordId}`), {
                status: 'error',
                errorMessage: 'Upload failed',
                updatedAt: serverTimestamp(),
              });
            }
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
        setStatus('idle');
        setMessage('');
        setFiles([]);
      })
      .catch(err => {
        console.error(err);
        setStatus('error');
        setMessage(`エラー: ${err.message}`);
      });
  };

  // 次のIDを取得する関数
  const getNextId = async (): Promise<number> => {
    const counterRef = rref(rdb, 'uploadCounter');

    const result = await runTransaction(counterRef, currentValue => {
      return (currentValue || 0) + 1;
    });

    return result.snapshot.val();
  };

  useEffect(() => {
    // 最近のアップロード10件を抽出
    const recent = allRecords.slice(0, 20);
    setRecentRecords(recent);
  }, [allRecords]);

  return (
    <>
      <Stack spacing={3} sx={{ maxWidth: 900, mx: 'auto', mt: 4, p: 2 }}>
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

        {message && (
          <Typography align="center" color={status === 'error' ? 'error' : 'textSecondary'}>
            {message}
          </Typography>
        )}

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
              <hr />
              {/* 回戦選択 */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
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

                {/* タイプ選択 */}
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
              </Box>
              <TextField
                fullWidth
                sx={{ mt: 2 }}
                value={cmt}
                label="コメント（100文字以内）"
                variant="outlined"
                onChange={e => handleCmtChange(e.target.value)}
              />
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
                <Typography variant="body2" sx={{ wordBreak: 'break-all', flex: 1 }}>
                  {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </Typography>
                <Button
                  onClick={() => handleRemoveFile(i)}
                  sx={{
                    minWidth: 'auto',
                    width: 32,
                    height: 32,
                    p: 0,
                    color: 'error.main',
                    '&:hover': { bgcolor: 'error.light', color: 'white' },
                  }}
                >
                  ✕
                </Button>
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

      <Typography variant="h5" sx={{ mt: 4, mb: 2, px: 2 }}>
        解析結果一覧(最新20件)
      </Typography>
      <Stack spacing={3} sx={{ maxWidth: 900, mx: 'auto', p: 1 }}>
        {recentRecords.map((rec, i) => (
          <UploadedCard key={`uc_${i}`} rec={rec} />
        ))}
      </Stack>
    </>
  );
};

export default CardUploader;
