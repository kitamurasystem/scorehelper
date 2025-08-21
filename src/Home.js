import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// src/Home.tsx
import { useState } from 'react';
import { Box, Typography, Button, Paper, Stack, LinearProgress, } from '@mui/material';
import { storage } from './firebase';
import { ref, uploadBytesResumable } from 'firebase/storage';
const Home = () => {
    const [files, setFiles] = useState([]);
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState('idle');
    const [progress, setProgress] = useState(0);
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
                    sessionId: "fixedSessionIdOrDynamic", // 実際は動的に
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
    return (_jsxs(Stack, { spacing: 3, sx: { maxWidth: 700, mx: 'auto', mt: 4, p: 2 }, children: [_jsxs(Typography, { variant: "h4", color: "primary", align: "center", children: ["\u753B\u50CF\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9", _jsx("small", { children: "202508211150" })] }), _jsxs(Paper, { elevation: 3, variant: "outlined", sx: {
                    p: 4,
                    textAlign: 'center',
                    bgcolor: status === 'processing' ? 'grey.200' : 'background.paper',
                    cursor: 'pointer',
                    border: '2px dashed',
                    borderColor: status === 'processing' ? 'grey.400' : 'primary.main'
                }, onDrop: handleDrop, onDragOver: handleDragOver, onClick: () => document.getElementById('file-input')?.click(), children: [_jsx("input", { id: "file-input", type: "file", accept: "image/*", multiple: true, onChange: handleInputChange, style: { display: 'none' } }), _jsx(Typography, { variant: "body1", color: "textSecondary", children: "\u30C9\u30E9\u30C3\u30B0\uFF06\u30C9\u30ED\u30C3\u30D7\u307E\u305F\u306F\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u753B\u50CF\u3092\u9078\u629E" })] }), _jsx(Typography, { align: "center", color: status === 'error' ? 'error' :
                    status === 'success' ? 'success.main' :
                        'textSecondary', children: message }), status === 'processing' && _jsx(LinearProgress, { variant: "determinate", value: progress }), files.length > 0 && (_jsxs(Stack, { spacing: 2, children: [files.map((file, i) => (_jsxs(Box, { display: "flex", alignItems: "center", children: [_jsx(Box, { component: "img", src: URL.createObjectURL(file), alt: file.name, sx: { width: 60, height: 60, objectFit: 'contain', border: 1, borderColor: 'grey.300', borderRadius: 1, mr: 2 } }), _jsxs(Typography, { variant: "body2", sx: { wordBreak: 'break-all' }, children: [file.name, " (", (file.size / 1024).toFixed(2), " KB)"] })] }, i))), _jsx(Button, { variant: "contained", color: "primary", onClick: uploadAll, disabled: status === 'processing', children: "\u4E00\u62EC\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9" })] }))] }));
};
export default Home;
