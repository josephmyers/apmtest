const API_BASE = "/.netlify/functions";

interface AuthResponse {
  token: string;
  user: { id: number; email: string };
}

interface MeResponse {
  user: { id: number; email: string };
}

export interface Passage {
  id: number;
  sectionId: number;
  reference: string;
  description: string;
  sortOrder: number;
  audioKey: string | null;
  speaker: string | null;
  createdAt: string;
}

export interface Section {
  id: number;
  project_id: number;
  name: string;
  sort_order: number;
  passages: Passage[];
}

export interface Project {
  id: number;
  name: string;
  sections: Section[];
}

interface ProjectListResponse {
  projects: { id: number; name: string }[];
}

interface ProjectDetailResponse {
  project: Project;
}

export async function signup(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Signup failed");
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");
  return data;
}

export async function getMe(token: string): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Unauthorized");
  return data;
}

export async function getProjects(token: string): Promise<ProjectListResponse> {
  const res = await fetch(`${API_BASE}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch projects");
  return data;
}

export async function getProject(token: string, id: number): Promise<ProjectDetailResponse> {
  const res = await fetch(`${API_BASE}/projects?id=${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch project");
  return data;
}

export async function createSection(
  token: string,
  projectId: number,
  name: string
): Promise<{ section: Section }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ projectId, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create section");
  return data;
}

export async function deleteSection(
  token: string,
  sectionId: number
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/projects?sectionId=${sectionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete section");
  return data;
}

export async function createPassage(
  token: string,
  sectionId: number,
  reference: string,
  sortOrder: number
): Promise<{ passage: Passage }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sectionId, reference, sortOrder }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create passage");
  return data;
}

export async function renameSection(
  token: string,
  sectionId: number,
  name: string
): Promise<{ section: Section }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sectionId, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to rename section");
  return data;
}

export async function renamePassage(
  token: string,
  passageId: number,
  reference: string
): Promise<{ passage: Passage }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ passageId, reference }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to rename passage");
  return data;
}

export async function uploadAudio(
  token: string,
  passageId: number,
  mp3Blob: Blob,
  speaker: string
): Promise<{ success: boolean; audioKey: string }> {
  const params = new URLSearchParams({ passageId: String(passageId) });
  if (speaker) params.set("speaker", speaker);
  const res = await fetch(`${API_BASE}/audio?${params}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: mp3Blob,
  });
  if (!res.ok) {
    // Netlify may return plain text "Internal Error" for oversized payloads
    const text = await res.text();
    let message = "Failed to upload audio";
    try {
      const json = JSON.parse(text);
      message = json.error || message;
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }
  return await res.json();
}

export function getAudioUrl(passageId: number): string {
  return `${API_BASE}/audio?passageId=${passageId}`;
}

export async function fetchAudio(
  token: string,
  passageId: number
): Promise<Blob | null> {
  const res = await fetch(`${API_BASE}/audio?passageId=${passageId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return await res.blob();
}

export interface Speaker {
  name: string;
}

export async function getSpeakers(
  token: string
): Promise<{ speakers: Speaker[] }> {
  const res = await fetch(`${API_BASE}/speakers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch speakers");
  return data;
}

export async function getPassage(
  token: string,
  passageId: number,
): Promise<{ passage: Passage}> {
  const res = await fetch(`${API_BASE}/passage?passageId=${passageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch passage");
  return data;
}

export interface ReplacementData {
  id: number;
  title: string;
  note: string;
  selectionStart: number;
  selectionEnd: number;
  original: boolean;
}

export async function saveReplacement(
  token: string,
  passageId: number,
  title: string,
  note: string,
  selectionStart: number,
  selectionEnd: number,
  audioBlob: Blob,
  original: boolean,
): Promise<{ replacement: ReplacementData }> {
  const params = new URLSearchParams({
    passageId: String(passageId),
    title,
    note,
    selectionStart: String(selectionStart),
    selectionEnd: String(selectionEnd),
    original: String(original),
  });
  const res = await fetch(`${API_BASE}/replacements?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: audioBlob,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save replacement");
  return data;
}

export async function getReplacements(
  token: string,
  passageId: number,
): Promise<{ replacements: ReplacementData[] }> {
  const res = await fetch(`${API_BASE}/replacements?passageId=${passageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch replacements");
  return data;
}

export async function fetchReplacementAudio(
  token: string,
  replacementId: number,
): Promise<Blob | null> {
  const res = await fetch(
    `${API_BASE}/replacements?id=${replacementId}&audio=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return await res.blob();
}

export async function deleteReplacement(
  token: string,
  replacementId: number,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/replacements?id=${replacementId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete replacement");
  return data;
}

export async function updateReplacement(
  token: string,
  replacementId: number,
  title: string,
  note: string,
  selectionStart: number,
  selectionEnd: number,
  audioBlob?: Blob,
  original?: boolean,
): Promise<{ replacement: ReplacementData }> {
  const params = new URLSearchParams({
    id: String(replacementId),
    title,
    note,
    selectionStart: String(selectionStart),
    selectionEnd: String(selectionEnd),
  });
  if (original !== undefined) {
    params.set("original", String(original));
  }
  const res = await fetch(`${API_BASE}/replacements?${params}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: audioBlob ?? new Blob(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update replacement");
  return data;
}

export interface PassageVersion {
  id: number;
  passageId: number;
  audioKey: string;
  renderSource: string | null;
  note: string;
  createdAt: string;
}

export async function createPassageVersion(
  token: string,
  passageId: number,
  blob: Blob,
  options?: {
    renderSource?: boolean;
    activate?: boolean;
  },
): Promise<{ version: PassageVersion }> {
  const params = new URLSearchParams({
    passageId: String(passageId),
  });
  // Pass renderSource="" to signal "auto-populate from current passage audio_key"
  if (options?.renderSource) params.set("renderSource", "");
  if (options?.activate === false) params.set("activate", "0");
  const res = await fetch(`${API_BASE}/passage-versions?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: blob,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create passage version");
  return data;
}

export async function activatePassageVersion(
  token: string,
  versionId: number,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/passage-versions?id=${versionId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to activate version");
  return data;
}

export async function fetchVersionAudio(
  token: string,
  versionId: number,
): Promise<Blob | null> {
  const res = await fetch(
    `${API_BASE}/passage-versions?id=${versionId}&audio=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (res.status === 404 || !res.ok) return null;
  return await res.blob();
}

export async function listPassageVersions(
  token: string,
  passageId: number,
): Promise<{ versions: PassageVersion[] }> {
  const res = await fetch(`${API_BASE}/passage-versions?passageId=${passageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch passage versions");
  return data;
}

export async function createSpeaker(
  token: string,
  name: string
): Promise<{ speaker: Speaker }> {
  const res = await fetch(`${API_BASE}/speakers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create speaker");
  return data;
}
