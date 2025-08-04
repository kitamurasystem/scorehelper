// src/App.tsx
import React, { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { auth } from "./firebase";  // export const auth = getAuth(app);
import {
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";

import Home from "./Home";
import List from "./List";

import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

type Page = "home" | "list";

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

  const [currentPage, setCurrentPage] = useState<Page>("home");
  
  const renderBody = () => {
    if (authOk === null) {
      return (
        <>
          <CircularProgress />
          <Typography mt={2}>認証中…</Typography>
        </>
      );
    }
    if (authOk === false) {
      return <Typography color="error">認証エラーが発生しました。</Typography>;
    }
    return currentPage === "list" ? <List /> : <Home />;
  };


  return (
    <Box display="flex" flexDirection="column" minHeight="100vh">
      <AppBar position="static">
        <Container maxWidth="md">
          <Toolbar disableGutters sx={{ justifyContent: 'space-between' }}>
            <Typography variant="h6">ScoreHelper</Typography>
            <Box>
              <Button
                color="inherit"
                onClick={() => setCurrentPage("home")}
                disabled={currentPage === "home"}
              >
                Home
              </Button>
              <Button
                color="inherit"
                onClick={() => setCurrentPage("list")}
                disabled={currentPage === "list"}
              >
                一覧
              </Button>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>
      <Container component="main" maxWidth="md" sx={{ flexGrow: 1, mt: 3 }}>
        <Box display="flex" flexDirection="column" alignItems="center" textAlign="center">
          {renderBody()}
        </Box>
      </Container>
      <Typography color="secondary" style={{fontSize:'ex-small'}}>{user ? 'login ok' : ''}</Typography>
    </Box>
  );
};

export default App;
