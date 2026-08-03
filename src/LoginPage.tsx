import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Tab,
  Tabs,
  Alert,
  CircularProgress,
} from "@mui/material";
import { login, signup } from "./api";
import { useAuth } from "./AuthContext";

export default function LoginPage() {
  const [tab, setTab] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const fn = tab === 0 ? login : signup;
      const data = await fn(email, password);
      setAuth(data.token, data.user);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        "@supports (min-height: 100dvh)": {
          minHeight: "100dvh",
        },
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "grey.100",
        position: "relative",
      }}
    >
      <Box sx={{ position: "absolute", top: 16, right: 16 }}>
        <a href="https://www.netlify.com">
          <img
            src="https://www.netlify.com/assets/badges/netlify-badge-light.svg"
            alt="Deploys by Netlify"
          />
        </a>
      </Box>
      <Card sx={{ width: 400, maxWidth: "90vw" }}>
        <CardContent>
          <Typography variant="h5" textAlign="center" gutterBottom>
            Welcome
          </Typography>

          <Tabs
            value={tab}
            onChange={(_, v) => {
              setTab(v);
              setError("");
            }}
            variant="fullWidth"
            sx={{ mb: 2 }}
          >
            <Tab label="Log In" />
            <Tab label="Sign Up" />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              aria-label="username"
              label="Email"
              type="email"
              fullWidth
              required
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              aria-label="password"
              label="Password"
              type="password"
              fullWidth
              required
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              inputProps={{ minLength: 6 }}
            />
            <Button
              aria-label="login"
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{ mt: 2 }}
            >
              {loading ? <CircularProgress size={24} /> : tab === 0 ? "Log In" : "Sign Up"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
