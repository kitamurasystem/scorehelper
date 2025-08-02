// src/App.tsx
import React, { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { auth } from "./firebase";  // export const auth = getAuth(app);
import {
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";

import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

import Home from "./Home";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authOk, setAuthOk] = useState<boolean | null>(null); // null = 認証チェック中

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setAuthOk(true);
      } else {
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

  // コンテンツ部分：中央に寄せたい領域
  const bodyContent = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center", // 横方向中央
        textAlign: "center",
        mt: 8,
      }}
    >
      {authOk === null && <CircularProgress />}
      {authOk === null && <Typography mt={2}>認証中…</Typography>}
      {authOk === false && (
        <Typography color="error">認証エラーが発生しました。</Typography>
      )}
      {authOk === true && <Home />}
    </Box>
  );

  return (
    <Box display="flex" flexDirection="column" minHeight="100vh">
      <AppBar position="static">
        <Container maxWidth="md">
          <Toolbar disableGutters>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              ScoreHelper
            </Typography>
            <Button color="inherit">Home</Button>
          </Toolbar>
        </Container>
      </AppBar>

      <Container component="main" maxWidth="md" sx={{ flexGrow: 1 }}>
        {bodyContent}
      </Container>
      <p><small>{user ? '匿名ログイン中' : ''}</small></p>
    </Box>
  );
};

export default App;
