import { describe, expect, test } from 'bun:test';
import { prependQuote, resolveMentions } from '../mentions';

describe('mentions', () => {
  test('resolves subagent and skill', () => {
    const r = resolveMentions('Hey @code-reviewer check /brainstorming');
    expect(r.agents).toContain('code-reviewer');
    expect(r.skills).toContain('brainstorming');
    expect(r.text).toContain('[subagent:code-reviewer]');
    expect(r.text).toContain('[skill:brainstorming]');
  });

  test('quote prepends blockquote', () => {
    const out = prependQuote('Please review', 'Step one\nStep two');
    expect(out.startsWith('> Step one')).toBe(true);
    expect(out).toContain('Please review');
  });
});
