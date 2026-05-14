import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getMe, getTeams, type Team } from "./api";

interface User {
  id: number;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  teams: Team[];
  activeTeam: Team | null;
  activeTeamId: number | null;
  setAuth: (token: string, user: User) => void;
  setActiveTeamId: (id: number | null) => void;
  refreshTeams: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_TEAM_KEY = "activeTeamId";
// Note: localStorage writes don't propagate across tabs without a `storage`
// event listener. Accept that as a v1 limitation.

function readActiveTeamIdFromStorage(): number | null {
  const raw = localStorage.getItem(ACTIVE_TEAM_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamIdState] = useState<number | null>(() =>
    readActiveTeamIdFromStorage(),
  );

  const persistActiveTeamId = useCallback((id: number | null) => {
    if (id == null) {
      localStorage.removeItem(ACTIVE_TEAM_KEY);
    } else {
      localStorage.setItem(ACTIVE_TEAM_KEY, String(id));
    }
    setActiveTeamIdState(id);
  }, []);

  // Apply the default-active-team rule: keep the stored id if it's still
  // valid; otherwise fall back to the user's first team (or null).
  const reconcileActiveTeamId = useCallback(
    (loaded: Team[]) => {
      const stored = readActiveTeamIdFromStorage();
      const next =
        stored != null && loaded.some((t) => t.id === stored)
          ? stored
          : loaded[0]?.id ?? null;
      persistActiveTeamId(next);
    },
    [persistActiveTeamId],
  );

  const refreshTeams = useCallback(async () => {
    if (!token) return;
    const { teams: loaded } = await getTeams(token);
    setTeams(loaded);
    reconcileActiveTeamId(loaded);
  }, [token, reconcileActiveTeamId]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setTeams([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const meData = await getMe(token);
        if (cancelled) return;
        setUser(meData.user);
        const { teams: loaded } = await getTeams(token);
        if (cancelled) return;
        setTeams(loaded);
        reconcileActiveTeamId(loaded);
      } catch {
        if (cancelled) return;
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
        setTeams([]);
        persistActiveTeamId(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, reconcileActiveTeamId, persistActiveTeamId]);

  const setAuth = (newToken: string, newUser: User) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem("token");
    persistActiveTeamId(null);
    setToken(null);
    setUser(null);
    setTeams([]);
  };

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  return React.createElement(
    AuthContext.Provider,
    {
      value: {
        user,
        token,
        loading,
        teams,
        activeTeam,
        activeTeamId,
        setAuth,
        setActiveTeamId: persistActiveTeamId,
        refreshTeams,
        logout,
      },
    },
    children,
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
