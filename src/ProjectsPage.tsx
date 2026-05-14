import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Backdrop,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { useAuth } from "./AuthContext";
import PageHeader from "./PageHeader";
import TeamMembersDialog from "./TeamMembersDialog";
import {
  createProject,
  deleteProject,
  getProjects,
  renameProject,
  type ProjectSummary,
} from "./api";

export default function ProjectsPage() {
  const { token, activeTeam, activeTeamId } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null);

  const reload = useCallback(async () => {
    if (!token || !activeTeamId) return;
    setLoading(true);
    try {
      const { projects: rows } = await getProjects(token, activeTeamId);
      setProjects(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [token, activeTeamId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!activeTeamId || !activeTeam) {
    return <Navigate to="/teams" replace />;
  }

  const handleAdd = async (name: string) => {
    if (!token) return;
    setLoading(true);
    try {
      await createProject(token, activeTeamId, name);
      await reload();
    } finally {
      setAddOpen(false);
      setLoading(false);
    }
  };

  const handleDelete = async (projectId: number) => {
    if (!token) return;
    setLoading(true);
    try {
      await deleteProject(token, projectId);
      await reload();
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async (projectId: number, name: string) => {
    if (!token) return;
    setLoading(true);
    try {
      await renameProject(token, projectId, name);
      await reload();
    } finally {
      setRenameTarget(null);
      setLoading(false);
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
        title={activeTeam.name}
        leftExtra={
          <IconButton
            size="small"
            onClick={() => setMembersOpen(true)}
            title="Manage team members"
          >
            <PeopleOutlineIcon />
          </IconButton>
        }
      />

      <Box sx={{ flex: 1, p: 3 }}>
        {error && (
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}

        {projects.length === 0 && !error ? (
          <Typography
            color="text.secondary"
            sx={{ textAlign: "center", py: 6 }}
          >
            No projects yet. Click "Add Project" below to create one.
          </Typography>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 2,
            }}
          >
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => navigate(`/projects/${p.id}`)}
                onDelete={() => handleDelete(p.id)}
                onRename={() => setRenameTarget(p)}
              />
            ))}
          </Box>
        )}
      </Box>

      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          gap: 2,
          py: 3,
        }}
      >
        <Button onClick={() => setAddOpen(true)}>Add Project</Button>
        <Button onClick={() => navigate("/teams")}>Switch Teams</Button>
      </Box>

      <TeamMembersDialog
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        teamId={activeTeamId}
      />

      <NameDialog
        open={addOpen}
        title="New Project"
        label="Project name"
        initialValue=""
        onCancel={() => setAddOpen(false)}
        onConfirm={handleAdd}
      />

      {renameTarget && (
        <NameDialog
          open
          title="Rename Project"
          label="Project name"
          initialValue={renameTarget.name}
          onCancel={() => setRenameTarget(null)}
          onConfirm={(name) => handleRename(renameTarget.id, name)}
        />
      )}
    </Box>
  );
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
  onRename,
}: {
  project: ProjectSummary;
  onOpen: () => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  return (
    <Card
      sx={{
        bgcolor: "primary.main",
        color: "#fff",
        position: "relative",
        borderRadius: 2,
      }}
    >
      <CardActionArea onClick={onOpen}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <MenuBookIcon />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {project.name}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            {project.sectionCount === 1
              ? "1 Section"
              : `${project.sectionCount} Sections`}
          </Typography>
        </CardContent>
      </CardActionArea>
      <IconButton
        size="small"
        sx={{ position: "absolute", top: 8, right: 8, color: "#fff" }}
        onClick={(e) => {
          e.stopPropagation();
          setMenuAnchor(e.currentTarget);
        }}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onRename();
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rename...</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onDelete();
          }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Card>
  );
}

function NameDialog({
  open,
  title,
  label,
  initialValue,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  label: string;
  initialValue: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const trimmed = value.trim();
  const submit = () => trimmed && onConfirm(trimmed);

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => reason !== "backdropClick" && onCancel()}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          fullWidth
          label={label}
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
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={!trimmed}>
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
