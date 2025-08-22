import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// src/Home.tsx
import { useEffect, useState } from 'react';
import { Box, Typography, Button, Paper, Stack, LinearProgress, Avatar, } from '@mui/material';
import { storage, rdb } from './firebase';
import { getDownloadURL, ref, ref as sref, uploadBytesResumable } from 'firebase/storage';
import { limitToLast, onValue, orderByChild, query, ref as rref } from 'firebase/database';
const Home = () => {
    const [files, setFiles] = useState([]);
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState('idle');
    const [progress, setProgress] = useState(0);
    // const { userAccount } = useContext(ContextUserAccount);
    const handleFiles = (fileList) => {
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
    const handleDrop = (e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
    };
    const handleDragOver = (e) => e.preventDefault();
    const handleInputChange = (e) => handleFiles(e.target.files);
    const uploadAll = () => {
        if (files.length === 0) {
            setStatus('error');
            setMessage('アップロードする画像がありません。');
            return;
        }
        setStatus('processing');
        setMessage('アップロード中…');
        setProgress(0);
        const uploadPromises = files.map((file, index) => {
            const path = `uploads/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, path);
            // カスタムメタデータを設定（index やセッションID は適宜設定）
            const metadata = {
                contentType: file.type,
                customMetadata: {
                    sessionId: 'test20250822', // 実際は動的に
                    order: String(index + 1)
                }
            };
            const task = uploadBytesResumable(storageRef, file, metadata);
            return new Promise((resolve, reject) => {
                task.on('state_changed', snapshot => {
                    const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setProgress(prev => Math.max(prev, prog));
                }, error => {
                    reject(error);
                }, () => {
                    resolve();
                });
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
            setMessage(`エラー：${err.message}`);
        });
    };
    const [records, setRecords] = useState([]);
    useEffect(() => {
        const uploadsRef = rref(rdb, 'uploads/20250821_sample');
        const q = query(uploadsRef, orderByChild('parsedAt'), limitToLast(10));
        return onValue(q, async (snapshot) => {
            const data = snapshot.val() || {};
            console.log(data);
            const arr = [];
            for (const [order, rec] of Object.entries(data)) {
                const imagePath = rec[order].imagePath;
                let imageUrl = "";
                if (imagePath) {
                    try {
                        imageUrl = await getDownloadURL(sref(storage, imagePath));
                    }
                    catch (e) {
                        console.error("getDownloadURL error", e);
                    }
                }
                arr.push({
                    uid: rec[order].uid || "",
                    key: `test20250822/${order}`,
                    fullText: rec[order].fullText || rec[order].lines?.join("\n"),
                    imagePath: imageUrl, // ← URLに変換
                    status: rec[order].status,
                    parsedAt: rec[order].parsedAt,
                });
            }
            // parsedAt 降順にソートして表示順を最新に
            arr.sort((a, b) => (b.parsedAt || 0) - (a.parsedAt || 0));
            setRecords(arr);
        });
    }, []);
    return (_jsxs(_Fragment, { children: [_jsxs(Stack, { spacing: 3, sx: { maxWidth: 700, mx: 'auto', mt: 4, p: 2 }, children: [_jsx(Typography, { variant: "h4", color: "primary", align: "center", children: "\u753B\u50CF\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9" }), _jsxs(Paper, { elevation: 3, variant: "outlined", sx: {
                            p: 4,
                            textAlign: 'center',
                            bgcolor: status === 'processing' ? 'grey.200' : 'background.paper',
                            cursor: 'pointer',
                            border: '2px dashed',
                            borderColor: status === 'processing' ? 'grey.400' : 'primary.main'
                        }, onDrop: handleDrop, onDragOver: handleDragOver, onClick: () => document.getElementById('file-input')?.click(), children: [_jsx("input", { id: "file-input", type: "file", accept: "image/*", multiple: true, onChange: handleInputChange, style: { display: 'none' } }), _jsx(Typography, { variant: "body1", color: "textSecondary", children: "\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u753B\u50CF\u3092\u9078\u629E" })] }), _jsx(Typography, { align: "center", color: status === 'error' ? 'error' :
                            status === 'success' ? 'success.main' :
                                'textSecondary', children: message }), status === 'processing' && _jsx(LinearProgress, { variant: "determinate", value: progress }), files.length > 0 && (_jsxs(Stack, { spacing: 2, children: [files.map((file, i) => (_jsxs(Box, { display: "flex", alignItems: "center", children: [_jsx(Box, { component: "img", src: URL.createObjectURL(file), alt: file.name, sx: { width: 60, height: 60, objectFit: 'contain', border: 1, borderColor: 'grey.300', borderRadius: 1, mr: 2 } }), _jsxs(Typography, { variant: "body2", sx: { wordBreak: 'break-all' }, children: [file.name, " (", (file.size / 1024).toFixed(2), " KB)"] })] }, i))), _jsx(Button, { variant: "contained", color: "primary", onClick: uploadAll, disabled: status === 'processing', children: "\u4E00\u62EC\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9" })] }))] }), _jsx(Typography, { variant: "h5", sx: { mt: 4 }, children: "\u89E3\u6790\u7D50\u679C\u4E00\u89A7\uFF08\u6700\u65B010\u4EF6\uFF09" }), _jsx(Stack, { spacing: 2, children: !records.length ?
                    _jsx(_Fragment, { children: "..." }) :
                    records.map((rec) => (_jsxs(Box, { sx: {
                            display: 'flex',
                            alignItems: 'center',
                            p: 1,
                            bgcolor: rec.status === 'processing' ? 'warning.main' : 'inherit',
                            borderRadius: 1,
                        }, children: [_jsx(Avatar, { variant: "rounded", src: typeof rec.imagePath === 'string' ? `${rec.imagePath}?alt=media` : undefined, alt: "thumbnail", sx: { width: 60, height: 60, mr: 2 } }), _jsxs(Box, { children: [_jsx(Typography, { variant: "body2", sx: { fontWeight: 'bold' }, children: rec.status }), _jsx(Typography, { variant: "body2", sx: { whiteSpace: 'pre-wrap' }, children: rec.fullText })] })] }, rec.key))) })] }));
};
export default Home;
