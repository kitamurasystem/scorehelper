import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
// src/List.tsx
import React, { useEffect, useState } from 'react';
import { getDatabase, ref as dbRef, query, orderByChild, limitToLast, endAt, get, DataSnapshot, } from 'firebase/database';
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage';
import { Box, Typography, Button, Table, TableContainer, TableHead, TableRow, TableCell, TableBody, Paper, Link, } from '@mui/material';
export const List = () => {
    const [records, setRecords] = useState([]);
    const [lastKeyTime, setLastKeyTime] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const PAGE_SIZE = 100;
    const db = getDatabase();
    const storage = getStorage();
    const buildQuery = (initial) => {
        const q = query(dbRef(db, '/uploads'), orderByChild('parsedAt'));
        if (initial) {
            return query(q, limitToLast(PAGE_SIZE));
        }
        if (lastKeyTime !== null) {
            // lastKeyTime - 1 を使うロジックは元コードに倣っています
            return query(q, endAt(lastKeyTime - 1), limitToLast(PAGE_SIZE));
        }
        return null;
    };
    const loadPage = async (initial = false) => {
        const q = buildQuery(initial);
        if (!q)
            return;
        await fetchRecords(q);
    };
    const fetchRecords = async (q) => {
        setLoadingMore(true);
        try {
            const snap = await get(q); // 一度だけ確実に取得（型安全）
            const recs = [];
            snap.forEach((child) => {
                // snapshot.val<T>() が使える環境ならそちらを使ってください：
                // const data = child.val<DbUpload>();
                const data = child.val();
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
            const withUrl = await Promise.all(recs.map(async (r) => {
                if (!r.imagePath)
                    return { ...r, imageUrl: '' };
                try {
                    const url = await getDownloadURL(storageRef(storage, r.imagePath));
                    return { ...r, imageUrl: url };
                }
                catch {
                    // 取得失敗時は空文字にしておく（権限切れ等）
                    return { ...r, imageUrl: '' };
                }
            }));
            // 重複防止（既存のキーと被るものは追加しない）
            setRecords(prev => {
                const exist = new Set(prev.map(p => `${p.sessionId}-${p.order}`));
                const filtered = withUrl.filter(w => !exist.has(`${w.sessionId}-${w.order}`));
                return [...prev, ...filtered];
            });
        }
        catch (err) {
            console.error('fetchRecords error:', err);
        }
        finally {
            setLoadingMore(false);
        }
    };
    useEffect(() => {
        // 初回は initial = true で読み込み
        loadPage(true);
        // /*eslint-disable-next-line react-hooks/exhaustive-deps*/
    }, []); // 初回のみ
    return (_jsxs(Box, { mt: 2, mx: 1, children: [_jsxs(Typography, { variant: "h5", gutterBottom: true, children: ["\u89E3\u6790\u7D50\u679C\u4E00\u89A7\uFF08\u6700\u65B0 ", PAGE_SIZE, " \u4EF6\u305A\u3064\uFF09"] }), _jsx(TableContainer, { component: Paper, children: _jsxs(Table, { size: "small", children: [_jsx(TableHead, { children: _jsxs(TableRow, { children: [_jsx(TableCell, { children: "\u6642\u523B (\u6700\u65B0\u512A\u5148)" }), _jsx(TableCell, { children: "\u679A\u6570" }), _jsx(TableCell, { children: "\u30AF\u30E9\u30B9" }), _jsx(TableCell, { children: "\u9078\u624B\u540D" }), _jsxs(TableCell, { children: ["\u6240\u5C5E", _jsx("br", {}), "(\u4F1A\u30FB\u5B66\u6821)"] }), _jsx(TableCell, { children: "\u7D50\u679C / \u70B9\u6570" }), _jsx(TableCell, { children: "\u753B\u50CF" })] }) }), _jsxs(TableBody, { children: [records.map((r, idx) => {
                                    const d = new Date(r.timestamp);
                                    const hh = `${d.getHours()}`.padStart(2, '0');
                                    const mm = `${d.getMinutes()}`.padStart(2, '0');
                                    const roundsStr = r.rounds
                                        ? Object.entries(r.rounds)
                                            .map(([k, v]) => `${k}:${v}`)
                                            .join(', ')
                                        : '-';
                                    return (_jsxs(TableRow, { children: [_jsx(TableCell, { children: `${hh}:${mm}` }), _jsx(TableCell, { children: r.order }), _jsx(TableCell, { children: r.className ?? '-' }), _jsx(TableCell, { children: r.playerName ?? '-' }), _jsx(TableCell, { children: r.affiliation ?? '-' }), _jsx(TableCell, { children: roundsStr }), _jsx(TableCell, { children: r.imageUrl ? (_jsx(Link, { href: r.imageUrl, target: "_blank", rel: "noopener", children: "\u8868\u793A" })) : ('-') })] }, `${r.sessionId}-${r.order}-${idx}`));
                                }), records.length === 0 && (_jsx(TableRow, { children: _jsx(TableCell, { colSpan: 7, children: _jsx(Typography, { align: "center", children: "\u89E3\u6790\u6E08\u306E\u30EC\u30B3\u30FC\u30C9\u304C\u3042\u308A\u307E\u305B\u3093" }) }) }))] })] }) }), !loadingMore && records.length >= PAGE_SIZE && (_jsx(Box, { textAlign: "center", mt: 2, children: _jsx(Button, { onClick: () => loadPage(false), children: "\u3055\u3089\u306B\u53E4\u3044\u4E00\u89A7\u3092\u8AAD\u307F\u8FBC\u3080" }) }))] }));
};
export default List;
