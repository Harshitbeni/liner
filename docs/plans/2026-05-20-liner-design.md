# Liner — Outline-First Agent Task System

## Product thesis

**Liner** is a **personal agent outliner** (not Linear parity): unlimited nested points, identical attributes on every node, one **comments-first thread** per point, and a **harness** that coordinates parent/child agents.

**Foundation:** craft-agents-oss — agent runtime, sessions (JSONL), skills, RPC. **Packaging:** **Electron desktop** (same class of experience as Craft’s electron app), with Liner’s outline UI in the renderer and Craft server in the main process.

**Decision:** Thin domain layer (`packages/liner-core`) + **custom Electron app** (`apps/liner-electron`) — not a fork of Craft’s inbox UI, but same desktop stack.

**Deferred (v1):** `reminderAt`, `dueAt`, team features, notification server.

---

## Scope

**Personal outliner** — single user, local workspace, agent-assisted task trees. No assignees, cycles, or multi-tenant sync in v1.

---

## Core data model

### Uniform `Point`

| Field | Purpose |
|-------|---------|
| `task` | Short title (outline row) |
| `description` | **Plan** — agent-authored markdown; human-editable |
| `notes` | Human scratchpad (optional, separate from plan) |
| `state` | See state machine below |
| `priority` | `none \| low \| medium \| high \| urgent` |
| `areaId` | Area grouping |
| `sessionId` | 1:1 Craft session = **the only thread** |
| `childIds` | Ordered fractal children |
| `meta` | Extensible bag |

No `reminderAt` / `dueAt` in v1 schema.

### `Area` (project header)

- `id`, `name`, `description` (human + agent context), optional `icon`, `sortOrder`
- UI: area switcher + collapsible description above task tree

### Persistence

**SQLite** at `~/.liner/workspaces/{workspaceId}/liner.db` via `bun:sqlite` in `liner-core`.

Craft session JSONL remains canonical for message content; SQLite holds outline structure, state, `sessionId` mapping, harness metadata.

### Single thread

One Craft `sessionId` per point. **Comments-first** UI — chronological cards; tool detail collapsed in agent cards. Plan is a **pinned panel** above the thread.

**Quote-from-plan:** Select plan text → “Quote in reply” → blockquote prepended to next outbound message.

---

## Point state machine

| State | Meaning |
|-------|---------|
| `backlog` | Captured; human promotes to `todo` |
| `todo` | Ready for plan |
| `needs-review` | Plan exists; human reviews |
| `in-progress` | Agent executing |
| `waiting` | Parent only — blocked on children |
| `done` | Work complete; reopenable |
| `shipped` | Human confirmed landed — terminal success |
| `cancelled` | Discard — terminal failure |

**Parent with children:** Any child not `shipped`/`cancelled` → parent `waiting`. All terminal → parent unblocks to `todo` or `needs-review`.

---

## Agent harness — two phases

### Phase A: Plan review

When a **child** hits `needs-review`, parent plan-review runs (default for parents with children). Verdict `approved | changes_requested` — advisory unless strict plan gate enabled.

### Phase B: Completion verification

When **all children** are `shipped` or `cancelled`, parent agent verifies outcomes → parent `done` or back to `in-progress` with gaps.

---

## Mentions and skills

`@subagent` (8 agents) and `/skill-name` → `[subagent:id]` / `[skill:name]` on send. Surfaces: thread, plan, area description.

---

## Screens

| Screen | Behavior |
|--------|----------|
| Area List | Switcher + editable description |
| Task list | Fractal outline |
| Task detail | Plan panel + comments-first thread |
| Task settings | State, priority, meta (in detail header) |
| Task creator | Modal |
| Settings | General, Agents, Appearance, Shortcuts — Notifications deferred |

---

## Resolved decisions

| Topic | Decision |
|-------|----------|
| Scope | Personal outliner |
| Architecture | Thin `liner-core` + Electron |
| Thread | One Craft session; comments-first UI |
| Reminder / due | Deferred |
| Persistence | SQLite + Craft JSONL |
| Parent early review | Phase A when child plan ready |
| Terminal success | `shipped` |
