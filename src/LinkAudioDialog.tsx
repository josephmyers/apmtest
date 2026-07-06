import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListSubheader,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { useAuth } from "./AuthContext";
import { AudioPlayer } from "./AudioPlayer";
import { clipAudio } from "./audioUtils";
import {
  fetchVersionAudio,
  getProject,
  listPassageVersions,
  type MessageAudioLink,
  type PassageVersion,
} from "./api";

interface LinkAudioDialogProps {
  open: boolean;
  onClose: () => void;
  passageId: number;
  projectId: number;
  onLink: (link: MessageAudioLink, clip: Blob) => void;
}

interface SourceOption {
  key: string;
  group: "Current passage" | "Previous versions" | "Other passages";
  label: string;
  passageId: number;
  audioKey: string;
}

const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

export default function LinkAudioDialog({
  open,
  onClose,
  passageId,
  projectId,
  onLink,
}: LinkAudioDialogProps) {
  const { token } = useAuth();

  // Version lists per passage, fetched lazily and reused across selections.
  const versionsCache = useRef<Map<number, PassageVersion[]>>(new Map());

  const [options, setOptions] = useState<SourceOption[] | null>(null); // null = loading
  const [selectedKey, setSelectedKey] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [resolving, setResolving] = useState(false);
  const [source, setSource] = useState<{ kind: "version"; versionId: number } | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [linking, setLinking] = useState(false);

  // Build the dropdown once per open.
  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setOptions(null);
    setSelectedKey("");
    setBlob(null);
    setSource(null);
    setSelection(null);
    versionsCache.current.clear();

    (async () => {
      const { project } = await getProject(token, projectId);
      const all = project.sections.flatMap((s) => s.passages);
      const current = all.find((p) => p.id === passageId) ?? null;

      const { versions } = await listPassageVersions(token, passageId);
      versionsCache.current.set(passageId, versions);
      if (cancelled) return;

      const opts: SourceOption[] = [];
      if (current?.audioKey) {
        opts.push({ key: `p${passageId}`, group: "Current passage", label: current.reference, passageId, audioKey: current.audioKey });
      }
      for (const v of versions.filter((v) => v.audioKey !== current?.audioKey)) {
        const note = v.note || shortDate(v.createdAt);
        opts.push({ key: `v${v.id}`, group: "Previous versions", label: `${current?.reference ?? ""} · ${note}`.trim(), passageId, audioKey: v.audioKey });
      }
      for (const p of all) {
        if (p.id !== passageId && p.audioKey) {
          opts.push({ key: `p${p.id}`, group: "Other passages", label: p.reference, passageId: p.id, audioKey: p.audioKey });
        }
      }

      setOptions(opts);
      setSelectedKey(opts[0]?.key ?? "");
    })().catch(() => {
      if (!cancelled) setOptions([]);
    });

    return () => {
      cancelled = true;
    };
  }, [open, token, passageId, projectId]);

  const selectedOption = useMemo(
    () => options?.find((o) => o.key === selectedKey) ?? null,
    [options, selectedKey],
  );

  // Resolve the selected option to its blob + pinned version.
  useEffect(() => {
    if (!token || !selectedOption) return;
    const opt = selectedOption;
    let cancelled = false;
    setResolving(true);
    setBlob(null);
    setSource(null);
    setSelection(null);

    (async () => {
      let versions = versionsCache.current.get(opt.passageId);
      if (!versions) {
        versions = (await listPassageVersions(token, opt.passageId)).versions;
        versionsCache.current.set(opt.passageId, versions);
      }
      const match = versions.find((v) => v.audioKey === opt.audioKey);
      const b = match ? await fetchVersionAudio(token, match.id) : null;
      if (cancelled) return;
      setBlob(b);
      if (b && match) setSource({ kind: "version", versionId: match.id });
      setResolving(false);
    })().catch(() => {
      if (!cancelled) setResolving(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, selectedOption]);

  const canLink = !resolving && !linking && blob !== null && source !== null && selection !== null;

  const handleLink = async () => {
    if (!blob || !source || !selection || !selectedOption) return;
    setLinking(true);
    try {
      const clip = await clipAudio(blob, selection.start, selection.end);
      if (clip.size === 0) return;
      onLink(
        { source, label: selectedOption.label, start: selection.start, end: selection.end },
        clip,
      );
      onClose();
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Link audio</DialogTitle>
      <DialogContent>
        {options === null ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : options.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            No audio available to link.
          </Typography>
        ) : (
          <>
            <Select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              size="small"
              fullWidth
              sx={{ mt: 1 }}
            >
              {[...new Set(options.map((o) => o.group))].flatMap((heading) => [
                <ListSubheader key={heading}>{heading}</ListSubheader>,
                ...options
                  .filter((o) => o.group === heading)
                  .map((o) => (
                    <MenuItem key={o.key} value={o.key}>
                      {o.label}
                    </MenuItem>
                  )),
              ])}
            </Select>

            <Box sx={{ mt: 2, minHeight: 96 }}>
              {resolving ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : blob ? (
                <AudioPlayer
                  key={selectedKey}
                  audioSource={blob}
                  height={60}
                  enableZoom
                  enableDragSelection
                  onSelectionChange={(sel) => setSelection(sel)}
                />
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  This source has no linkable audio.
                </Typography>
              )}
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Drag on the waveform to select a range.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleLink} disabled={!canLink}>
          Link
        </Button>
      </DialogActions>
    </Dialog>
  );
}
