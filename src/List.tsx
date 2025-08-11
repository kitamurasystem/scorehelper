// src/List.tsx
import React, { useEffect, useState } from 'react';
import {
  getDatabase,
  ref as dbRef,
  query,
  orderByChild,
  limitToLast,
  endAt,
  get,
  DataSnapshot,
} from 'firebase/database';
import type { Query } from 'firebase/database';
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage';
import {
  Box,
  Typography,
  Button,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Link,
} from '@mui/material';

type Rounds = { [key: string]: boolean | number };

// DB 上の生データ（Realtime Database に保存されている形）
interface DbUpload {
  sessionId?: string;
  parsedAt?: number;
  uploadedAt?: number;
  className?: string;
  playerName?: string;
  affiliation?: string;
  rounds?: Rounds;
  imagePath?: string;
}

// コンポーネント内部で扱う型
interface UploadRecord {
  sessionId: string;
  order: number;
  timestamp: number;
  className?: string;
  playerName?: string;
  affiliation?: string;
  rounds?: Rounds;
  imagePath: string;
}

interface RecordWithUrl extends UploadRecord {
  imageUrl?: string;
}

export const List: React.FC = () => {
  const [records, setRecords] = useState<RecordWithUrl[]>([]);
  const [lastKeyTime, setLastKeyTime] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 100;

  const db = getDatabase();
  const storage = getStorage();

  const buildQuery = (initial: boolean): Query | null => {
    const q: Query = query(dbRef(db, '/uploads'), orderByChild('parsedAt'));
    if (initial) {
      return query(q, limitToLast(PAGE_SIZE));
    }
    if (lastKeyTime !== null) {
      // lastKeyTime - 1 を使うロジックは元コードに倣っています
      return query(q, endAt(lastKeyTime - 1), limitToLast(PAGE_SIZE));
    }
    return null;
  };

  const loadPage = async (initial = false): Promise<void> => {
    const q = buildQuery(initial);
    if (!q) return;
    await fetchRecords(q);
  };

  const fetchRecords = async (q: Query): Promise<void> => {
    setLoadingMore(true);
    try {
      const snap = await get(q); // 一度だけ確実に取得（型安全）
      const recs: UploadRecord[] = [];

      snap.forEach((child: DataSnapshot) => {
        // snapshot.val<T>() が使える環境ならそちらを使ってください：
        // const data = child.val<DbUpload>();
        const data = child.val() as DbUpload;

        const order = parseInt(child.key ?? '0', 10);
        recs.push({
          sessionId: data.sessionId ?? '',
          order,
          timestamp: data.parsedAt ?? data.uploadedAt ?? 0,
          className: data.className,
          playerName: data.playerName,
          affiliation: data.affiliation,
          rounds: data.rounds,
          imagePath: data.imagePath ?? '',
        });

        return false; // forEach の継続条件（firebase の forEach は戻り値で停止制御）
      });

      if (recs.length > 0) {
        recs.sort((a, b) => b.timestamp - a.timestamp); // 新しい順
        setLastKeyTime(recs[recs.length - 1].timestamp);
      }

      const withUrl: RecordWithUrl[] = await Promise.all(
        recs.map(async r => {
          if (!r.imagePath) return { ...r, imageUrl: '' };
          try {
            const url = await getDownloadURL(storageRef(storage, r.imagePath));
            return { ...r, imageUrl: url };
          } catch {
            // 取得失敗時は空文字にしておく（権限切れ等）
            return { ...r, imageUrl: '' };
          }
        })
      );

      // 重複防止（既存のキーと被るものは追加しない）
      setRecords(prev => {
        const exist = new Set(prev.map(p => `${p.sessionId}-${p.order}`));
        const filtered = withUrl.filter(w => !exist.has(`${w.sessionId}-${w.order}`));
        return [...prev, ...filtered];
      });
    } catch (err) {
      console.error('fetchRecords error:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    // 初回は initial = true で読み込み
    loadPage(true);
    // /*eslint-disable-next-line react-hooks/exhaustive-deps*/
  }, []); // 初回のみ

  return (
    <Box mt={2} mx={1}>
      <Typography variant="h5" gutterBottom>
        解析結果一覧（最新 {PAGE_SIZE} 件ずつ）
      </Typography>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>時刻 (最新優先)</TableCell>
              <TableCell>枚数</TableCell>
              <TableCell>クラス</TableCell>
              <TableCell>選手名</TableCell>
              <TableCell>
                所属
                <br />
                (会・学校)
              </TableCell>
              <TableCell>結果 / 点数</TableCell>
              <TableCell>画像</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {records.map((r, idx) => {
              const d = new Date(r.timestamp);
              const hh = `${d.getHours()}`.padStart(2, '0');
              const mm = `${d.getMinutes()}`.padStart(2, '0');
              const roundsStr = r.rounds
                ? Object.entries(r.rounds)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(', ')
                : '-';
              return (
                <TableRow key={`${r.sessionId}-${r.order}-${idx}`}>
                  <TableCell>{`${hh}:${mm}`}</TableCell>
                  <TableCell>{r.order}</TableCell>
                  <TableCell>{r.className ?? '-'}</TableCell>
                  <TableCell>{r.playerName ?? '-'}</TableCell>
                  <TableCell>{r.affiliation ?? '-'}</TableCell>
                  <TableCell>{roundsStr}</TableCell>
                  <TableCell>
                    {r.imageUrl ? (
                      <Link href={r.imageUrl} target="_blank" rel="noopener">
                        表示
                      </Link>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                </TableRow>
              );
            })}

            {records.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography align="center">解析済のレコードがありません</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!loadingMore && records.length >= PAGE_SIZE && (
        <Box textAlign="center" mt={2}>
          <Button onClick={() => loadPage(false)}>さらに古い一覧を読み込む</Button>
        </Box>
      )}
    </Box>
  );
};

export default List;
