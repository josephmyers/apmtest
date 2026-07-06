import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { resolveLinkAudio, type MessageAudioLink } from "./api";

/**
 * Resolve linked-audio references to their playable snippets. Returns `null` while a
 * batch is still resolving, otherwise a Blob-or-null per link (null = source gone).
 * The one path both draft chips and sent messages use to turn links into audio.
 */
export function useResolvedLinks(links: MessageAudioLink[]): (Blob | null)[] | null {
  const { token } = useAuth();
  const [clips, setClips] = useState<(Blob | null)[] | null>(null);

  useEffect(() => {
    if (!token || links.length === 0) {
      setClips([]);
      return;
    }
    let cancelled = false;
    setClips(null);
    Promise.all(links.map((l) => resolveLinkAudio(token, l)))
      .then((cs) => {
        if (!cancelled) setClips(cs);
      })
      .catch(() => {
        if (!cancelled) setClips(links.map(() => null));
      });
    return () => {
      cancelled = true;
    };
  }, [links, token]);

  return clips;
}
