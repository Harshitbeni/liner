import { SUBAGENT_REGISTRY, type SubagentId } from './types';

export type MentionResolution = {
  text: string;
  agents: SubagentId[];
  skills: string[];
};

const SUBAGENT_PATTERN = /@([a-zA-Z][a-zA-Z0-9-]*)/g;
const SKILL_PATTERN = /\/([a-zA-Z][a-zA-Z0-9_-]*)/g;

export function isValidSubagent(id: string): id is SubagentId {
  return id in SUBAGENT_REGISTRY;
}

export function resolveMentions(raw: string): MentionResolution {
  const agents = new Set<SubagentId>();
  const skills = new Set<string>();

  for (const match of raw.matchAll(SUBAGENT_PATTERN)) {
    const id = match[1];
    if (isValidSubagent(id)) {
      agents.add(id);
    }
  }

  for (const match of raw.matchAll(SKILL_PATTERN)) {
    skills.add(match[1]);
  }

  let text = raw;
  for (const agent of agents) {
    text = text.replaceAll(`@${agent}`, `[subagent:${agent}]`);
  }
  for (const skill of skills) {
    text = text.replaceAll(`/${skill}`, `[skill:${skill}]`);
  }

  return {
    text,
    agents: [...agents],
    skills: [...skills],
  };
}

export function formatQuoteBlock(selectedText: string): string {
  const lines = selectedText.trim().split('\n');
  const quoted = lines.map((line) => `> ${line}`).join('\n');
  return `${quoted}\n\n`;
}

export function prependQuote(message: string, quote: string): string {
  return formatQuoteBlock(quote) + message.trim();
}

export function listSubagents(): Array<{
  id: SubagentId;
  label: string;
  description: string;
}> {
  return Object.entries(SUBAGENT_REGISTRY).map(([id, meta]) => ({
    id: id as SubagentId,
    ...meta,
  }));
}
