import { Avatar } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";

/** First two characters of an email, upper-cased */
export function emailInitials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

interface EmailAvatarProps {
  email: string;
  size?: number;
  sx?: SxProps<Theme>;
}

export default function EmailAvatar({ email, size = 24, sx }: EmailAvatarProps) {
  return (
    <Avatar
      sx={[
        { width: size, height: size, fontSize: size * 0.45 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {emailInitials(email)}
    </Avatar>
  );
}
