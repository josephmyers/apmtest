# Context

A ubiquitous language for this repo — the shared vocabulary we use when talking
about the domain, and how it maps to the code. Speak these words in code,
comments, PRs, and conversation; keep them out of sync at your peril.

This is a living document. It currently covers the **AudioPlayer**,
**Discussions**, and the **Replace step** — replacements and their reuse
lifecycle, versions, renderings, and the draft lifecycle. We'll expand outward
as we go.

## Glossary

### Audio & the player

- **Waveform** — the visual rendering of the audio.
- **Audio** — the sound the player holds and plays. The player is *seeded* with
  an initial audio and then owns a live, editable copy of it; the seed-vs-live
  split (`audioSource` vs `internalAudio`) is implementation, not vocabulary.
  There is just "the audio."
- **AudioPlayer** — an audio *player* first. It *becomes an editor* when its
  editing capabilities are turned on. Every edit affordance is opt-in
  (`showCut`, `showTrash`, `showSilence`, `enableDragSelection`, …).

### Overlays on the waveform

These are distinct concepts. We keep separate words for each — there is no
umbrella term.

- **Selection** — a user-drawn `{ start, end }` span on the waveform. Cleared by
  clicking elsewhere on the player.
  - **Sticky** — *the same concept as a selection, with clearing disabled.* An
    adjective, not a separate noun. Used only in situations where clearing
    wouldn't make sense (e.g. replacement / question dialogs). There is one
    selection slot; a selection is either sticky or not.
- **Highlight** *(presentation)* — a colored span on the waveform meaning
  "something special is here."
- **Replacement** *(domain)* — the thing currently rendered *as* a highlight.
  Only a **used** replacement is — see **Replacements** below for the full entry.
  - A replacement **is shown as** a highlight. A highlight **is not** a
    replacement — highlights are deliberately general so future features can
    reuse them.
- **Marker** — a static point that anchors some piece of non-audio data to a
  place in the audio, where that place is relevant to the data. Today a marker
  anchors a **Q&A group**. Unqualified, **"marker" always means a static
  anchor.**
- **Cursor** *(code)* / **play marker** *(spoken)* — the moving playback
  position. Conceptually it is a kind of marker (a moving one), but in the code
  it is unrelated to markers: `cursor` is a render option; markers are regions.
  We say "play marker" in conversation and `cursor` in code.

### Actions

- **Cut** — splice a selection out of the audio.
- **Insert silence** — add silence at the current position.
- **Reset** — revert to a baseline, discarding everything since. One concept;
  the baseline varies by context. For the AudioPlayer the baseline is *nothing* —
  clear the audio and start over (called `trash` in code, only for the trash-can
  icon; "reset" is the real term). In the Replace step the baseline is the
  replacements of the last rendering, or nothing when there's no rendering — see
  the Versions & renderings section. Loose synonyms: *clear*, *start over*.
- **Jump to (a marker)** — clicking the waveform near a marker (within a grace
  radius) navigates to the data that marker anchors.
- **Play the selection** — pressing play while a selection is active plays only
  that span, then stops and rewinds to the selection's start. It does **not**
  loop. Same concept whether the selection is sticky or a free drag-selection.

### Not vocabulary (implementation only)

These appear in the code but are **not** part of the ubiquitous language — don't
build shared meaning on them:

- `warmingUp` — the brief mic warm-up before recording. Only ever surfaces to a
  user if they ask about the delay.
- `audioManager` / `AudioHandle` — the mechanism behind the single-playback rule.
- Undo's opaque **payload** — the parent's tag-along state on an undo entry. It's
  just "undo."
- wavesurfer **regions** — a library primitive that happens to implement
  selections, highlights, and markers.
- zoom / minimap.

### Discussions

- **Discussion** — a conversation attached to a **passage + step**. Has a topic,
  an optional category, an optional assignee, an Open/Resolved state, and one or
  more messages. ("Thread" is fine as an explanatory synonym in comments — it is
  not a competing term.)
- **Topic** — a discussion's title. It **may pertain to a range** of the passage
  audio; when it does, the range *is* the topic (there's no separate title). A
  discussion is either about a range or about nothing in particular — both are
  just discussions; there's no special name for the two kinds.
- **Topic audio** — the passage audio spanned by a range-pertaining topic, shown
  as the discussion row's auto-preview. Informal alternates: *relevant audio*,
  *discussion audio*. (`clip` / `clipAudio` is implementation, not vocabulary.)
- **Category** — a free-form label on a discussion; *Uncategorized* when blank.
- **Assignee** — the team member a discussion is assigned to; *Unassigned* when
  none.
- **Open / Resolved** — a discussion's state. **Resolve** and **Reopen** move it
  between them; the list hides resolved discussions by default.
- **Unread / read** — per user. A discussion becomes **read** when you expand it.
  "This passage+step has unread discussions" is surfaced upward to drive an
  indicator outside the flyout.
- **Scope** — which passages/steps' discussions are in view. Default scope is
  *this passage + this step*; **All Steps** and **All Passages** widen it.
  Off-scope rows get a recognition-only color and a location line.
- **Message** — one entry in a discussion. It has a **body** (text *or* audio,
  never both) and, optionally, one or more **linked-audio attachments**. So the
  full model is `body + links[]`.
  - **Body** — the message's content: a **text message** *or* an **audio
    message**, never both. An **audio message** is a voice response, thread-style
    (a recording made in the composer).
  - **Linked audio** — an **attachment** (not body): a reference to a **snippet**
    of some *other* audio, pulled in from outside the current context to
    contribute to the discussion. A message can carry several. Distinct from an
    audio message, which is a fresh recording.
  - **Snippet** — the referenced `start–end` range of a link's source.
  - **Link source** — the discriminated reference a link points at
    (`AudioLinkSource`). Currently only `{ kind: "version"; versionId }`;
    designed to extend (replacement / question / answer / message).
  - **Draft link** (in the composer, removable via an X) vs **sent link** (part
    of a saved message, non-removable). Same link, two lifecycle positions.
- **Flyout** — the slide-out pane that hosts Discussions.

### Not vocabulary — Discussions (implementation only)

- `clipAudio` / the `clip` state — produces the topic-audio preview.
- **Composer** (`DiscussionComposer`) — the text-or-audio input widget.
- **RadialAudioPlayer** (a.k.a. single-button / circle audio player) and
  **MiniAudioPlayer** — small preview-player variants.

### Replacements

- **Replacement** — a recording placed at a span of the passage audio, standing
  in for what was there. While **used**, it renders as a **highlight**.
  - **Title** — what the replacement is called. Required.
  - **Note** — a free-text qualifier alongside the title.
  - **Name** — who spoke the recording. Seeded from the passage's **speaker**.
  - `(title, note)` is the de facto identity of a recording — that pair is what
    "the same recording" means in code. Nothing enforces it.
- **Used / unused** — a replacement is **used** when any version includes it;
  **unused** when it's kept rather than deleted with the work that used it (see
  R7). An unused replacement is "technically a replacement, but also kind of
  not."
- **Historical replacement** / **preserved replacement** — the two names for an
  **unused** replacement that was kept rather than deleted. Interchangeable; use
  either. **Not** the same as an *option* — an option is anything the History
  offers to reuse (which includes currently-used originals), whereas these are
  specifically the kept, unused ones.
- **Preserve** — to keep an unused replacement rather than let it be deleted,
  making it a preserved replacement. See R7.
- **History** — the picker of previously-recorded replacements offered when
  adding a replacement. Shows each unique recording once — see R8. Labelled
  **"Previous Replacements"** in the UI; we say *history* in conversation and
  `history*` in code (`historyExpanded`, `hasOpenedHistory`).
- **Original** — marks which recordings are **unique**, so the History isn't
  cluttered with duplicates and near-duplicates. A modified copy of an
  already-used replacement is deliberately **not** original.

### Versions & renderings

- **Version** — a saved take of the passage audio. Either **recorded** (a raw
  take) or **rendered** (produced by the AI from a recorded one). Listed in the
  Versions dialog; the **active** version is the passage's current audio.
- **Rendering** — audio the AI produces by infilling replacements into a
  recording. It genuinely creates new audio at the seams — this is *not* a
  higher-quality splice, it's a different artifact. Expensive: a round-trip to
  the infilling service.
- **Composed audio** — the local splice of replacement audio into the source,
  computed in the browser on every edit. A rough stand-in that shows *where*
  replacements sit, not what the result will sound like. Distinct from a
  rendering, not a draft of one.
  - The two views swap: composed audio carries **highlights** and accepts
    selections; a rendering carries neither. You edit the composition, then
    render it.
- **Render** *(verb)* — to send the source plus its replacements for infilling.
- **Draft rendering** — a rendering that has been produced but not yet saved as
  a version. One per passage. See R10.
- **Use This Version** — commits the draft rendering as a new version, activates
  it, and associates the current replacements with it.
- **Original time** — a position measured in the original recording's timeline,
  as opposed to **composed-audio time**. Because a replacement changes the
  audio's duration, the same instant sits at different offsets in the two
  timelines. Replacement selections are stored in original time (see R9); the
  offset map converts between the two. *(The bare adjective "original" elsewhere
  — the `original` flag, `originalComposedAudio` — is just an adjective on a
  different noun, not this term.)*

### Not vocabulary — Replacements (implementation only)

- `preservedReplacements` / `previousRecordings` / "preserved originals" — three
  code names for one thing: the **History**'s contents.
- `keepOriginals=1` / `keepReplacements` — the flag behind the **Keep replacement
  recordings** checkbox.
- A NULL `selection_start` / `selection_end` — how **unused** is stored. The
  same table holds used and preserved replacements; every endpoint except
  `preserved=1` filters the preserved ones out.
- `unversioned_rendering` / `hasUnversionedRendering` / `storePassageStaged` —
  the storage behind a **draft rendering**. "Unversioned" describes the row, not
  the concept; say *draft rendering*.
- `offsetMap` / `composedToOriginalTime` / `originalToComposedTime` — the
  bookkeeping that maps between composed-audio time and original-recording time,
  since a replacement changes the audio's duration.
- `renderSource` — links a rendered version to the recording it came from, by
  `audioKey` rather than id (same fragility as the R6 aside). See R9.
- `.wav` for renderings vs `.mp3` for recorded versions — a storage detail.

> **Notes.** *Iteration* and *revision* are loose talk, not code terms — say
> **version**. The open hard case is the one posed in a code comment at
> [ReplaceAIPage.tsx:146](src/ReplaceAIPage.tsx#L146): with both a draft
> rendering and edited replacements, unversioned DB writes land immediately, so
> Reset's baseline and the live edits can diverge. Behaviour there is unsettled,
> not just undocumented.

## Rules

### R1 — A replacement is a wall a selection can't cross

A drag-selection is clamped at highlight boundaries: you cannot select across or
into a highlighted span. **Why:** a selection marks *what to replace next*, so
selecting an existing replacement is meaningless.

**Exception:** your own just-edited replacement stays selectable. *Probable*
intent: it helps you relocate yourself after the editing dialog closes. (Marked
probable — this rationale is inferred, not confirmed.)

### R2 — One audio plays at a time

Starting playback in one player pauses whatever else was playing; only a single
player produces sound at once. This is a real invariant to preserve. It has
**no name** in our vocabulary — it's just how playback behaves.

### R3 — A discussion's anchor is derived from its topic string

When a topic parses as a time range (`"1:15.4 – 1:20.0"`), that range becomes the
discussion's anchor into the passage audio, and its topic audio preview appears.
There is no separate anchor field — the topic string *is* the source of truth.
**Why:** if you're pointing at a piece of audio, that's a sufficient topic; you
don't need to name it twice. **By design, but a candidate for improvement** —
editing topic text silently changes or removes the anchor.

### R4 — A message *body* is text or audio, never both

A message's **body** is exactly one of a text body or an audio recording. This
rule governs the body only. **Linked audio is separate** — an attachment carried
alongside the body, not part of it — so a message is `body + links[]`, and a
links-only message (no text/audio body) is invalid.

### R5 — A discussion can't be empty

A discussion always has at least one message; the last remaining message can't be
deleted. The first message has no special name — it's just the first one.

### R6 — Linked audio references a version-pinned, discriminated source

A link stores a **discriminated `AudioLinkSource`** (not a bare `audioKey`), and
it **pins the exact take**: choosing "Current passage" resolves to the passage's
*active version id* at link time and never follows later re-recordings. **Why:**
silently swapping the audio a link points at would be badly confusing — a link
means "*this* audio," always. Extending to a new source kind = add a union
member + a `fetchLinkSourceAudio` resolver case (backed by an existing authorized
fetcher) + a dropdown group.

**Consequence:** because a pinned version can be deleted, a source can become
**unavailable** — resolvers may return null, and players must render a defined
"source unavailable" state rather than spin forever.

> A passage's "active version" is not first-class in the API today; it's
> reconstructed on the client by matching `Passage.audioKey` against the version
> list (relies on `audioKey` being unique per version). Candidate to make the
> server return the active `versionId` directly.

### R7 — An unused replacement is optionally preserved

When a replacement stops being used — the passage was re-recorded, or it was
dropped from the current version — it would *naturally* be deleted along with
the iteration that used it. However, the app OPTIONALLY **preserves** it as a
**preserved replacement**, so it stays available for reuse in a later revision.
Stored by nulling the selection (`keepOriginals=1`): the row survives with its
title, note, name, and audio, minus its placement.

**Why:** *(inferred, not confirmed)* the recording is the expensive part; the
placement is cheap to redo.

**What discarding always costs.** Both **Exit** and **Discard & Exit** drop the
placements *and* every non-original recording — modified copies and duplicate
`(title, note)` rows are deleted outright, audio included. Only one unique
recording per `(title, note)` can survive. Near-duplicates are considered cheap;
losing them is deliberate, and R7's "the recording is the expensive part"
rationale covers unique recordings only.

The two exits differ in exactly one respect: unticking **Keep replacement
recordings** in the Discard-and-exit confirmation
([ReplaceAIPage.tsx:1015](src/ReplaceAIPage.tsx#L1015)) drops the unique
recordings too. That checkbox is the only way to lose them, it defaults to
checked, and it re-checks itself on cancel.

### R8 — The replacement history shows each unique recording once

Only **original** replacements reach the History, and a replacement is original
only when no other recording shares its `(title, note)`. So re-recording or
tweaking an already-used replacement yields a non-original copy that never
appears there. **Why:** the History exists for reuse, and duplicates and
near-duplicates clutter it.

When an original is deleted, a surviving copy is promoted in its place — the
recording stays reusable even though the row that introduced it is gone.

**Scope: a replacement belongs to its passage.** Both reading the History and
promoting a copy on delete are scoped to the current passage, and a recording is
never visible or writable outside it.

*Which copy* gets promoted is deliberately unspecified. Within one passage every
candidate shares the same `(title, note)` — that is what makes them duplicates
under this rule — so any of them is an equally good canonical copy. The
unordered `LIMIT 1` is indifferent, not arbitrary.

> **Team-wide reuse is a candidate improvement.** The same term retranslated in
> another passage is plausibly worth reusing, and sharing across a **team** —
> never further — would be the useful scope. Not implemented; a gap, not a bug.
> It would widen both the History fetch and the promote query together, since a
> recording's identity scope has to be one thing.

### R9 — Replacements always splice into the original recording

Renderings never stack. A rendered version inherits its predecessor's
`renderSource` instead of pointing at it
([ReplaceAIPage.tsx:585](src/ReplaceAIPage.tsx#L585)), and the Replace step
resolves its source audio back through that link
([ReplaceAIPage.tsx:193-194](src/ReplaceAIPage.tsx#L193-L194)). So no matter how
many times a passage has been rendered, replacements are always placed against
the **recorded** version at the root, and each rendering is regenerated from
scratch.

**Why:** re-infilling AI output would compound generation loss — each pass would
degrade audio the previous pass already invented.

**Consequence:** replacement selection coordinates are only ever meaningful in
original-recording time. Anything held in composed-audio time must be mapped
back before it is saved.

### R10 — A draft rendering survives leaving the page

A rendering that hasn't been committed is staged on the passage
(`unversioned_rendering`) rather than discarded. It's **effectively a draft
version, and also a cache** — both readings are correct and neither is the whole
story.

**Why:** renderings are expensive. A user may need to navigate away and come
back to either activate that rendering as a version or adjust the replacements
and render again. Losing it to a stray navigation would cost real time.

There is **one slot per passage**, and activating any version clears it — the
draft only makes sense against the replacements that produced it.

Those producing replacements are the **Reset baseline**: the working set Reset
restores to (`activeReplacements` in code — "not necessarily what's saved in the
DB"). Rendering sets the baseline to the just-rendered set; on load it's the
active version's replacements. So the draft rendering (audio) and the Reset
baseline (replacements) are two facets of one "last rendering" state.
