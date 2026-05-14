import React from "react";
import { AppBar, Box, IconButton, Toolbar, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { useAuth } from "./AuthContext";
import appIcon from "./assets/icon.png";

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
  children,
}: PageHeaderProps) {
  const { user, logout } = useAuth();

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
          onClick={logout}
          title={user?.email ? `Logout ${user.email}` : "Logout"}
        >
          <AccountCircleIcon />
        </IconButton>
      </Toolbar>
      {children}
    </AppBar>
  );
}
