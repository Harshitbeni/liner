import type { Point } from './types';

export type AgentIntent = 'plan' | 'execute' | 'review';

export function promptForIntent(
  intent: AgentIntent,
  point: Point,
  extra?: { childTask?: string; childPlan?: string },
): string {
  switch (intent) {
    case 'plan':
      return [
        'Write a detailed execution plan in markdown for this task.',
        'Include steps, risks, and acceptance criteria.',
        'When finished, end with a line: `LINER_PLAN_READY: yes`',
        '',
        `Task: ${point.task}`,
        point.description.trim()
          ? `\nExisting draft:\n${point.description}`
          : '',
      ].join('\n');

    case 'execute':
      return [
        'Execute the approved plan below. Use tools as needed.',
        'Report progress concisely. When work is complete, end with:',
        '`LINER_DONE: yes` and a short summary.',
        '',
        `Task: ${point.task}`,
        '',
        '## Plan',
        point.description.trim() || '(no plan — ask for plan first)',
      ].join('\n');

    case 'review':
      return [
        'You are reviewing a child task plan for a parent outline point.',
        'Respond with JSON only:',
        '{"verdict":"approved"|"changes_requested","notes":"..."}',
        '',
        `Parent: ${point.task}`,
        `Child: ${extra?.childTask ?? 'unknown'}`,
        '',
        '## Child plan',
        extra?.childPlan?.trim() || '(empty)',
      ].join('\n');

    default:
      return point.task;
  }
}

export function parsePlanReviewJson(
  content: string,
): { verdict: 'approved' | 'changes_requested'; notes: string } | null {
  const match = content.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as {
      verdict?: string;
      notes?: string;
    };
    if (
      parsed.verdict !== 'approved' &&
      parsed.verdict !== 'changes_requested'
    ) {
      return null;
    }
    return {
      verdict: parsed.verdict,
      notes: String(parsed.notes ?? '').trim() || 'No notes',
    };
  } catch {
    return null;
  }
}

export function parseCompletionFromAgent(content: string): {
  completed: boolean;
  summary: string;
  gaps: string[];
} {
  const done = /LINER_DONE:\s*yes/i.test(content);
  const gaps: string[] = [];
  const gapMatch = content.match(/LINER_GAPS:([\s\S]*?)(?:\n\n|$)/i);
  if (gapMatch) {
    for (const line of gapMatch[1].split('\n')) {
      const t = line.replace(/^[-*]\s*/, '').trim();
      if (t) gaps.push(t);
    }
  }
  return {
    completed: done && gaps.length === 0,
    summary: content.slice(0, 500),
    gaps,
  };
}

export function planLooksReady(description: string): boolean {
  return description.trim().length > 20;
}

/** Extract plan markdown from assistant reply or plan_submitted message. */
export function extractPlanFromContent(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const ready = /LINER_PLAN_READY:\s*yes/i.test(trimmed);
  const planSection = trimmed.match(
    /(?:^|\n)#{1,3}\s*(?:plan|implementation plan)\s*\n([\s\S]*?)(?=\n#{1,3}\s|\nLINER_|$)/i,
  );
  if (planSection?.[1]?.trim() && planSection[1].trim().length > 20) {
    return planSection[1].trim();
  }

  const fencedBlocks = [...trimmed.matchAll(/```(?:markdown|md|text)?\n([\s\S]*?)```/gi)];
  if (fencedBlocks.length > 0) {
    const best = fencedBlocks
      .map((m) => m[1]?.trim() ?? '')
      .filter((t) => t.length > 20)
      .sort((a, b) => b.length - a.length)[0];
    if (best) return best;
  }

  const jsonPlan = trimmed.match(/\{[\s\S]*"plan"\s*:\s*"([^"]+)"[\s\S]*\}/);
  if (jsonPlan?.[1]) {
    const decoded = jsonPlan[1].replace(/\\n/g, '\n').trim();
    if (decoded.length > 20) return decoded;
  }

  if (ready) {
    const stripped = trimmed
      .replace(/LINER_PLAN_READY:\s*yes/gi, '')
      .replace(/^#+\s*plan\s*$/gim, '')
      .trim();
    if (stripped.length > 20) return stripped;
  }

  const afterMarker = trimmed.match(/LINER_PLAN:\s*([\s\S]+)/i);
  if (afterMarker?.[1]?.trim() && afterMarker[1].trim().length > 20) {
    return afterMarker[1].trim();
  }

  if (trimmed.length > 40 && /(^|\n)#+\s/m.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.length > 80 && /(^|\n)(?:\d+\.|[-*])\s/m.test(trimmed)) {
    return trimmed;
  }

  return null;
}
