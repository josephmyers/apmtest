import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "./AuthContext";
import {
  addTeamMember,
  getTeamMembers,
  removeTeamMember,
  type TeamMember,
} from "./api";

interface TeamMembersDialogProps {
  open: boolean;
  onClose: () => void;
  teamId: number;
}

export default function TeamMembersDialog({
  open,
  onClose,
  teamId,
}: TeamMembersDialogProps) {
  const { token, user } = useAuth();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");

  const reload = useCallback(async () => {
    if (!token || !open) return;
    setLoading(true);
    try {
      const { members: list } = await getTeamMembers(token, teamId);
      setMembers(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [token, teamId, open]);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const handleAdd = async () => {
    if (!token) return;
    const email = emailInput.trim();
    if (!email) return;
    setLoading(true);
    try {
      await addTeamMember(token, teamId, email);
      setEmailInput("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    if (!token) return;
    if (member.userId === user?.id) {
      const ok = window.confirm(
        "Remove yourself from this team? You'll lose access to its projects.",
      );
      if (!ok) return;
    }
    setLoading(true);
    try {
      await removeTeamMember(token, teamId, member.userId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Team Members</DialogTitle>
      <DialogContent>
        {error && (
          <Typography color="error" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}

        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <TextField
            size="small"
            fullWidth
            label="Add by email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button
            variant="primary"
            onClick={handleAdd}
            disabled={!emailInput.trim() || loading}
          >
            Add
          </Button>
        </Box>

        {loading && members.length === 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <List dense>
            {members.map((m) => (
              <ListItem
                key={m.userId}
                secondaryAction={
                  <IconButton
                    edge="end"
                    onClick={() => handleRemove(m)}
                    title="Remove from team"
                  >
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <span>{m.email}</span>
                      {m.pending && (
                        <Chip
                          label="Pending"
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      )}
                      {m.userId === user?.id && (
                        <Chip label="You" size="small" />
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
