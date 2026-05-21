import React, { useState } from "react";
import { AppBar, Box, IconButton, Menu, MenuItem, Toolbar, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { useAuth } from "./AuthContext";
import appIcon from "./assets/icon.png";
import Racetrack from "./Racetrack";

interface PageHeaderProps {
  title: string;
  /** Left icon: app logo (root-ish pages) or back arrow (work-step pages). */
  leftIcon: "back" | "logo";
  /** Click handler for the left icon. Logo may be inert (omit to disable). */
  onLeftClick?: () => void;
  /** Optional extra adornment to the right of the left icon (e.g. team members button). */
  leftExtra?: React.ReactNode;
  /** Custom action(s) prepended before the default Help + Account icons. */
  rightActions?: React.ReactNode;
  /** Dims the header and disables interaction (e.g. Dashboard's add-passage mode). */
  disabled?: boolean;
  /** When true, renders the step racetrack below the toolbar (step pages). */
  racetrack?: boolean;
  /** Extra content rendered inside the AppBar below the toolbar. */
  children?: React.ReactNode;
}

export default function PageHeader({
  title,
  leftIcon,
  onLeftClick,
  leftExtra,
  rightActions,
  disabled,
  racetrack,
  children,
}: PageHeaderProps) {
  const { user, logout } = useAuth();
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);

  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="default"
      sx={{
        bgcolor: "#eee",
        borderBottom: 1,
        borderColor: "divider",
        ...(disabled && { pointerEvents: "none", opacity: 0.5 }),
      }}
    >
      <Toolbar sx={{ gap: 1 }}>
        {leftIcon === "back" ? (
          <IconButton size="small" onClick={onLeftClick}>
            <ArrowBackIcon />
          </IconButton>
        ) : (
          <Box
            component="img"
            src={appIcon}
            alt="App icon"
            onClick={onLeftClick}
            sx={{
              width: 32,
              height: 32,
              cursor: onLeftClick ? "pointer" : "default",
            }}
          />
        )}
        <Typography variant="h6" sx={{ fontWeight: 600, ml: "6px" }}>
          {title}
        </Typography>
        <Box sx={{ flexGrow: 1 }}>
          {leftExtra}
        </Box>
        {rightActions}
        <IconButton size="small">
          <HelpOutlineIcon />
        </IconButton>
        <IconButton
          size="small"
          onClick={(e) => setAccountAnchor(e.currentTarget)}
        >
          <AccountCircleIcon />
        </IconButton>
        <Menu
          anchorEl={accountAnchor}
          open={Boolean(accountAnchor)}
          onClose={() => setAccountAnchor(null)}
        >
          <MenuItem disabled>{user?.email!}</MenuItem>
          <MenuItem onClick={() => { setAccountAnchor(null); logout(); }}>Log Out</MenuItem>
        </Menu>
      </Toolbar>
      {racetrack && <Racetrack />}
      {children}
    </AppBar>
  );
}
