import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
// src/App.tsx
import React, { createContext, useEffect, useState } from "react";
import { auth } from "./firebase"; // export const auth = getAuth(app);
import { signInAnonymously, onAuthStateChanged, } from "firebase/auth";
import Home from "./Home";
import List from "./List";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
export const ContextUserAccount = createContext({});
const App = () => {
    const [user, setUser] = useState(null);
    const [authOk, setAuthOk] = useState(null); // null = 認証チェック中
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            if (u) {
                setUser(u);
                setAuthOk(true);
            }
            else {
                // 初期の null → u をセットされる前の状態で、すぐに false にしない
                if (authOk !== null) {
                    setAuthOk(false);
                }
            }
        });
        return unsubscribe;
    }, [authOk]);
    useEffect(() => {
        if (authOk === null) {
            signInAnonymously(auth).catch((err) => {
                console.error("匿名ログイン失敗", err);
                setAuthOk(false);
            });
        }
    }, [authOk]);
    const [currentPage, setCurrentPage] = useState("home");
    const renderBody = () => {
        if (authOk === null) {
            return (_jsxs(_Fragment, { children: [_jsx(CircularProgress, {}), _jsx(Typography, { mt: 2, children: "\u8A8D\u8A3C\u4E2D\u2026" })] }));
        }
        if (authOk === false) {
            return _jsx(Typography, { color: "error", children: "\u8A8D\u8A3C\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002" });
        }
        return currentPage === "list" ? _jsx(List, {}) : _jsx(Home, {});
    };
    return (_jsxs(Box, { display: "flex", flexDirection: "column", minHeight: "100vh", children: [_jsx(AppBar, { position: "static", children: _jsx(Container, { maxWidth: "md", children: _jsxs(Toolbar, { disableGutters: true, sx: { justifyContent: 'space-between' }, children: [_jsx(Typography, { variant: "h6", children: "ScoreHelper" }), _jsxs(Box, { children: [_jsx(Button, { color: "inherit", onClick: () => setCurrentPage("home"), disabled: currentPage === "home", children: "Home" }), _jsx(Button, { color: "inherit", onClick: () => setCurrentPage("list"), disabled: currentPage === "list", children: "\u4E00\u89A7" })] })] }) }) }), _jsx(Container, { component: "main", maxWidth: "md", sx: { flexGrow: 1, mt: 3 }, children: _jsx(Box, { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", children: renderBody() }) }), _jsx(Typography, { color: "secondary", style: { fontSize: 'ex-small' }, children: user ? 'login ok' : '' }), _jsx("small", { children: "202508231917" })] }));
};
export default App;
