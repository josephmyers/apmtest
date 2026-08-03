import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
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
  Select,
  TextField,
  Tab,
  Tabs,
  Typography,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import AddIcon from "@mui/icons-material/Add";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useAuth } from "./AuthContext";
import PageHeader from "./PageHeader";
import {
  getProject,
  createSection,
  deleteSection,
  createPassage,
  deletePassage,
  renameSection,
  renamePassage,
  type Passage,
  type Project,
  type Section,
} from "./api";
import { getStep, type StepNavState } from "./steps";

type TabId = "overview" | "audio" | "assignments" | "transcriptions";

export default function Dashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { projectId: projectIdParam } = useParams<{ projectId: string }>();
  const projectId = Number(projectIdParam);
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("md"));

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addPassageMode, setAddPassageMode] = useState(false);

  const loadProject = useCallback(async () => {
    if (!token || !projectId) return;
    try {
      const { project } = await getProject(token, projectId);
      setProject(project);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    }
  }, [token, projectId]);

  useEffect(() => {
    if (!projectId) {
      navigate("/projects", { replace: true });
      return;
    }
    setLoading(true);
    loadProject().finally(() => setLoading(false));
  }, [loadProject, projectId, navigate]);

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
        height: "100vh",
        overflow: "hidden",
        "@supports (height: 100dvh)": {
          height: "100dvh",
        },
        bgcolor: "#fafafa",
      }}
    >
      <Backdrop
        open={loading}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      <PageHeader
        leftIcon="logo"
        onLeftClick={() => navigate("/projects")}
        title={project?.name ?? "Audio Project Manager"}
        rightActions={
          <Button aria-label="export" variant="primary" size="small">
            Export
          </Button>
        }
        disabled={addPassageMode}
      />

      {/* Tabs row — pinned / gray background */}
      <Box
        sx={{
          bgcolor: "#eee",
          borderBottom: 1,
          borderColor: "divider",
          ...(addPassageMode && { pointerEvents: "none", opacity: 0.5 }),
        }}
      >
        {isSmallScreen ? (
          <Box sx={{ px: 2, py: 1 }}>
            <Select
              size="small"
              fullWidth
              value={activeTab}
              onChange={(e: { target: { value: string } }) => setActiveTab(e.target.value as TabId)}
              inputProps={{ "aria-label": "tab selector" }}
              sx={{bgcolor: "#fff"}}
            >
              <MenuItem aria-label="overview option" value="overview">
                Project Overview
              </MenuItem>
              <MenuItem aria-label="audio option" value="audio">
                Audio
              </MenuItem>
              <MenuItem aria-label="assignments option" value="assignments">
                Assignments
              </MenuItem>
              <MenuItem aria-label="transcriptions option" value="transcriptions">
                Transcriptions
              </MenuItem>
            </Select>
          </Box>
        ) : (
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v as TabId)}
            variant="standard"
            centered
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab aria-label="overview tab" label="Project Overview" value="overview" />
            <Tab
              aria-label="audio tab"
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
              aria-label="assignments tab"
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
              aria-label="transcriptions tab"
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
        )}
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
          <Button
            aria-label="done adding passages"
            variant="toast"
            onClick={() => setAddPassageMode(false)}
          >
            DONE
          </Button>
        </Box>
      )}

      {/* Action buttons */}
      {project.flags?.structureEditsAllowed !== false && (
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
            position: "sticky",
            top: 0,
            zIndex: 1,
            overflowX: "auto",
            whiteSpace: "nowrap",
            "&::-webkit-scrollbar": { height: 7 },
            "&::-webkit-scrollbar-thumb": { bgcolor: "#ccc", borderRadius: 4 },
          }}
        >
          <Button
            aria-label="add section"
            onClick={handleAddSection}
            disabled={addPassageMode}
            sx={{ width: 132, flex: "0 0 auto" }}
          >
            Add Section
          </Button>
          <Button
            aria-label="add passage"
            variant={addPassageMode ? "primary" : undefined}
            onClick={() => setAddPassageMode((prev) => !prev)}
            sx={{ width: 132, flex: "0 0 auto" }}
          >
            Add Passage
          </Button>
        </Box>
      )}


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
              projectId={project.id}
              structureEditsAllowed={
                project.flags?.structureEditsAllowed !== false
              }
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
  projectId,
  structureEditsAllowed,
}: {
  section: Section;
  token: string | null;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  onDataChanged: () => Promise<void>;
  addPassageMode: boolean;
  onInsertPassage: (sectionId: number, sortOrder: number) => Promise<void>;
  projectName: string;
  projectId: number;
  structureEditsAllowed: boolean;
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
            aria-label={`${section.name} menu`}
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
            aria-label={`rename ${section.name}`}
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
          {structureEditsAllowed && (
            <MenuItem
              aria-label={`delete ${section.name}`}
              onClick={handleDelete}
            >
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>
          )}
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
                  disabled={addPassageMode}
                  token={token}
                  setLoading={setLoading}
                  onDataChanged={onDataChanged}
                  projectName={projectName}
                  projectId={projectId}
                  structureEditsAllowed={structureEditsAllowed}
                />
                {/* Trailing + slot after each card */}
                {addPassageMode && (
                  <InsertSlot
                    onClick={() =>
                      onInsertPassage(section.id, passage.sort_order + 1)
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
  disabled,
  token,
  setLoading,
  onDataChanged,
  projectName,
  projectId,
  structureEditsAllowed,
}: {
  passage: Passage;
  disabled?: boolean;
  token: string | null;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  onDataChanged: () => Promise<void>;
  projectName: string;
  projectId: number;
  structureEditsAllowed: boolean;
}) {
  const navigate = useNavigate();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const step = getStep(passage.current_step);

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

  const handleDelete = async () => {
    setConfirmDeleteOpen(false);
    if (!token) return;
    setLoading(true);
    try {
      await deletePassage(token, passage.id);
      await onDataChanged();
    } catch (err) {
      console.error("Failed to delete passage", err);
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
            <IconButton aria-label={`play ${passage.reference}`} size="small">
              <PlayCircleOutlineIcon />
            </IconButton>
          </Box>
          <IconButton
            aria-label={`${passage.reference} menu`}
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
              aria-label={`rename ${passage.reference}`}
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
            {structureEditsAllowed && (
              <MenuItem
                aria-label={`delete ${passage.reference}`}
                onClick={() => {
                  setMenuAnchor(null);
                  setConfirmDeleteOpen(true);
                }}
              >
                <ListItemIcon>
                  <DeleteIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Delete...</ListItemText>
              </MenuItem>
            )}
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
          <Dialog
            open={confirmDeleteOpen}
            onClose={(_, reason) =>
              reason !== "backdropClick" && setConfirmDeleteOpen(false)
            }
            fullWidth
            maxWidth="xs"
          >
            <DialogTitle>Delete Passage</DialogTitle>
            <DialogContent>
              <Typography>
                Delete passage &ldquo;{passage.reference}&rdquo;? This will
                permanently remove all of its audio and cannot be undone.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button
                aria-label={`cancel delete ${passage.reference}`}
                onClick={() => setConfirmDeleteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                aria-label={`confirm delete ${passage.reference}`}
                variant="primary"
                onClick={handleDelete}
              >
                Delete
              </Button>
            </DialogActions>
          </Dialog>
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
          aria-label={`open ${passage.reference}`}
          fullWidth
          variant="primary"
          sx={{
            justifyContent: "space-between",
          }}
          endIcon={<ChevronRightIcon />}
          onClick={() => {
            const navState: StepNavState = {
              passageId: passage.id,
              passageReference: passage.reference,
              projectName,
              projectId,
            };
            navigate(step.route, { state: navState });
          }}
        >
          {step.title}
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
          aria-label={`${label} input`}
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
        <Button aria-label={`cancel ${title.toLowerCase()}`} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          aria-label={`confirm ${title.toLowerCase()}`}
          variant="primary"
          onClick={handleConfirm}
          disabled={!trimmedValue}
        >
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
