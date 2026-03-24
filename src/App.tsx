import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import TouchTracker from "./TouchTracker";
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  CircularProgress,
  Box,
} from "@mui/material";
import { darken } from "@mui/material/styles";
import { AuthProvider, useAuth } from "./AuthContext";
import LoginPage from "./LoginPage";
import Dashboard from "./Dashboard";
import RecordPage from "./RecordPage";
import ReplaceAIPage from "./ReplaceAIPage";

const PRIMARY_MAIN = "#135CB9";
const RECORD_READY_RED = "#D32F2F";

/** Central width-based breakpoints (px) */
export const BREAKPOINTS = {
  xs: 0,
  sm: 420,
  md: 600,
  lg: 900,
  xl: 1200,
} as const;

declare module "@mui/material/Button" {
  interface ButtonPropsVariantOverrides {
    primary: true;
    toast: true;
  }
}

declare module "@mui/material/IconButton" {
  interface IconButtonOwnProps {
    variant?: "floating";
  }
}

const theme = createTheme({
  breakpoints: {
    values: BREAKPOINTS,
  },
  palette: {
    primary: {
      main: PRIMARY_MAIN,
    },
    alert: {
      main: RECORD_READY_RED,
    },
    secondary: {
      main: "#00A7E1",
    },
    neutral: {
      main: "#000000",
    },
    custom: {
      currentRegion: "rgb(102, 255, 0, .5)",
    },
  } as any,
  typography: {
    button: {
      textTransform: "none",
    },
    subtitle1: {
      fontSize: "1.2rem",
      [`@media (max-width:${BREAKPOINTS.sm}px)`]: {
        fontSize: "1rem",
      },
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: "8px",
          padding: "8px 16px",
          boxShadow: "1px 1px 3px rgba(0, 0, 0, 0.12)",
          color: "black",
          height: 36,
          background: "#fff",
          fontSize: "1rem",
          [`@media (max-width:${BREAKPOINTS.sm}px)`]: {
            fontSize: "0.8rem",
            lineHeight: "normal",
          },
          "&:hover": {
            background: "#e2e2e2",
          },
          "&:disabled": {
            background: "#f0f0f0",
          }
        },
      },
      variants: [
        {
          props: { variant: "primary" },
          style: {
            background: "#333",
            color: "#fff",
            "&:hover": {
              background: "#555",
            },
            "&:disabled": {
              background: "#e0e0e0",
              color: "#999",
            },
          },
        },
        {
          props: { variant: "toast" },
          style: {
            background: PRIMARY_MAIN,
            color: "#fff",
            "&:hover": {
              background: darken(PRIMARY_MAIN, 0.12),
            },
            "&:disabled": {
              background: "#e0e0e0",
              color: "#999",
            },
          },
        },
      ],
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: "rgba(0, 0, 0, 0.7)"
        }
      },
      variants: [
        {
          props: { variant: "floating" },
          style: {
            width: 56,
            height: 56,
            border: "1px solid",
            borderColor: "#e0e0e0",
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.15)",
            color: "rgba(0, 0, 0, 0.5)",
            transition: "all 0.2s ease-in-out",
            "&:hover": {
              backgroundColor: "#f5f5f5",
              boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.2)",
            },
          },
        },
      ],
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/record"
        element={
          <ProtectedRoute>
            <RecordPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/replace-ai"
        element={
          <ProtectedRoute>
            <ReplaceAIPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
      <TouchTracker />
    </ThemeProvider>
  );
}
