import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Backdrop,
  Box,
  Button,
  Card,
  CardContent,
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
  Tab,
  Tabs,
  Toolbar,
  Typography,
  CircularProgress,
} from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import AddIcon from "@mui/icons-material/Add";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useAuth } from "./AuthContext";
import appIcon from "./assets/icon.png";
import {
  getProjects,
  getProject,
  createSection,
  deleteSection,
  createPassage,
  renameSection,
  renamePassage,
  type Passage,
  type Project,
  type Section,
} from "./api";

type TabId = "overview" | "audio" | "assignments" | "transcriptions";

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addPassageMode, setAddPassageMode] = useState(false);

  const loadProject = useCallback(async () => {
    if (!token) return;
    try {
      const { projects } = await getProjects(token);
      if (projects.length > 0) {
        const { project } = await getProject(token, projects[0].id);
        setProject(project);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadProject().finally(() => setLoading(false));
  }, [loadProject]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // Computed stats
  const totalSections = project?.sections.length ?? 0;
  const totalPassages =
    project?.sections.reduce((sum, s) => sum + s.passages.length, 0) ?? 0;
  // Stubs for association counts — will be derived from real data later
  const totalAssociations = totalPassages; // placeholder
  const completedAssociations = 0; // placeholder
  const completedSections = 0; // placeholder
  const completedPassages = 0; // placeholder

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        bgcolor: "#fafafa",
      }}
    >
      <Backdrop
        open={loading}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      {/* Top App Bar */}
      <AppBar
        position="sticky"
        color="default"
        elevation={0}
        sx={{
          bgcolor: "#eee",
          ...(addPassageMode && { pointerEvents: "none", opacity: 0.5 }),
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <Box
            component="img"
            src={appIcon}
            alt="App icon"
            sx={{ width: 32, height: 32 }}
          />
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            {project?.name ?? "Audio Project Manager"}
          </Typography>
          <Button variant="primary" size="small">
            Export
          </Button>
          <IconButton size="small">
            <HelpOutlineIcon />
          </IconButton>
          <IconButton
            size="small"
            onClick={handleLogout}
            title={`Logout ${user?.email}`}
            disabled={addPassageMode}
          >
            <AccountCircleIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Tabs row — pinned / gray background */}
      <Box
        sx={{
          bgcolor: "#eee",
          borderBottom: 1,
          borderColor: "divider",
          ...(addPassageMode && { pointerEvents: "none", opacity: 0.5 }),
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v as TabId)}
          centered
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab label="Project Overview" value="overview" />
          <Tab
            label={
              <span>
                Audio
                <Typography
                  variant="caption"
                  display="block"
                  color="text.secondary"
                >
                  {completedAssociations} of {totalAssociations} associations
                </Typography>
              </span>
            }
            value="audio"
          />
          <Tab
            label={
              <span>
                Assignments
                <Typography
                  variant="caption"
                  display="block"
                  color="text.secondary"
                >
                  {completedSections} of {totalSections} sections
                </Typography>
              </span>
            }
            value="assignments"
          />
          <Tab
            label={
              <span>
                Transcriptions
                <Typography
                  variant="caption"
                  display="block"
                  color="text.secondary"
                >
                  {completedPassages} of {totalPassages} passages
                </Typography>
              </span>
            }
            value="transcriptions"
          />
        </Tabs>
      </Box>

      {/* Tab content */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {activeTab === "overview" && (
          <ProjectOverviewTab
            project={project}
            token={token}
            error={error}
            onDataChanged={loadProject}
            setLoading={setLoading}
            addPassageMode={addPassageMode}
            setAddPassageMode={setAddPassageMode}
          />
        )}
        {activeTab === "audio" && <PlaceholderTab label="Audio" />}
        {activeTab === "assignments" && <PlaceholderTab label="Assignments" />}
        {activeTab === "transcriptions" && (
          <PlaceholderTab label="Transcriptions" />
        )}
      </Box>
    </Box>
  );
}

/* ─── Project Overview Tab ─────────────────────────────────────────── */

function ProjectOverviewTab({
  project,
  token,
  error,
  onDataChanged,
  setLoading,
  addPassageMode,
  setAddPassageMode,
}: {
  project: Project | null;
  token: string | null;
  error: string | null;
  onDataChanged: () => Promise<void>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  addPassageMode: boolean;
  setAddPassageMode: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const handleAddSection = async () => {
    if (!project || !token) return;
    const nextNumber = project.sections.length + 1;
    const name = `Section ${nextNumber}`;
    setLoading(true);
    try {
      await createSection(token, project.id, name);
      await onDataChanged();
    } catch (err) {
      console.error("Failed to add section", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPassage = async (sectionId: number, sortOrder: number) => {
    if (!token) return;
    setLoading(true);
    try {
      const totalPassagesInProject = project!.sections.reduce(
        (sum, s) => sum + s.passages.length,
        0,
      );
      const reference = `Passage ${totalPassagesInProject + 1}`;
      await createPassage(token, sectionId, reference, sortOrder);
      await onDataChanged();
    } catch (err) {
      console.error("Failed to add passage", err);
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!project) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No projects found.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: "relative" }}>
      {/* Black overlay banner when in Add Passage mode */}
      {addPassageMode && (
        <Box
          sx={{
            position: "fixed",
            top: "25%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1400,
            bgcolor: "rgba(0, 0, 0, 0.95)",
            color: "#fff",
            borderRadius: 2,
            px: 5,
            py: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            boxShadow: 6,
            minWidth: 300,
          }}
        >
          <Typography variant="body1" align="center">
            Select where the new passage should go.
          </Typography>
          <Button variant="toast" onClick={() => setAddPassageMode(false)}>
            DONE
          </Button>
        </Box>
      )}

      {/* Action buttons */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1,
          py: 1.5,
          bgcolor: "#eee",
          borderBottom: 1,
          borderColor: "divider",
          overflowX: "auto",
          whiteSpace: "nowrap",
          "&::-webkit-scrollbar": { height: 7 },
          "&::-webkit-scrollbar-thumb": { bgcolor: "#ccc", borderRadius: 4 },
        }}
      >
        <Button
          onClick={handleAddSection}
          disabled={addPassageMode}
          sx={{ width: 132, flex: "0 0 auto" }}
        >
          Add Section
        </Button>
        <Button
          variant={addPassageMode ? "primary" : undefined}
          onClick={() => setAddPassageMode((prev) => !prev)}
          sx={{ width: 132, flex: "0 0 auto" }}
        >
          Add Passage
        </Button>
        <Button disabled={addPassageMode} sx={{ width: 132, flex: "0 0 auto" }}>
          Spreadsheet
        </Button>
      </Box>

      {/* Sections */}
      <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 4 }}>
        {project.sections.length === 0 ? (
          <Typography
            color="text.secondary"
            sx={{ textAlign: "center", py: 6 }}
          >
            No sections yet. Click "Add Section" to get started.
          </Typography>
        ) : (
          project.sections.map((section) => (
            <SectionRow
              key={section.id}
              section={section}
              token={token}
              setLoading={setLoading}
              onDataChanged={onDataChanged}
              addPassageMode={addPassageMode}
              onInsertPassage={handleAddPassage}
              projectName={project?.name ?? ""}
            />
          ))
        )}
      </Box>
    </Box>
  );
}

/* ─── Section Row ──────────────────────────────────────────────────── */

function SectionRow({
  section,
  token,
  setLoading,
  onDataChanged,
  addPassageMode,
  onInsertPassage,
  projectName,
}: {
  section: Section;
  token: string | null;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  onDataChanged: () => Promise<void>;
  addPassageMode: boolean;
  onInsertPassage: (sectionId: number, sortOrder: number) => Promise<void>;
  projectName: string;
}) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [renameOpen, setRenameOpen] = useState(false);

  const handleDelete = async () => {
    setMenuAnchor(null);
    if (!token) return;
    setLoading(true);
    try {
      await deleteSection(token, section.id);
      await onDataChanged();
    } catch (err) {
      console.error("Failed to delete section", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async (name: string) => {
    if (!token) return;
    setLoading(true);
    try {
      await renameSection(token, section.id, name);
      await onDataChanged();
    } catch (err) {
      console.error("Failed to rename section", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      {/* Section header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {section.name}
        </Typography>

        {!addPassageMode && (
          <IconButton
            size="small"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
          >
            <MoreVertIcon />
          </IconButton>
        )}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setRenameOpen(true);
            }}
          >
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Rename...</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleDelete}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Delete...</ListItemText>
          </MenuItem>
        </Menu>
        <RenameDialog
          open={renameOpen}
          title="Rename Section"
          label="Section name"
          initialValue={section.name}
          onCancel={() => setRenameOpen(false)}
          onConfirm={async (value) => {
            await handleRename(value);
            setRenameOpen(false);
          }}
        />
      </Box>

      {/* Horizontally scrollable passage cards */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          overflowX: "auto",
          pb: 1,
          // Enable shift+scroll horizontal scrolling on supported platforms
          "&::-webkit-scrollbar": { height: 8 },
          "&::-webkit-scrollbar-thumb": { bgcolor: "#ccc", borderRadius: 4 },
        }}
      >
        {section.passages.length === 0 && !addPassageMode ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            No passages in this section.
          </Typography>
        ) : (
          <>
            {/* Leading + slot */}
            {addPassageMode && (
              <InsertSlot onClick={() => onInsertPassage(section.id, 0)} />
            )}
            {section.passages.map((passage) => (
              <Box key={passage.id} sx={{ display: "flex", gap: 2 }}>
                <PassageCard
                  passage={passage}
                  section={section}
                  disabled={addPassageMode}
                  token={token}
                  setLoading={setLoading}
                  onDataChanged={onDataChanged}
                  projectName={projectName}
                />
                {/* Trailing + slot after each card */}
                {addPassageMode && (
                  <InsertSlot
                    onClick={() =>
                      onInsertPassage(section.id, passage.sortOrder + 1)
                    }
                  />
                )}
              </Box>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}

/* ─── Insert Slot (dashed + button for Add Passage mode) ───────────── */

function InsertSlot({ onClick }: { onClick: () => void }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        minWidth: 60,
        height: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "2px dashed #585858",
        borderRadius: 2,
        cursor: "pointer",
        flexShrink: 0,
        transition: "border-color 0.2s, background 0.2s",
        "&:hover": {
          borderColor: "primary.main",
          bgcolor: "rgba(19, 92, 185, 0.04)",
        },
      }}
    >
      <AddIcon sx={{ color: "#585858", fontSize: 32 }} />
    </Box>
  );
}

/* ─── Passage Card ─────────────────────────────────────────────────── */

function PassageCard({
  passage,
  section,
  disabled,
  token,
  setLoading,
  onDataChanged,
  projectName,
}: {
  passage: Passage;
  section: Section;
  disabled?: boolean;
  token: string | null;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  onDataChanged: () => Promise<void>;
  projectName: string;
}) {
  const navigate = useNavigate();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [renameOpen, setRenameOpen] = useState(false);

  const handleRename = async (reference: string) => {
    if (!token) return;
    setLoading(true);
    try {
      await renamePassage(token, passage.id, reference);
      await onDataChanged();
    } catch (err) {
      console.error("Failed to rename passage", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      variant="outlined"
      sx={{
        minWidth: 300,
        maxWidth: 340,
        height: 200,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        p: 2,
        ...(disabled && { pointerEvents: "none", opacity: 0.5 }),
      }}
    >
      <CardContent sx={{ p: 0 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {passage.reference}
            </Typography>
            <IconButton size="small">
              <PlayCircleOutlineIcon />
            </IconButton>
          </Box>
          <IconButton
            size="small"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            disabled={disabled}
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
                setRenameOpen(true);
              }}
            >
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Rename...</ListItemText>
            </MenuItem>
          </Menu>
          <RenameDialog
            open={renameOpen}
            title="Rename Passage"
            label="Passage name"
            initialValue={passage.reference}
            onCancel={() => setRenameOpen(false)}
            onConfirm={async (value) => {
              await handleRename(value);
              setRenameOpen(false);
            }}
          />
        </Box>
        {passage.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {passage.description}
          </Typography>
        )}
      </CardContent>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <PersonOutlineIcon fontSize="small" color="action" />
          <Typography variant="body2" color="text.secondary">
            Translators
          </Typography>
        </Box>
        <Button
          fullWidth
          variant="primary"
          sx={{
            justifyContent: "space-between",
          }}
          endIcon={<ChevronRightIcon />}
          onClick={() =>
            navigate("/record", {
              state: {
                passageId: passage.id,
                passageReference: passage.reference,
                projectName,
                speaker: passage.speaker,
                sectionPassages: section.passages.map((p) => ({
                  id: p.id,
                  reference: p.reference,
                  speaker: p.speaker,
                })),
              },
            })
          }
        >
          Record
        </Button>
      </Box>
    </Card>
  );
}

function RenameDialog({
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
  onConfirm: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [open, initialValue]);

  const trimmedValue = value.trim();
  const handleConfirm = () => onConfirm(trimmedValue);

  return (
    <Dialog open={open} onClose={(_, reason) => reason !== "backdropClick" && onCancel()} fullWidth maxWidth="xs">
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
            if (e.key === "Enter" && trimmedValue) {
              e.preventDefault();
              handleConfirm();
            }
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!trimmedValue}>
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ─── Placeholder for other tabs ───────────────────────────────────── */

function PlaceholderTab({ label }: { label: string }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 400,
      }}
    >
      <Typography variant="h5" color="text.secondary">
        {label} — Coming Soon
      </Typography>
    </Box>
  );
}
