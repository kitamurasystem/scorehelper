import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light', // ダークモードなども選択可能
  },
});

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <App />
  </ThemeProvider>
);
