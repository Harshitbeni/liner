import * as React from 'react';
import type { HarnessEvent, Point, PointState, ThreadMessage } from '@liner/core';
import { api, subscribePointEvents } from '../api';
import { CommentCard } from './CommentCard';
import {
  MentionAutocomplete,
  type MentionItem,
} from './MentionAutocomplete';

const STATES: PointState[] = [
  'backlog',
  'todo',
  'needs-review',
  'in-progress',
  'waiting',
  'done',
  'shipped',
  'cancelled',
];

type Props = {
  pointId: string | null;
  onUpdated: () => void;
  onNewPoint: () => void;
  onStateNotice?: (
    from: PointState,
    to: PointState,
    actor: 'human' | 'agent' | 'harness',
  ) => void;
};

export function PointDetail({
  pointId,
  onUpdated,
  onNewPoint,
  onStateNotice,
}: Props) {
  const [point, setPoint] = React.useState<Point | null>(null);
  const [messages, setMessages] = React.useState<ThreadMessage[]>([]);
  const [plan, setPlan] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [composer, setComposer] = React.useState('');
  const [pendingQuote, setPendingQuote] = React.useState<string | null>(null);
  const [mentionItems, setMentionItems] = React.useState<MentionItem[]>([]);
  const [mentionQuery, setMentionQuery] = React.useState('');
  const [mentionPrefix, setMentionPrefix] = React.useState<'@' | '/' | null>(
    null,
  );
  const [agentRunning, setAgentRunning] = React.useState(false);
  const [harnessEvents, setHarnessEvents] = React.useState<HarnessEvent[]>([]);
  const [gitBranch, setGitBranch] = React.useState('');
  const [gitPrUrl, setGitPrUrl] = React.useState('');
  const planRef = React.useRef<HTMLTextAreaElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    api.listSubagents().then((agents) => {
      api.listSkills().then((skills) => {
        setMentionItems([
          ...agents.map((a) => ({
            id: a.id,
            label: a.label,
            description: a.description,
            prefix: '@' as const,
          })),
          ...skills.map((s) => ({
            id: s.id,
            label: s.label,
            description: s.description,
            prefix: '/' as const,
          })),
        ]);
      });
    });
  }, []);

  const mergeMessage = React.useCallback((msg: ThreadMessage) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msg.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = msg;
        return next;
      }
      return [...prev, msg];
    });
  }, []);

  const load = React.useCallback(async () => {
    if (!pointId) return;
    const { point: p } = await api.getPoint(pointId);
    setPoint(p);
    setPlan(p.description);
    setNotes(p.notes);
    setGitBranch(typeof p.meta?.branch === 'string' ? p.meta.branch : '');
    setGitPrUrl(typeof p.meta?.prUrl === 'string' ? p.meta.prUrl : '');
    await api.ensureSession(pointId);
    const msgs = await api.getMessages(pointId);
    setMessages(msgs);
    const status = await api.getAgentStatus(pointId);
    setAgentRunning(status.running);
    const events = await api.listHarnessEvents(pointId);
    setHarnessEvents(events);
  }, [pointId]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!pointId) return;
    const unsub = subscribePointEvents(pointId, {
      onMessage: mergeMessage,
      onAgentStatus: setAgentRunning,
      onStateChange: (from, to, actor) => {
        onStateNotice?.(from as PointState, to as PointState, actor);
        onUpdated();
        load();
      },
    });
    return unsub;
  }, [pointId, mergeMessage, onStateNotice, onUpdated, load]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pointId || !point) return;
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        onNewPoint();
        return;
      }
      if (typing && !(e.metaKey || e.ctrlKey)) return;

      if (e.key === 'p' && point.state === 'backlog') {
        e.preventDefault();
        changeState('todo');
      }
      if (e.key === 's' && point.state === 'done') {
        e.preventDefault();
        changeState('shipped');
      }
      if (e.key === 'x' && point.state !== 'cancelled') {
        e.preventDefault();
        changeState('cancelled');
      }
      if (e.key === 'a' && point.state === 'needs-review') {
        e.preventDefault();
        changeState('in-progress');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pointId, point]);

  if (!pointId) {
    return (
      <div className="empty-state">
        <p>Select a task from the outline</p>
        <p className="empty-state-hint">Or press New (⌘N) to create one</p>
      </div>
    );
  }

  if (!point) {
    return <div className="empty-state">Loading…</div>;
  }

  const savePlan = async () => {
    await api.updatePoint(pointId, { description: plan });
    onUpdated();
  };

  const saveNotes = async () => {
    await api.updatePoint(pointId, { notes });
  };

  const saveGitMeta = async () => {
    if (!point) return;
    const meta = { ...point.meta };
    const branch = gitBranch.trim();
    const prUrl = gitPrUrl.trim();
    if (branch) meta.branch = branch;
    else delete meta.branch;
    if (prUrl) meta.prUrl = prUrl;
    else delete meta.prUrl;
    await api.updatePoint(pointId, { meta });
    onUpdated();
    load();
  };

  const copyBranch = async () => {
    if (!gitBranch.trim()) return;
    try {
      await navigator.clipboard.writeText(gitBranch.trim());
    } catch {
      /* ignore */
    }
  };

  const changeState = async (state: PointState) => {
    await api.updatePoint(pointId, { state });
    onUpdated();
    load();
  };

  const quoteSelection = () => {
    const el = planRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) return;
    const selected = plan.slice(start, end);
    setPendingQuote(selected);
    composerRef.current?.focus();
  };

  const send = async () => {
    if (!composer.trim()) return;
    await api.sendMessage(pointId, composer, pendingQuote ?? undefined);
    setComposer('');
    setPendingQuote(null);
    setMentionPrefix(null);
  };

  const runAgent = async (intent: 'plan' | 'execute' | 'review') => {
    await api.runAgent(pointId, intent);
    onUpdated();
    load();
  };

  const updateComposerMentions = (value: string, cursor: number) => {
    const before = value.slice(0, cursor);
    const at = before.match(/@([a-zA-Z0-9-]*)$/);
    const slash = before.match(/\/([a-zA-Z0-9_-]*)$/);
    if (at) {
      setMentionPrefix('@');
      setMentionQuery(at[1]);
    } else if (slash) {
      setMentionPrefix('/');
      setMentionQuery(slash[1]);
    } else {
      setMentionPrefix(null);
      setMentionQuery('');
    }
  };

  const insertMention = (item: MentionItem) => {
    const el = composerRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const value = composer;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const trigger = item.prefix === '@' ? '@' : '/';
    const match = before.match(
      item.prefix === '@' ? /@([a-zA-Z0-9-]*)$/ : /\/([a-zA-Z0-9_-]*)$/,
    );
    if (!match) return;
    const start = before.length - match[0].length;
    const token = `${trigger}${item.id} `;
    const next = value.slice(0, start) + token + after;
    setComposer(next);
    setMentionPrefix(null);
    requestAnimationFrame(() => {
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  };

  return (
    <div className="detail-layout">
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <input
          value={point.task}
          onChange={(e) => setPoint({ ...point, task: e.target.value })}
          onBlur={() =>
            api.updatePoint(pointId, { task: point.task }).then(onUpdated)
          }
          style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {agentRunning ? (
            <span className="agent-running" title="Agent session active">
              ◉ Agent running
            </span>
          ) : null}
          <select
            value={point.state}
            onChange={(e) => changeState(e.target.value as PointState)}
          >
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={point.priority}
            onChange={(e) =>
              api
                .updatePoint(pointId, {
                  priority: e.target.value as Point['priority'],
                })
                .then(load)
            }
          >
            {['none', 'low', 'medium', 'high', 'urgent'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {point.state === 'backlog' ? (
            <button onClick={() => changeState('todo')} title="Shortcut: P">
              Promote to todo
            </button>
          ) : null}
          {point.state === 'todo' ? (
            <button type="button" onClick={() => runAgent('plan')}>
              Agent: write plan
            </button>
          ) : null}
          {point.state === 'needs-review' ? (
            <button
              className="primary"
              onClick={() => changeState('in-progress')}
              title="Shortcut: A"
            >
              Approve plan
            </button>
          ) : null}
          {point.state === 'in-progress' ? (
            <button type="button" onClick={() => runAgent('execute')}>
              Agent: execute
            </button>
          ) : null}
          {point.state === 'done' ? (
            <button
              className="primary"
              onClick={() => changeState('shipped')}
              title="Shortcut: S"
            >
              Ship
            </button>
          ) : null}
          {point.state === 'shipped' ? (
            <>
              <button
                type="button"
                onClick={() => changeState('done')}
                title="Reopen as done"
              >
                Reopen (done)
              </button>
              <button
                type="button"
                onClick={() => changeState('in-progress')}
                title="Reopen for more work"
              >
                Reopen (in progress)
              </button>
            </>
          ) : null}
          {point.state !== 'cancelled' ? (
            <button
              type="button"
              onClick={() => changeState('cancelled')}
              title="Shortcut: X"
            >
              Cancel
            </button>
          ) : null}
        </div>
        <div className="shortcut-hint">
          ⌘N new · P promote · A approve · S ship · X cancel
        </div>
      </div>

      <div className="plan-panel">
        <h3>Plan</h3>
        <textarea
          ref={planRef}
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          onBlur={savePlan}
          rows={6}
          placeholder="Agent-authored plan (markdown)"
        />
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button type="button" onClick={quoteSelection}>
            Quote in reply
          </button>
          <button type="button" onClick={savePlan}>
            Save plan
          </button>
        </div>
        <h3 style={{ marginTop: 16 }}>Git</h3>
        <div className="field">
          <label>Branch</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={gitBranch}
              onChange={(e) => setGitBranch(e.target.value)}
              onBlur={saveGitMeta}
              placeholder="feature/liner-v1.4"
            />
            <button type="button" disabled={!gitBranch.trim()} onClick={copyBranch}>
              Copy
            </button>
          </div>
        </div>
        <div className="field">
          <label>PR URL</label>
          <input
            value={gitPrUrl}
            onChange={(e) => setGitPrUrl(e.target.value)}
            onBlur={saveGitMeta}
            placeholder="https://github.com/…/pull/123"
          />
        </div>
        <h3 style={{ marginTop: 16 }}>Notes</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="Human scratchpad"
        />
        {harnessEvents.length > 0 ? (
          <>
            <h3 style={{ marginTop: 16 }}>Harness activity</h3>
            <ul className="harness-log">
              {harnessEvents.slice(0, 12).map((ev) => (
                <li key={ev.id}>
                  <span className="harness-log-type">{ev.type}</span>
                  <span className="harness-log-time">
                    {new Date(ev.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className="thread-panel">
        <div className="thread-scroll">
          {messages.map((m) => (
            <CommentCard
              key={m.id}
              message={m}
              pointId={pointId}
              onPermissionResolved={load}
            />
          ))}
        </div>
        <div className="composer composer-with-mentions">
          {pendingQuote ? (
            <div className="collapsed-tools">
              Quoting: {pendingQuote.slice(0, 80)}
              {pendingQuote.length > 80 ? '…' : ''}
              <button
                type="button"
                style={{ marginLeft: 8 }}
                onClick={() => setPendingQuote(null)}
              >
                Clear
              </button>
            </div>
          ) : null}
          <MentionAutocomplete
            items={mentionItems}
            query={mentionQuery}
            prefix={mentionPrefix ?? '@'}
            visible={mentionPrefix !== null}
            onSelect={insertMention}
          />
          <textarea
            ref={composerRef}
            value={composer}
            onChange={(e) => {
              setComposer(e.target.value);
              updateComposerMentions(
                e.target.value,
                e.target.selectionStart,
              );
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
            rows={3}
            placeholder="Reply… @code-reviewer /brainstorming"
          />
          <div className="composer-actions">
            <button className="primary" onClick={send}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
