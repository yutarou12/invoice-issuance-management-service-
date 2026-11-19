import React from 'react';
import { createRoot } from 'react-dom/client';
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/500.css';
import '@fontsource/noto-sans-jp/700.css';
import App from './App';
import './style.css';

// デジタル庁の青・明瞭な境界・状態ラベルをMUIのテーマに反映する。
const theme = createTheme({
  palette: {
    primary: { main: '#0031d8' },
    background: { default: '#f6f7f9' },
    text: { primary: '#1a1a1c', secondary: '#586174' },
    success: { main: '#17643b' },
    error: { main: '#b42318' },
  },
  typography: {
    fontFamily: '"Noto Sans JP", sans-serif',
    button: { textTransform: 'none', fontWeight: 700 },
    h4: { fontWeight: 700, fontSize: '1.9rem' },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 44, paddingInline: 18 } },
    },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: '#f8f9fb',
          fontWeight: 700,
          color: '#586174',
          whiteSpace: 'nowrap',
        },
        root: { borderColor: '#e4e7ec', padding: '18px 20px' },
      },
    },
  },
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
