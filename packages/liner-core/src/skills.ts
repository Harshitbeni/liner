import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Curated skill slugs for @mention autocomplete (slash commands). */
export const SKILL_REGISTRY: Record<string, { label: string; description: string }> =
  {
    brainstorming: {
      label: 'Brainstorming',
      description: 'Explore intent before building',
    },
    'systematic-debugging': {
      label: 'Systematic debugging',
      description: 'Structured bug investigation',
    },
    'writing-plans': {
      label: 'Writing plans',
      description: 'Implementation plan workflow',
    },
    'executing-plans': {
      label: 'Executing plans',
      description: 'Run plans with checkpoints',
    },
    'frontend-design': {
      label: 'Frontend design',
      description: 'Polished UI implementation',
    },
    'vercel-react-best-practices': {
      label: 'React best practices',
      description: 'Performance patterns for React',
    },
    'wcag-audit-patterns': {
      label: 'WCAG audit',
      description: 'Accessibility review patterns',
    },
    'test-driven-development': {
      label: 'TDD',
      description: 'Tests before implementation',
    },
  };

export type SkillEntry = {
  id: string;
  label: string;
  description: string;
  source?: 'static' | 'workspace';
};

function craftWorkspaceSkillsDir(craftWorkspaceId: string): string {
  return join(
    homedir(),
    '.craft-agent',
    'workspaces',
    craftWorkspaceId,
    'skills',
  );
}

function vendorCraftSkillsDirs(): string[] {
  const root = join(import.meta.dir, '..', '..', '..', 'vendor', 'craft-agents-oss');
  const candidates = [
    join(root, 'skills'),
    join(root, '.cursor', 'skills'),
  ];
  return candidates.filter((p) => existsSync(p));
}

function titleFromSkillMd(content: string, fallback: string): string {
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1?.[1]) return h1[1].trim();
  const name = content.match(/^name:\s*(.+)$/m);
  if (name?.[1]) return name[1].trim();
  return fallback
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function descriptionFromSkillMd(content: string): string {
  const desc = content.match(/^description:\s*(.+)$/m);
  if (desc?.[1]) return desc[1].trim();
  const para = content
    .replace(/^---[\s\S]*?---\n?/m, '')
    .split('\n\n')
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#'));
  return para?.slice(0, 120) ?? 'Craft workspace skill';
}

function scanSkillsDirectory(
  dir: string,
  source: 'workspace',
): SkillEntry[] {
  if (!existsSync(dir)) return [];
  const out: SkillEntry[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const skillMd = join(dir, name.name, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    try {
      const content = readFileSync(skillMd, 'utf8');
      out.push({
        id: name.name,
        label: titleFromSkillMd(content, name.name),
        description: descriptionFromSkillMd(content),
        source,
      });
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

/** Load skills from Craft workspace filesystem; merge with static registry. */
export function loadWorkspaceSkills(craftWorkspaceId: string): SkillEntry[] {
  const dirs = [
    craftWorkspaceSkillsDir(craftWorkspaceId),
    ...vendorCraftSkillsDirs(),
  ];
  const byId = new Map<string, SkillEntry>();
  for (const dir of dirs) {
    for (const skill of scanSkillsDirectory(dir, 'workspace')) {
      if (!byId.has(skill.id)) byId.set(skill.id, skill);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function listSkills(craftWorkspaceId?: string): SkillEntry[] {
  const dynamic = craftWorkspaceId
    ? loadWorkspaceSkills(craftWorkspaceId)
    : [];
  const byId = new Map<string, SkillEntry>();

  for (const [id, meta] of Object.entries(SKILL_REGISTRY)) {
    byId.set(id, { id, ...meta, source: 'static' });
  }
  for (const skill of dynamic) {
    byId.set(skill.id, skill);
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
