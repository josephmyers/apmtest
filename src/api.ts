import { clipAudio } from "./audioUtils";

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
  sort_order: number;
  audioKey: string | null;
  unversionedRendering: string | null;
  speaker: string | null;
  current_step: number;
  createdAt: string;
}

export interface Section {
  id: number;
  project_id: number;
  name: string;
  sort_order: number;
  passages: Passage[];
}

export interface ProjectFlags {
  structureEditsAllowed?: boolean;
}

export interface Project {
  id: number;
  name: string;
  flags: ProjectFlags;
  sections: Section[];
}

export interface ProjectSummary {
  id: number;
  name: string;
  teamId: number;
  flags: ProjectFlags;
  sectionCount: number;
}

interface ProjectListResponse {
  projects: ProjectSummary[];
}

interface ProjectDetailResponse {
  project: Project;
}

export interface Team {
  id: number;
  name: string;
}

export interface TeamMember {
  userId: number;
  email: string;
  pending: boolean;
}

export async function signup(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Signup failed");
  return data;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
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

export async function getProjects(
  token: string,
  teamId: number,
): Promise<ProjectListResponse> {
  const res = await fetch(`${API_BASE}/projects?teamId=${teamId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch projects");
  return data;
}

export async function createProject(
  token: string,
  teamId: number,
  name: string,
): Promise<{ project: ProjectSummary }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ teamId, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create project");
  return data;
}

export async function deleteProject(
  token: string,
  projectId: number,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/projects?projectId=${projectId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete project");
  return data;
}

export async function renameProject(
  token: string,
  projectId: number,
  name: string,
): Promise<{ project: { id: number; name: string; teamId: number; flags: ProjectFlags } }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ projectId, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to rename project");
  return data;
}

export async function updateProjectFlags(
  token: string,
  projectId: number,
  flags: ProjectFlags,
): Promise<{ project: { id: number; name: string; teamId: number; flags: ProjectFlags } }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ projectId, flags }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update project flags");
  return data;
}

export async function getTeams(token: string): Promise<{ teams: Team[] }> {
  const res = await fetch(`${API_BASE}/teams`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch teams");
  return data;
}

export async function createTeam(
  token: string,
  name: string,
): Promise<{ team: Team }> {
  const res = await fetch(`${API_BASE}/teams`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create team");
  return data;
}

export async function renameTeam(
  token: string,
  teamId: number,
  name: string,
): Promise<{ team: Team }> {
  const res = await fetch(`${API_BASE}/teams?id=${teamId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to rename team");
  return data;
}

export async function deleteTeam(
  token: string,
  teamId: number,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/teams?id=${teamId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete team");
  return data;
}

export async function getTeamMembers(
  token: string,
  teamId: number,
): Promise<{ members: TeamMember[] }> {
  const res = await fetch(`${API_BASE}/team-members?teamId=${teamId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch team members");
  return data;
}

export async function addTeamMember(
  token: string,
  teamId: number,
  email: string,
): Promise<{ member: TeamMember }> {
  const res = await fetch(`${API_BASE}/team-members?teamId=${teamId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to add team member");
  return data;
}

export async function removeTeamMember(
  token: string,
  teamId: number,
  userId: number,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/team-members?teamId=${teamId}&userId=${userId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to remove team member");
  return data;
}

export async function getProject(
  token: string,
  id: number,
): Promise<ProjectDetailResponse> {
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
  name: string,
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
  sectionId: number,
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
  sortOrder: number,
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

export async function deletePassage(
  token: string,
  passageId: number,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/projects?passageId=${passageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete passage");
  return data;
}

export async function renameSection(
  token: string,
  sectionId: number,
  name: string,
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
  reference: string,
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

export async function setPassageStep(
  token: string,
  passageId: number,
  currentStep: number,
): Promise<{ passage: Passage }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ passageId, currentStep }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update passage step");
  return data;
}

export async function setPassageSpeaker(
  token: string,
  passageId: number,
  speaker: string,
): Promise<{ passage: Passage }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ passageId, speaker }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update passage speaker");
  return data;
}

export async function fetchAudio(
  token: string,
  passageId: number,
): Promise<Blob | null> {
  const res = await fetch(
    `${API_BASE}/passage-versions?passageId=${passageId}&audio=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return await res.blob();
}

export interface Speaker {
  name: string;
}

export async function getSpeakers(
  token: string,
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
): Promise<{ passage: Passage }> {
  const res = await fetch(`${API_BASE}/passage?passageId=${passageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch passage");
  return data;
}

export interface SectionPassage {
  id: number;
  reference: string;
  current_step: number;
}

export async function getSectionPassages(
  token: string,
  passageId: number,
): Promise<{ sectionPassages: SectionPassage[] }> {
  const res = await fetch(`${API_BASE}/section?passageId=${passageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch section passages");
  return data;
}

export interface ReplacementData {
  id: number;
  title: string;
  note: string;
  name: string;
  selectionStart: number;
  selectionEnd: number;
  original: boolean;
  versionId: number | null;
}

//todo duplication
interface Replacement {
  id: number;
  title: string;
  note: string;
  name: string;
  selection: { start: number; end: number };
  audio: Blob;
  original: boolean;
  versionId: number | null;
}

export async function saveReplacement(
  token: string,
  passageId: number,
  title: string,
  note: string,
  name: string,
  selectionStart: number,
  selectionEnd: number,
  audioBlob: Blob,
  original: boolean,
  versionId?: number,
): Promise<{ replacement: ReplacementData }> {
  const params = new URLSearchParams({
    passageId: String(passageId),
    title,
    note,
    name,
    selectionStart: String(selectionStart),
    selectionEnd: String(selectionEnd),
    original: String(original),
  });
  if (versionId !== undefined) params.set("versionId", String(versionId));
  const res = await fetch(`${API_BASE}/replacements?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: audioBlob,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save replacement");
  return data;
}

export async function associateReplacementsWithVersion(
  token: string,
  passageId: number,
  versionId: number,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/replacements?passageId=${passageId}&versionId=${versionId}`,
    { method: "PATCH", headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to associate replacements");
  return data;
}

export async function getReplacements(
  token: string,
  passageId: number,
  versionId?: number | null,
): Promise<Replacement[]> {
  const params = new URLSearchParams({ passageId: String(passageId) });
  if (versionId !== undefined) {
    params.set("versionId", versionId === null ? "null" : String(versionId));
  }
  const res = await fetch(`${API_BASE}/replacements?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as { replacements: ReplacementData[] };
  if (!res.ok) throw new Error("Failed to fetch replacements");
  const replacements = await Promise.all(
    data.replacements.map(async (rd) => {
      const audio = await fetchReplacementAudio(token, rd.id);
      return audio
        ? {
            ...rd,
            selection: { start: rd.selectionStart, end: rd.selectionEnd },
            audio,
            versionId: rd.versionId,
          }
        : null;
    }),
  );
  return replacements.filter((r) => r !== null);
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

export interface Question {
  id: number;
  title: string;
  name: string;
  selectionStart: number;
  selectionEnd: number;
  /** Manual slot within its group; null = natural order. */
  sortOrder: number | null;
  audio: Blob;
}

export async function saveQuestion(
  token: string,
  passageId: number,
  title: string,
  name: string,
  selectionStart: number,
  selectionEnd: number,
  audioBlob: Blob,
): Promise<Question> {
  const params = new URLSearchParams({
    passageId: String(passageId),
    title,
    name,
    selectionStart: String(selectionStart),
    selectionEnd: String(selectionEnd),
  });
  const res = await fetch(`${API_BASE}/questions?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: audioBlob,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save question");
  return { ...data.question, audio: audioBlob };
}

export async function updateQuestion(
  token: string,
  id: number,
  title: string,
  name: string,
  selectionStart: number,
  selectionEnd: number,
  audioBlob: Blob,
): Promise<Question> {
  const params = new URLSearchParams({
    id: String(id),
    title,
    name,
    selectionStart: String(selectionStart),
    selectionEnd: String(selectionEnd),
  });
  const res = await fetch(`${API_BASE}/questions?${params}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: audioBlob,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update question");
  return { ...data.question, audio: audioBlob };
}

export async function deleteQuestion(
  token: string,
  id: number,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/questions?id=${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete question");
  return data;
}

/** Persist a group's order. `ids` are the group's question ids, in order. */
export async function reorderQuestions(
  token: string,
  ids: number[],
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/questions`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to reorder questions");
  return data;
}

export async function getQuestions(
  token: string,
  passageId: number,
): Promise<Question[]> {
  const res = await fetch(
    `${API_BASE}/questions?passageId=${passageId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json()) as {
    questions: Omit<Question, "audio">[];
  };
  if (!res.ok) throw new Error("Failed to fetch questions");
  const questions = await Promise.all(
    data.questions.map(async (q) => {
      const audio = await fetchQuestionAudio(token, q.id);
      return !!audio ? { ...q, audio } : null;
    })
  );
  return questions.filter(q => q !== null);
}

export async function fetchQuestionAudio(
  token: string,
  questionId: number,
): Promise<Blob | null> {
  const res = await fetch(
    `${API_BASE}/questions?id=${questionId}&audio=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return await res.blob();
}

export interface Answer {
  questionId: number;
  speaker: string;
  audio: Blob;
}

export async function getAnswers(
  token: string,
  passageId: number,
): Promise<Answer[]> {
  const res = await fetch(`${API_BASE}/answers?passageId=${passageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as {
    answers: { questionId: number; speaker: string }[];
  };
  if (!res.ok) throw new Error("Failed to fetch answers");
  const answers = await Promise.all(
    data.answers.map(async (a) => {
      const audio = await fetchAnswerAudio(token, a.questionId);
      return !!audio ? { ...a, audio } : null;
    })
  );
  return answers.filter(a => a !== null);
}

/**
 * Save a question's answer. With `audioBlob`, records or replaces the answer
 * (audio + speaker); without it, updates just the speaker of an existing answer.
 */
export async function saveAnswer(
  token: string,
  questionId: number,
  speaker: string,
  audioBlob?: Blob,
): Promise<{ questionId: number; speaker: string }> {
  const params = new URLSearchParams({
    questionId: String(questionId),
    speaker,
  });
  const res = await fetch(`${API_BASE}/answers?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: audioBlob,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save answer");
  return data.answer;
}

/** Clear a question's answer (removes the recording from the question). */
export async function deleteAnswer(
  token: string,
  questionId: number,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/answers?questionId=${questionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete answer");
  return data;
}

export async function fetchAnswerAudio(
  token: string,
  questionId: number,
): Promise<Blob | null> {
  const res = await fetch(
    `${API_BASE}/answers?questionId=${questionId}&audio=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return await res.blob();
}

export async function deleteUnversionedReplacements(
  token: string,
  passageId: number,
  keepOriginals: boolean = true,
): Promise<{ success: boolean }> {
  const params = new URLSearchParams({ passageId: String(passageId) });
  if (keepOriginals) params.set("keepOriginals", "1");
  const res = await fetch(`${API_BASE}/replacements?${params}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to delete unversioned replacements");
  return data;
}

export async function getPreservedReplacements(
  token: string,
  passageId: number,
): Promise<{ id: number; title: string; note: string; name: string; audio: Blob }[]> {
  const res = await fetch(
    `${API_BASE}/replacements?passageId=${passageId}&preserved=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json() as { replacements: { id: number; title: string; note: string; name: string }[] };
  if (!res.ok) throw new Error("Failed to fetch preserved replacements");
  const replacements = await Promise.all(
    data.replacements.map(async (rd) => {
      const audio = await fetchReplacementAudio(token, rd.id);
      return audio ? { ...rd, audio } : null;
    }),
  );
  return replacements.filter((r) => r !== null);
}

export async function updateReplacement(
  token: string,
  replacementId: number,
  title: string,
  note: string,
  name: string,
  selectionStart: number,
  selectionEnd: number,
  audioBlob?: Blob,
  original?: boolean,
): Promise<{ replacement: ReplacementData }> {
  const params = new URLSearchParams({
    id: String(replacementId),
    title,
    note,
    name,
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

// ─── Discussions ──────────────────────────────────────────────────────────

/**
 * A reference to one linkable audio source. Extend with new kinds as needed;
 * each kind maps to an existing authorized fetcher in fetchLinkSourceAudio().
 */
export type AudioLinkSource =
  | { kind: "version"; versionId: number };
  // future: { kind: "replacement"; replacementId: number }, etc.

/** A reference from a message to a selected range of some other audio. */
export interface MessageAudioLink {
  source: AudioLinkSource;
  label: string;
  start: number;
  end: number;
}

/**
 * Resolve a link to its playable snippet: fetch the source (one case per kind) and
 * clip it to the link's range. Returns null when the source is gone or the clip is
 * empty.
 */
export async function resolveLinkAudio(
  token: string,
  link: MessageAudioLink,
): Promise<Blob | null> {
  const { source, start, end } = link;
  let blob: Blob | null = null;
  switch (source.kind) {
    case "version":
      blob = await fetchVersionAudio(token, source.versionId);
      break;
  }
  if (!blob) return null;
  const clip = await clipAudio(blob, start, end);
  return clip.size > 0 ? clip : null;
}

/** Thread metadata for the list view; messages are fetched separately. */
export interface Discussion {
  id: number;
  passageId: number;
  step: number;
  passageReference: string;
  topic: string;
  category: string;
  assigneeEmail: string | null;
  resolved: boolean;
  unread: boolean;
  createdBy: number;
  createdAt: string;
  messageCount: number;
  lastActivity: string | null;
  expanded?: boolean;
}

export interface DiscussionMessage {
  id: number;
  discussionId: number;
  authorId: number;
  authorEmail: string;
  body: string | null;
  hasAudio: boolean;
  links: MessageAudioLink[];
  createdAt: string;
  audio: Blob | null;
}

/** Text or audio — the two mutually-exclusive forms a message can take. */
export type MessageContent = { text: string } | { audio: Blob };

// Apply the shared message params (links, audio flag) to `params`, and return
// the request headers + body for a text or audio message.
function buildMessageRequest(
  token: string,
  params: URLSearchParams,
  content: MessageContent,
  links: MessageAudioLink[],
): { headers: HeadersInit; body: BodyInit } {
  if (links.length) params.set("links", JSON.stringify(links));
  if ("audio" in content) {
    params.set("audio", "1");
    return { headers: { Authorization: `Bearer ${token}` }, body: content.audio };
  }
  return {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: content.text }),
  };
}

export async function getDiscussions(
  token: string,
  passageId: number,
  step: number,
  opts: { allSteps?: boolean; projectId?: number } = {},
): Promise<Discussion[]> {
  const params = new URLSearchParams({
    passageId: String(passageId),
    step: String(step),
  });
  if (opts.allSteps) params.set("allSteps", "1");
  if (opts.projectId) params.set("projectId", String(opts.projectId));
  const res = await fetch(`${API_BASE}/discussions?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch discussions");
  return data.discussions as Discussion[];
}

export async function createDiscussion(
  token: string,
  passageId: number,
  step: number,
  fields: { topic: string; category: string; assigneeId: number | null },
  content: MessageContent,
  links: MessageAudioLink[] = [],
): Promise<{ discussion: Discussion }> {
  const params = new URLSearchParams({
    passageId: String(passageId),
    step: String(step),
    topic: fields.topic,
    category: fields.category,
  });
  if (fields.assigneeId != null) params.set("assigneeId", String(fields.assigneeId));
  const { headers, body } = buildMessageRequest(token, params, content, links);
  const res = await fetch(`${API_BASE}/discussions?${params}`, { method: "POST", headers, body });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create discussion");
  return data;
}

export async function markDiscussionRead(
  token: string,
  id: number,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/discussions?id=${id}&read=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to mark read");
  return data;
}

export async function updateDiscussion(
  token: string,
  id: number,
  fields: { topic: string; category: string; assigneeId: number | null; resolved: boolean },
): Promise<{ discussion: Discussion }> {
  const params = new URLSearchParams({
    id: String(id),
    topic: fields.topic,
    category: fields.category,
    resolved: fields.resolved ? "1" : "0",
  });
  if (fields.assigneeId != null) params.set("assigneeId", String(fields.assigneeId));
  const res = await fetch(`${API_BASE}/discussions?${params}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update discussion");
  return data;
}

export async function deleteDiscussion(
  token: string,
  id: number,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/discussions?id=${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete discussion");
  return data;
}

export async function fetchDiscussionMessageAudio(
  token: string,
  messageId: number,
): Promise<Blob | null> {
  const res = await fetch(`${API_BASE}/discussion-messages?id=${messageId}&audio=1`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404 || !res.ok) return null;
  return await res.blob();
}

export async function getDiscussionMessages(
  token: string,
  discussionId: number,
): Promise<DiscussionMessage[]> {
  const res = await fetch(
    `${API_BASE}/discussion-messages?discussionId=${discussionId}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch messages");
  const messages = data.messages as Omit<DiscussionMessage, "audio">[];
  return Promise.all(
    messages.map(async (m) => ({
      ...m,
      audio: m.hasAudio ? await fetchDiscussionMessageAudio(token, m.id) : null,
    })),
  );
}

export async function createDiscussionMessage(
  token: string,
  discussionId: number,
  content: MessageContent,
  links: MessageAudioLink[] = [],
): Promise<{ message: DiscussionMessage }> {
  const params = new URLSearchParams({ discussionId: String(discussionId) });
  const { headers, body } = buildMessageRequest(token, params, content, links);
  const res = await fetch(`${API_BASE}/discussion-messages?${params}`, {
    method: "POST",
    headers,
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to post message");
  const audio = "audio" in content ? content.audio : null;
  return { message: { ...data.message, audio } };
}

export async function updateDiscussionMessage(
  token: string,
  id: number,
  content: MessageContent,
  links: MessageAudioLink[] = [],
): Promise<{ message: DiscussionMessage }> {
  const params = new URLSearchParams({ id: String(id) });
  const { headers, body } = buildMessageRequest(token, params, content, links);
  const res = await fetch(`${API_BASE}/discussion-messages?${params}`, {
    method: "PUT",
    headers,
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update message");
  const audio = "audio" in content ? content.audio : null;
  return { message: { ...data.message, audio } };
}

export async function deleteDiscussionMessage(
  token: string,
  id: number,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/discussion-messages?id=${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete message");
  return data;
}

export async function createPassageVersion(
  token: string,
  passageId: number,
  blob: Blob,
  options?: {
    renderSource?: string;
    activate?: boolean;
    speaker?: string;
    note?: string;
  },
): Promise<{ version: PassageVersion }> {
  const params = new URLSearchParams({
    passageId: String(passageId),
  });
  if (options?.renderSource) params.set("renderSource", options.renderSource);
  if (options?.activate === false) params.set("activate", "0");
  if (options?.speaker) params.set("speaker", options.speaker);
  if (options?.note) params.set("note", options.note);
  const res = await fetch(`${API_BASE}/passage-versions?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: blob,
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to create passage version");
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

export async function deletePassageVersion(
  token: string,
  versionId: number,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/passage-versions?id=${versionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete passage version");
  return data;
}

export async function storePassageStaged(
  token: string,
  passageId: number,
  blob: Blob,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/passage?passageId=${passageId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: blob,
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to store staged rendering");
  return data;
}

export async function discardUnversionedRendering(
  token: string,
  passageId: number,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/passage?passageId=${passageId}&discardUnversioned=1`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to discard staged rendering");
  return data;
}

export async function fetchUnversionedRendering(
  token: string,
  passageId: number,
): Promise<Blob | null> {
  const res = await fetch(
    `${API_BASE}/passage?passageId=${passageId}&unversionedAudio=1`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (res.status === 404 || !res.ok) return null;
  const blob = await res.blob();
  if (blob.size === 0) return null;
  return blob;
}

export async function activateVersion(
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

export async function listPassageVersions(
  token: string,
  passageId: number,
): Promise<{ versions: PassageVersion[] }> {
  const res = await fetch(
    `${API_BASE}/passage-versions?passageId=${passageId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Failed to fetch passage versions");
  return data;
}

export async function createSpeaker(
  token: string,
  name: string,
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
