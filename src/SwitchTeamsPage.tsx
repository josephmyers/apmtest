import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Backdrop,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "./AuthContext";
import PageHeader from "./PageHeader";
import { createTeam } from "./api";

export default function SwitchTeamsPage() {
  const { token, teams, activeTeamId, setActiveTeamId, refreshTeams } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const hasTeams = teams.length > 0;

  const handlePick = (teamId: number) => {
    setActiveTeamId(teamId);
    navigate("/projects");
  };

  const handleCreate = async (name: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const { team } = await createTeam(token, name);
      await refreshTeams();
      setActiveTeamId(team.id);
      navigate("/projects");
    } finally {
      setLoading(false);
      setCreateOpen(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        "@supports (min-height: 100dvh)": { minHeight: "100dvh" },
        bgcolor: "#fafafa",
      }}
    >
      <Backdrop open={loading} sx={{ zIndex: (t) => t.zIndex.modal + 1 }}>
        <CircularProgress color="inherit" />
      </Backdrop>

      <PageHeader
        leftIcon="logo"
        onLeftClick={hasTeams ? () => navigate("/projects") : undefined}
        title="My Teams"
      />

      <Box sx={{ flex: 1, p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
        {!hasTeams ? (
          <Box sx={{ textAlign: "center", py: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="h6">You're not on any team yet.</Typography>
            <Typography color="text.secondary">
              Create a team to get started, or ask someone to add you to their team by your email.
            </Typography>
            <Box>
              <Button
                aria-label="create first team"
                onClick={() => setCreateOpen(true)}
              >
                Create a Team
              </Button>
            </Box>
          </Box>
        ) : (
          <>
            <List sx={{ maxWidth: 600, width: "100%", alignSelf: "center" }}>
              {teams.map((t) => (
                <ListItemButton
                  key={t.id}
                  aria-label={`${t.name} team`}
                  selected={t.id === activeTeamId}
                  onClick={() => handlePick(t.id)}
                  sx={{ borderRadius: 2, my: 1, bgcolor: (theme) => t.id === activeTeamId ? theme.palette.primary.light + " !important" : "#f5f5f5" }}
                >
                  <ListItemText
                    primary={t.name}
                    secondary={t.id === activeTeamId ? "Current team" : undefined}
                  />
                </ListItemButton>
              ))}
            </List>
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <Button
                aria-label="create new team"
                onClick={() => setCreateOpen(true)}
              >
                Create New Team
              </Button>
            </Box>
          </>
        )}
      </Box>

      <CreateTeamDialog
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onConfirm={handleCreate}
      />
    </Box>
  );
}

function CreateTeamDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const submit = () => trimmed && onConfirm(trimmed);

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason !== "backdropClick") {
          setValue("");
          onCancel();
        }
      }}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>Create Team</DialogTitle>
      <DialogContent>
        <TextField
          aria-label="Team name input"
          autoFocus
          margin="dense"
          fullWidth
          label="Team name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button
          aria-label="cancel create team"
          onClick={() => {
            setValue("");
            onCancel();
          }}
        >
          Cancel
        </Button>
        <Button
          aria-label="confirm create team"
          variant="primary"
          onClick={submit}
          disabled={!trimmed}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
