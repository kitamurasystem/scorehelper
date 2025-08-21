import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material';
const theme = createTheme({
    palette: {
        mode: 'light', // ダークモードなども選択可能
    },
});
createRoot(document.getElementById('root')).render(_jsxs(ThemeProvider, { theme: theme, children: [_jsx(CssBaseline, {}), _jsx(App, {})] }));
