import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions";
import RecordPlugin from "wavesurfer.js/dist/plugins/record";
import ZoomPlugin from "wavesurfer.js/dist/plugins/zoom";
import MinimapPlugin from "wavesurfer.js/dist/plugins/minimap";
import {
  Box,
  CircularProgress,
  IconButton,
  Menu,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopIcon from "@mui/icons-material/Stop";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VoiceOverOffOutlinedIcon from '@mui/icons-material/VoiceOverOffOutlined';
import UndoIcon from "@mui/icons-material/Undo";
import { formatTime } from "./formatTime";
import { useStopwatch } from "./useStopwatch";
import {
  spliceAudio,
  clampSelectionToHighlights,
  insertSilenceAudio,
} from "./audioUtils";
import {
  createWaveformRenderer,
  disableProgressSplit,
} from "./waveformRenderer";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A point-in-time marker on the waveform */
export interface AudioMarker {
  time: number;
  color?: string;
}

export interface AudioPlayerHandle {
  /** Seek to a specific time */
  setTime: (time: number) => void;
  /** The waveform container element (for pixel calculations) */
  container: HTMLDivElement | null;
  /** Start recording from the microphone */
  startRecording: () => Promise<void>;
  /** Stop the active recording */
  stopRecording: () => void;
  /** Push current audio + selection onto the undo stack */
  pushUndo: () => void;
  /** Programmatically set the waveform selection region */
  updateSelection: (sel: { start: number; end: number } | null) => void;
  /** Reset zoom to the default (all the way out) */
  resetZoom: () => void;
}

export interface AudioPlayerProps {
  /** Audio source — either a Blob or a URL string */
  audioSource?: Blob;

  /** Allow user to drag-create a selection on the waveform */
  enableDragSelection?: boolean;
  /** Fired when a marker is clicked (receives the marker's time) */
  onMarkerClick?: (time: number) => void;

  /** WaveSurfer waveColor (default: '#9fc5e8') */
  waveColor?: string;
  /** WaveSurfer progressColor (default: '#9fc5e8') */
  progressColor?: string;
  /** Waveform height in px (default: 80) */
  height?: number;

  /** Custom time display. If omitted, shows "currentTime / duration" (or selection range when active) */
  formatTimeDisplay?: (currentTime: number, duration: number) => string;
  /** Called on every timeupdate */
  onTimeUpdate?: (time: number) => void;
  /** Called when WaveSurfer decodes audio (provides duration) */
  onReady?: (duration: number) => void;
  /** Called when a recording completes (provides the recorded Blob) */
  onRecordingComplete?: (blob: Blob) => void;

  /** Menu items to show in the overflow menu (e.g. <MenuItem> elements) */
  menuItems?: React.ReactNode;

  /** Called when the drag-selection changes (null when cleared) */
  onSelectionChange?: (
    selection: { start: number; end: number } | null,
    source: "user" | "undo",
  ) => void;

  /** Show a Record button instead of Play when no audio is loaded (default: false) */
  showRecordButton?: boolean;
  /** Show a (disabled) cut icon in the controls row (default: false) */
  showCut?: boolean;
  /** Show a trash icon in the controls row (default: false) */
  showTrash?: boolean;
  /** Show a silence icon in the controls row (default: false) */
  showSilence?: boolean;
  /** Show an undo icon in the controls row (default: true) */
  showUndo?: boolean;

  /** Create an unclearable selection region on the waveform */
  stickySelection?: { start: number; end: number };

  /** Stop playback at stickySelection end and seek back to start (default: true) */
  shouldStopAfterStickySelection?: boolean;

  /** Called when the internal audio changes (e.g. recording completed, trash clicked) */
  onAudioChange?: (audio: Blob | null) => void;

  /** Enable mouse-wheel and touch-pinch zoom on the waveform (default: true) */
  enableZoom?: boolean;

  /** Colored regions to highlight on the waveform */
  highlights?: { start: number; end: number; color: string }[];

  /** Children rendered below the waveform (e.g. helper text) */
  children?: React.ReactNode;

  /** Optional label rendered on the top row (after time display) */
  topRowLabel?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  (
    {
      audioSource,
      enableDragSelection = false,
      onMarkerClick,
      waveColor = "#9fc5e8",
      progressColor = "#9fc5e8",
      height = 80,
      formatTimeDisplay,
      onTimeUpdate,
      onReady,
      menuItems: menuItemsProp,
      onSelectionChange,
      showRecordButton = false,
      showCut = false,
      showTrash = false,
      showSilence = false,
      showUndo = true,
      stickySelection,
      shouldStopAfterStickySelection = true,
      onRecordingComplete,
      onAudioChange,
      highlights = [],
      enableZoom = true,
      children,
      topRowLabel,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const minimapContainerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<RegionsPlugin | null>(null);
    const recordRef = useRef<RecordPlugin | null>(null);
    const suppressDecodeRef = useRef(false);
    const dragCleanupRef = useRef<(() => void) | null>(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [warmingUp, setWarmingUp] = useState(false);
    const [internalAudio, setInternalAudio] = useState<Blob | null>(
      audioSource ?? null,
    );
    const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
    const [isZoomed, setIsZoomed] = useState(false);
    const theme = useTheme();
    const isSmallScreen = useMediaQuery(theme.breakpoints.down("md"));
    const isSelectionSticky = !!stickySelection;

    // Undo stack
    interface UndoEntry {
      audio: Blob | null;
      selection: { start: number; end: number } | null;
    }
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const pushUndo = () => {
      setUndoStack((prev) => [...prev, { audio: internalAudio, selection }]);
    };

    const [selection, setSelection] = useState<{
      start: number;
      end: number;
    } | null>(stickySelection ?? null);
    const selectionRef = useRef(selection);
    useEffect(() => {
      selectionRef.current = selection;
    }, [selection]);
    const waveColorRef = useRef(waveColor);
    useEffect(() => {
      waveColorRef.current = waveColor;
    }, [waveColor]);
    const stickySelectionRef = useRef(stickySelection);
    useEffect(() => {
      stickySelectionRef.current = stickySelection;
    }, [stickySelection]);
    const shouldStopAfterStickySelectionRef = useRef(
      shouldStopAfterStickySelection,
    );
    useEffect(() => {
      shouldStopAfterStickySelectionRef.current =
        shouldStopAfterStickySelection;
    }, [shouldStopAfterStickySelection]);
    const highlightsRef = useRef(highlights);
    useEffect(() => {
      highlightsRef.current = highlights;
    }, [highlights]);

    // Stable callback refs so WaveSurfer listeners never go stale
    const onMarkerClickRef = useRef(onMarkerClick);
    const onTimeUpdateRef = useRef(onTimeUpdate);
    const onReadyRef = useRef(onReady);
    useEffect(() => {
      if (audioSource) {
        setInternalAudio(audioSource);
      }
    }, [audioSource]);
    useEffect(() => {
      onMarkerClickRef.current = onMarkerClick;
    }, [onMarkerClick]);
    useEffect(() => {
      onTimeUpdateRef.current = onTimeUpdate;
    }, [onTimeUpdate]);
    useEffect(() => {
      onReadyRef.current = onReady;
    }, [onReady]);
    const onRecordingCompleteRef = useRef(onRecordingComplete);
    useEffect(() => {
      onRecordingCompleteRef.current = onRecordingComplete;
    }, [onRecordingComplete]);
    const onSelectionChangeRef = useRef(onSelectionChange);
    useEffect(() => {
      onSelectionChangeRef.current = onSelectionChange;
    }, [onSelectionChange]);

    // Helper: only fire onSelectionChange when the value actually changed
    const fireSelectionChange = (
      sel: { start: number; end: number } | null,
      source: "user" | "undo",
    ) => {
      const prev = selectionRef.current;
      if (
        prev === sel ||
        (prev && sel && prev.start === sel.start && prev.end === sel.end)
      )
        return;
      onSelectionChangeRef.current?.(sel, source);
    };
    const onAudioChangeRef = useRef(onAudioChange);
    useEffect(() => {
      onAudioChangeRef.current = onAudioChange;
    }, [onAudioChange]);
    const isRecordingRef = useRef(false);
    useEffect(() => {
      isRecordingRef.current = isRecording;
    }, [isRecording]);
    const warmingUpRef = useRef(false);
    useEffect(() => {
      warmingUpRef.current = warmingUp;
    }, [warmingUp]);

    // Fire onAudioChange whenever internalAudio changes (skip the initial render)
    const isFirstRenderRef = useRef(true);
    useEffect(() => {
      if (isFirstRenderRef.current) {
        isFirstRenderRef.current = false;
        return;
      }
      onAudioChangeRef.current?.(internalAudio);
    }, [internalAudio]);

    // Ref to track whether a region add is programmatic
    const programmaticRef = useRef(false);

    // Shared recording helpers (used by both imperative handle and internal UI)
    const startRecording = async () => {
      const rec = recordRef.current;
      if (!rec) return;
      setWarmingUp(true);
      await rec.startMic();
      await new Promise((r) => setTimeout(r, 1250));
      setWarmingUp(false);
      setIsRecording(true);
      await rec.startRecording();
    };
    const stopRecording = () => {
      recordRef.current?.stopRecording();
      setIsRecording(false);
    };

    // Imperative handle
    useImperativeHandle(ref, () => ({
      setTime: (t: number) => wsRef.current?.setTime(t),
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      get container() {
        return containerRef.current;
      },
      startRecording,
      stopRecording,
      pushUndo,
      updateSelection: (sel: { start: number; end: number } | null) => {
        const rp = regionsRef.current;
        if (rp) {
          rp.getRegions().forEach((r) => {
            if (r.start !== r.end) r.remove();
          });
          if (sel) {
            programmaticRef.current = true;
            rp.addRegion({ start: sel.start, end: sel.end });
            programmaticRef.current = false;
            wsRef.current?.setTime(sel.start);
          }
        }
        setSelection(sel);
        fireSelectionChange(sel, "user");
      },
      resetZoom: () => {
        const ws = wsRef.current;
        if (ws) ws.zoom(1);
      },
    }));

    /* ----- Init WaveSurfer ----- */
    useEffect(() => {
      if (!containerRef.current) return;

      const wsRegions = RegionsPlugin.create();
      regionsRef.current = wsRegions;

      const plugins: Array<RegionsPlugin | ZoomPlugin> = [wsRegions];
      if (enableZoom) {
        plugins.push(
          ZoomPlugin.create({
            scale: 0.5,
            maxZoom: 500,
            deltaThreshold: 5,
            exponentialZooming: true,
            iterations: 20,
          }),
        );
      }

      const wsOptions = {
        container: containerRef.current,
        waveColor,
        progressColor,
        cursorColor: "#333",
        cursorWidth: 4,
        barWidth: 2,
        height,
        normalize: false,
        plugins,
        hideScrollbar: isSmallScreen
      };

      const renderFunction = createWaveformRenderer(
        {
          waveColor: waveColorRef,
          ws: wsRef,
          highlights: highlightsRef,
        },
        wsOptions,
      );

      const ws = WaveSurfer.create({ ...wsOptions, renderFunction });
      wsRef.current = ws;

      disableProgressSplit(ws);

      const record = ws.registerPlugin(
        RecordPlugin.create({
          scrollingWaveform: true,
          renderRecordedAudio: true,
        }),
      );
      recordRef.current = record;

      record.on("record-end", (blob: Blob) => {
        setInternalAudio(blob);
        setUndoStack([]);
        onRecordingCompleteRef.current?.(blob);
      });

      if (enableZoom && minimapContainerRef.current) {
        ws.registerPlugin(
          MinimapPlugin.create({
            container: minimapContainerRef.current,
            height: 12,
            waveColor: "#dddddd",
            progressColor: "#dddddd",
            cursorWidth: 0,
            overlayColor: "#c4c4c448",
          }),
        );
      }

      ws.on("zoom", () => {
        requestAnimationFrame(() => {
          const wrapper = wsRef.current?.getWrapper();
          setIsZoomed(wrapper?.parentElement?.scrollWidth! > wrapper?.parentElement?.clientWidth! + 1);
        });
      });

      const container = containerRef.current!;
      if (enableDragSelection) {
        dragCleanupRef.current = wsRegions.enableDragSelection({});

        // Work around a bug in wavesurfer's createDragStream: multi-touch leaves
        // stale entries in its activePointers map, permanently breaking drag selection.
        // Re-initialize drag selection after each pinch gesture to reset the state.
        let wasPinching = false;
        const onTouchStart = (e: TouchEvent) => {
          if (e.touches.length >= 2) wasPinching = true;
        };
        const onTouchEnd = (e: TouchEvent) => {
          if (wasPinching && e.touches.length === 0) {
            wasPinching = false;
            dragCleanupRef.current?.();
            dragCleanupRef.current = wsRegions.enableDragSelection({});
          }
        };
        container.addEventListener("touchstart", onTouchStart, {
          passive: true,
        });
        container.addEventListener("touchend", onTouchEnd, { passive: true });
      }

      // --- Real-time highlight clamping ---
      wsRegions.on("region-initialized", (region) => {
        region.on("update", (side) => {
          if (region.start === region.end) return; // marker
          const hl = highlightsRef.current;
          if (!hl.length) return;

          const mode =
            side === "start" ? "start" : side === "end" ? "end" : "pan";
          const userSelection = selectionRef.current;
          //filter out when the selection is highlighted (e.g. replacement dialog)
          const filtered = userSelection
            ? hl.filter((h) => h.start >= userSelection.end || h.end <= userSelection.start)
            : hl;
          const clamped = clampSelectionToHighlights(
            { start: region.start, end: region.end },
            filtered,
            mode,
            userSelection,
          );

          if (!clamped) {
            const prev = selectionRef.current;
            if (prev)
              region.setOptions({ start: prev.start, end: prev.end });
            else region.remove();
            return;
          }
          if (
            clamped.start !== region.start ||
            clamped.end !== region.end
          ) {
            region.setOptions({
              start: clamped.start,
              end: clamped.end,
            });
          }
        });
      });

      // --- Region events (drag-selection) ---
      wsRegions.on("region-created", (region) => {
        if (region.start === region.end) return; // marker, ignore
        if (programmaticRef.current) return;

        // Remove other non-marker regions (single-selection mode)
        wsRegions.getRegions().forEach((r) => {
          if (r.id !== region.id && r.start !== r.end) r.remove();
        });
        const sel = { start: region.start, end: region.end };
        setSelection(sel);
        fireSelectionChange(sel, "user");
        ws.setTime(region.start);
      });

      wsRegions.on("region-updated", (region) => {
        if (region.start === region.end) return;
        const sel = { start: region.start, end: region.end };
        setSelection(sel);
        fireSelectionChange(sel, "user");
        ws.setTime(region.start);
      });

      wsRegions.on("region-clicked", (region, e) => {
        if (region.start !== region.end) {
          e.stopPropagation();
        }
      });

      // --- Waveform click ---
      ws.on("click", (relativeX) => {
        const waveformWidth = containerRef.current?.clientWidth || 1;
        const audioDuration = ws.getDuration() || 1;
        const clickTime = relativeX * audioDuration;
        const TOLERANCE_PX = 4;
        const toleranceSec = (TOLERANCE_PX / waveformWidth) * audioDuration;

        // Check if click is near a marker
        const clickedMarker = wsRegions
          .getRegions()
          .find(
            (r) =>
              r.start === r.end &&
              Math.abs(clickTime - r.start) <= toleranceSec,
          );
        if (clickedMarker) {
          onMarkerClickRef.current?.(clickedMarker.start);
        } else if (!isSelectionSticky) {
          // Clear selection regions (but not when initialSelection is set)
          wsRegions.getRegions().forEach((r) => {
            if (r.start !== r.end) r.remove();
          });
          setSelection(null);
          fireSelectionChange(null, "user");
        }
      });

      // --- Playback events ---
      ws.on("timeupdate", (time) => {
        setCurrentTime(time);
        onTimeUpdateRef.current?.(time);
        // Stop playback at sticky/regular selection end and seek back to start.
        const sel =
          shouldStopAfterStickySelectionRef.current && stickySelectionRef.current
            ? stickySelectionRef.current
            : enableDragSelection
              ? selectionRef.current
              : null;
        if (
          ws.isPlaying() &&
          sel &&
          sel.start !== sel.end &&
          time >= sel.end
        ) {
          ws.pause();
          ws.setTime(sel.start);
          setCurrentTime(sel.start);
          setPlaying(false);
        }
      });
      ws.on("decode", (d) => {
        if (suppressDecodeRef.current) {
          suppressDecodeRef.current = false;
          return;
        }
        if (isRecordingRef.current || warmingUpRef.current) return;
        setDuration(d);
        onReadyRef.current?.(d);

        if (!regionsRef.current) return;

        // Clear any pre-existing regions
        regionsRef.current.getRegions().forEach((r) => {
          if (r.start !== r.end) r.remove();
        });

        const prevSelection = selectionRef.current;
        if (prevSelection && prevSelection.start !== prevSelection.end) {
          programmaticRef.current = true;
          regionsRef.current.addRegion({
            start: prevSelection.start,
            end: prevSelection.end,
          });
          programmaticRef.current = false;
          ws.setTime(prevSelection.start);
        }
      });
      ws.on("finish", () => setPlaying(false));

      return () => {
        dragCleanupRef.current?.();
        ws.destroy();
        wsRef.current = null;
        regionsRef.current = null;
        recordRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ----- Sync audio source ----- */
    useEffect(() => {
      const ws = wsRef.current;
      if (!ws || !internalAudio) return;
      // Restore cursor visibility (may have been hidden by trash)
      ws.setOptions({ cursorWidth: 4 });
      const url = URL.createObjectURL(internalAudio);
      ws.load(url);
      return () => URL.revokeObjectURL(url);
    }, [internalAudio]);

    /* ----- Sync initial selection → RegionsPlugin ----- */
    useEffect(() => {
      const rp = regionsRef.current;
      if (!rp || !stickySelection) return;
      // Clear existing non-marker regions
      rp.getRegions().forEach((r) => {
        if (r.start !== r.end) r.remove();
      });
      programmaticRef.current = true;
      rp.addRegion({
        id: "initial-selection",
        start: stickySelection.start,
        end: stickySelection.end,
      });
      programmaticRef.current = false;
      setSelection({
        start: stickySelection.start,
        end: stickySelection.end,
      });
      wsRef.current?.setTime(stickySelection.start);
    }, [stickySelection]);

    /* ----- Re-render waveform when highlights change ----- */
    useEffect(() => {
      const ws = wsRef.current;
      if (!ws || !duration) return;
      ws.setOptions({});
    }, [selection, duration, waveColor, highlights]);

    // Drive `duration` from a stopwatch while recording
    useStopwatch(isRecording, (t) => setDuration(t));

    /* ----- Sync play state ----- */
    useEffect(() => {
      const ws = wsRef.current;
      if (!ws) return;
      playing ? ws.play() : ws.pause();
    }, [playing]);

    /* ----- Render ----- */
    const hasLoadedAudio = duration > 0;

    const handlePlayToggle = () => setPlaying((p) => !p);

    const handleStartRec = async () => {
      try {
        await startRecording();
      } catch {
        setWarmingUp(false);
        setIsRecording(false);
      }
    };
    const handleStopRec = () => stopRecording();
    const handleUndo = () => {
      const stack = [...undoStack];
      const entry = stack.pop();
      if (!entry) return;
      setUndoStack(stack);
      setInternalAudio(entry.audio);
      setSelection(entry.selection);
      fireSelectionChange(entry.selection, "undo");
    };
    const handleCutClick = async () => {
      if (!internalAudio || !selection) return;
      pushUndo();
      const cutStart = selection.start;
      try {
        const spliced = await spliceAudio(
          internalAudio,
          selection.start,
          selection.end,
        );
        // Clear selection and regions before loading new audio
        setSelection(null);
        fireSelectionChange(null, "user");
        regionsRef.current?.getRegions().forEach((r) => {
          if (r.start !== r.end) r.remove();
        });
        setInternalAudio(spliced);
        wsRef.current?.setTime(cutStart);
      } catch {
        // Splice failed — leave audio unchanged
      }
    };
    const handleTrashClick = () => {
      pushUndo();
      setInternalAudio(null);
      const ws = wsRef.current;
      if (ws) {
        suppressDecodeRef.current = true;
        ws.empty();
        ws.setOptions({ cursorWidth: 0 });
      }
      setDuration(0);
      setCurrentTime(0);
      setPlaying(false);
      setSelection(null);
    };
    const handleInsertSilenceClick = async () => {
      if (!internalAudio) return;
      pushUndo();
      const withSilence = await insertSilenceAudio(internalAudio, currentTime, 0.5);
      setInternalAudio(withSilence);
      wsRef.current?.setTime(currentTime);
    };

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
      setMenuAnchorEl(event.currentTarget);
    };
    const handleMenuClose = () => {
      setMenuAnchorEl(null);
    };
    const isMenuOpen = Boolean(menuAnchorEl);
    const hasMenu = React.Children.count(menuItemsProp) > 0;

    const timeText = formatTimeDisplay
      ? formatTimeDisplay(currentTime, duration)
      : selection
        ? `${formatTime(selection.start)} - ${formatTime(selection.end)}`
        : `${formatTime(currentTime)} / ${formatTime(duration || 0)}`;

    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={0}>
          {/* Left button: Record/Stop when showRecordButton and no audio (or warming up / actively recording), otherwise Play/Pause */}
          {showRecordButton && (!hasLoadedAudio || isRecording || warmingUp) ? (
            warmingUp ? (
              <IconButton disabled sx={{ p: 0 }} aria-label="warming up">
                <CircularProgress size={24} />
              </IconButton>
            ) : isRecording ? (
              <IconButton
                onClick={handleStopRec}
                sx={{ p: 0 }}
                aria-label="stop recording"
              >
                <StopIcon fontSize="large" sx={{ color: "error.main" }} />
              </IconButton>
            ) : (
              <IconButton
                onClick={handleStartRec}
                sx={{ p: 0 }}
                aria-label="start recording"
              >
                <FiberManualRecordIcon
                  fontSize="large"
                  sx={{ color: "error.main" }}
                />
              </IconButton>
            )
          ) : (
            <IconButton
              onClick={handlePlayToggle}
              disabled={!hasLoadedAudio}
              sx={{ p: 0 }}
              aria-label={playing ? "pause" : "play"}
            >
              {playing ? (
                <PauseIcon fontSize="large" sx={{ color: "neutral.main" }} />
              ) : (
                <PlayArrowIcon fontSize="large" />
              )}
            </IconButton>
          )}
          <Typography variant="body2" sx={{ ml: "12px !important" }}>
            {timeText}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {topRowLabel}
          {showUndo && undoStack.length > 0 && (
            <IconButton
              disabled={undoStack.length === 0}
              size="small"
              aria-label="undo"
              sx={{ ml: "12px !important" }}
              onClick={handleUndo}
            >
              <UndoIcon fontSize="small" />
            </IconButton>
          )}
          {showCut && (
            <IconButton
              disabled={!selection}
              size="small"
              aria-label="cut"
              sx={{ ml: "12px !important" }}
              onClick={handleCutClick}
            >
              <ContentCutIcon fontSize="small" />
            </IconButton>
          )}
          {showSilence && (
            <IconButton
              disabled={!hasLoadedAudio || isRecording || warmingUp}
              size="small"
              aria-label="insert silence"
              sx={{ ml: "12px !important" }}
              onClick={handleInsertSilenceClick}
            >
              <VoiceOverOffOutlinedIcon fontSize="small" />
            </IconButton>
          )}
          {showTrash && (
            <IconButton
              disabled={!hasLoadedAudio || isRecording || warmingUp}
              size="small"
              aria-label="delete recording"
              sx={{ ml: "12px !important" }}
              onClick={handleTrashClick}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          )}
          {hasMenu && (
            <IconButton onClick={handleMenuOpen}>
              <MoreVertIcon />
            </IconButton>
          )}
        </Stack>

        {hasMenu && (
          <Menu
            anchorEl={menuAnchorEl}
            open={isMenuOpen}
            onClose={handleMenuClose}
          >
            {menuItemsProp}
          </Menu>
        )}

        <Box
          ref={containerRef}
          aria-label="Waveform"
          sx={{
            minHeight: height,
            bgcolor: "action.hover",
            mt: 1,
            borderRadius: 1,
            overflow: "hidden",
            width: "100%",
          }}
        />
        {enableZoom && (
          <Box
            ref={minimapContainerRef}
            sx={{
              height: { xs: 12, sm: 0 },
              overflow: "hidden",
              opacity: isZoomed ? 1 : 0,
            }}
          />
        )}
        {children}
      </Box>
    );
  },
);

AudioPlayer.displayName = "AudioPlayer";
