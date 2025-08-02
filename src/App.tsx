// App.tsx
import React, { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";

import Home from "./Home";  

const auth = getAuth();

const App:React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (initializing) {
        setInitializing(false);
      }
    });
    return unsubscribe;
  }, []);

  // 初期化後にユーザー未存在なら匿名ログインを試みる
  useEffect(() => {
    if (!initializing && user === null) {
      signInAnonymously(auth).catch((err) => {
        console.error("匿名ログインに失敗:", err);
      });
    }
  }, [initializing, user]);

  return (
    <Box display="flex" flexDirection="column" minHeight="100vh">
      {/* ナビゲーションバー */}
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            ScoreHelper
          </Typography>
          <Button color="inherit">Home</Button>
        </Toolbar>
      </AppBar>

      {/* コンテンツ表示領域 */}
      <Container component="main" sx={{ mt: 4, flexGrow: 1 }}>
        {initializing ? (
          <Box textAlign="center" mt={8}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>読込中…</Typography>
          </Box>
        ) : user ? (
          <Home />
        ) : (
          <Typography color="error" textAlign="center" mt={8}>
            認証エラーが発生しました。
          </Typography>
        )}
      </Container>
    </Box>
  );
};

export default App;