export type PointState =
  | 'backlog'
  | 'todo'
  | 'needs-review'
  | 'in-progress'
  | 'waiting'
  | 'done'
  | 'shipped'
  | 'cancelled';

export type PointPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export const TERMINAL_CHILD_STATES: PointState[] = ['shipped', 'cancelled'];

export type Point = {
  id: string;
  task: string;
  description: string;
  notes: string;
  state: PointState;
  priority: PointPriority;
  areaId: string;
  sessionId: string | null;
  parentId: string | null;
  childIds: string[];
  meta: Record<string, unknown>;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Area = {
  id: string;
  name: string;
  description: string;
  icon?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type HarnessEventType =
  | 'plan-review-requested'
  | 'plan-review-completed'
  | 'completion-verification-requested'
  | 'completion-verification-completed'
  | 'parent-waiting'
  | 'parent-unblocked';

export type HarnessEvent = {
  id: string;
  pointId: string;
  type: HarnessEventType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type PlanReviewVerdict = 'approved' | 'changes_requested';

export type PlanReviewResult = {
  verdict: PlanReviewVerdict;
  notes: string;
  parentPointId: string;
  childPointId: string;
};

export type CompletionVerificationResult = {
  completed: boolean;
  summary: string;
  gaps: string[];
};

export type ThreadMessageRole = 'user' | 'assistant' | 'system';

export type ThreadToolBlock = {
  toolUseId: string;
  toolName: string;
  input?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  status: 'running' | 'done';
};

export type ThreadPermissionRequest = {
  requestId: string;
  summary: string;
  toolName?: string;
};

export type ThreadMessage = {
  id: string;
  sessionId: string;
  role: ThreadMessageRole;
  content: string;
  createdAt: string;
  meta?: {
    quotedPlan?: string;
    collapsedTools?: boolean;
    streaming?: boolean;
    mentionAgents?: string[];
    mentionSkills?: string[];
    tools?: ThreadToolBlock[];
    permissionRequest?: ThreadPermissionRequest;
  };
};

export type LinerSettings = {
  workspaceId: string;
  defaultAreaId: string | null;
  theme: 'system' | 'light' | 'dark';
  strictPlanGate: boolean;
  autoAgents: boolean;
  /** OpenCode HTTP API base URL */
  opencodeBaseUrl: string;
  /** Preferred LLM provider id (anthropic, openai, openrouter, …) */
  aiProviderId: string;
};

export type SubagentId =
  | 'generalPurpose'
  | 'explore'
  | 'shell'
  | 'code-architect'
  | 'code-explorer'
  | 'code-reviewer'
  | 'code-simplifier'
  | 'best-of-n-runner';

export const SUBAGENT_REGISTRY: Record<
  SubagentId,
  { label: string; description: string }
> = {
  generalPurpose: {
    label: 'General Purpose',
    description: 'Multi-step research and implementation',
  },
  explore: {
    label: 'Explore',
    description: 'Fast codebase exploration (read-only)',
  },
  shell: {
    label: 'Shell',
    description: 'Git, commands, terminal tasks',
  },
  'code-architect': {
    label: 'Code Architect',
    description: 'Feature architecture and blueprints',
  },
  'code-explorer': {
    label: 'Code Explorer',
    description: 'Deep execution-path analysis',
  },
  'code-reviewer': {
    label: 'Code Reviewer',
    description: 'Bug and quality review',
  },
  'code-simplifier': {
    label: 'Code Simplifier',
    description: 'Refine code for clarity',
  },
  'best-of-n-runner': {
    label: 'Best-of-N Runner',
    description: 'Parallel isolated attempts',
  },
};
