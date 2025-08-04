// src/List.tsx
import React, { useEffect, useState } from "react";
import {
  getDatabase,
  ref as dbRef,
  query,
  orderByChild,
  limitToLast,
  endAt,
//   onChildAdded,
//   DataSnapshot,
} from "firebase/database";
import { getStorage, ref as storageRef, getDownloadURL } from "firebase/storage";
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
} from "@mui/material";

interface UploadRecord {
  sessionId: string;
  order: number;
  timestamp: number;
  className?: string;
  playerName?: string;
  affiliation?: string;
  rounds?: { [key: string]: boolean | number };
  imagePath: string;
}

interface RecordWithUrl extends UploadRecord {
  imageUrl?: string;
}

const List:React.FC = () => {
  const [records, setRecords] = useState<RecordWithUrl[]>([]);
  const [lastKeyTime, setLastKeyTime] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 100;

  const db = getDatabase();
  const storage = getStorage();

  const loadPage = async (initial = false) => {
    let q = query(
      dbRef(db, "/uploads"),
      orderByChild("parsedAt")
    );

    if (initial) {
      q = query(q, limitToLast(PAGE_SIZE));
    } else if (lastKeyTime !== null) {
      q = query(q, endAt(lastKeyTime - 1), limitToLast(PAGE_SIZE));
    } else {
      return;
    }

    //const fetched: DataSnapshot[] = [];
    // onChildAdded で順次取得しやすいため使用
    reduced();
  };

  // Use onChildAdded to chunk record acquisition in Firestore queries
  // Because Realtime Database yields individual child events as limit applies. :contentReference[oaicite:6]{index=6}

  //const loadInitial = () => loadPage(true);

  useEffect(() => {
    loadPage(true);
  }, []);

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
                所属<br />(会・学校)
              </TableCell>
              <TableCell>結果 / 点数</TableCell>
              <TableCell>画像</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {records.map((r, idx) => {
              const d = new Date(r.timestamp);
              const hh = `${d.getHours()}`.padStart(2, "0");
              const mm = `${d.getMinutes()}`.padStart(2, "0");
              const roundsStr = r.rounds
                ? Object.entries(r.rounds)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(", ")
                : "-";
              return (
                <TableRow key={`${r.sessionId}-${r.order}-${idx}`}>
                  <TableCell>
                    {`${hh}:${mm}`}
                  </TableCell>
                  <TableCell>{r.order}</TableCell>
                  <TableCell>{r.className ?? "-"}</TableCell>
                  <TableCell>{r.playerName ?? "-"}</TableCell>
                  <TableCell>{r.affiliation ?? "-"}</TableCell>
                  <TableCell>{roundsStr}</TableCell>
                  <TableCell>
                    {r.imageUrl ? (
                      <Link
                        href={r.imageUrl}
                        target="_blank"
                        rel="noopener"
                      >
                        表示
                      </Link>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {records.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography align="center">
                    解析済のレコードがありません
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {(!loadingMore && records.length === PAGE_SIZE) && (
        <Box textAlign="center" mt={2}>
          <Button onClick={() => loadPage(false)}>
            さらに古い一覧を読み込む
          </Button>
        </Box>
      )}
    </Box>
  );

  async function reduced() {
    setLoadingMore(true);
    const recs: UploadRecord[] = [];

    await new Promise<void>((res/*, rej*/) => {
    //   const qChild = query(
    //     dbRef(db, "/uploads"),
    //     orderByChild("parsedAt"),
    //     PAGE_SIZE === records.length
    //       ? endAt(lastKeyTime! - 1)
    //       : limitToLast(PAGE_SIZE)
    //   );

    //   const listener = onChildAdded(
    //     qChild,
    //     (snap) => {
    //       const data: any = snap.val();
    //       const order = parseInt(snap.key || "0", 10);
    //       const rec: UploadRecord = {
    //         sessionId: data.sessionId,
    //         order,
    //         timestamp: data.parsedAt ?? data.uploadedAt ?? 0,
    //         className: data.className,
    //         playerName: data.playerName,
    //         affiliation: data.affiliation,
    //         rounds: data.rounds,
    //         imagePath: data.imagePath,
    //       };
    //       recs.push(rec);
    //     },
    //     (err) => {
    //       console.error("読み込みエラー:", err);
    //       rej(err);
    //     },
    //     {
    //       onlyOnce: true
    //     }
    //   );

      // 時間差がなくても即 resolve
      setTimeout(() => {
        res();
      }, 250);
    });

    if (recs.length > 0) {
      recs.sort((a, b) => {
        return b.timestamp - a.timestamp;
      });
      const lastRecItem = recs[recs.length - 1];
      setLastKeyTime(lastRecItem.timestamp);
    }

    const withUrl = await Promise.all(
      recs.map(async (r) => ({
        ...r,
        imageUrl: await getDownloadURL(
          storageRef(storage, r.imagePath)
        ).catch(() => "")
      }))
    );
    setRecords((prev) => [...prev, ...withUrl]);
    setLoadingMore(false);
  }
};

export default List;