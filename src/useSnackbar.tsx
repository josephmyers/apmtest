import { useState } from "react";
import { Snackbar } from "@mui/material";

export function useSnackbar() {
  const [snackMsg, setSnackMsg] = useState<string | null>(null);
  const snackbarElement = (
    <Snackbar
      open={!!snackMsg}
      autoHideDuration={3000}
      onClose={() => setSnackMsg(null)}
      message={snackMsg}
    />
  );
  return { setSnackMsg, snackbarElement };
}
