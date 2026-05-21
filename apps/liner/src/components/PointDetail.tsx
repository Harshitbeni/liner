import * as React from 'react';
import type { HarnessEvent, Point, PointState, ThreadMessage } from '@liner/core';
import { IconEyeOpen } from '@central-icons-react/round-filled-radius-3-stroke-1/IconEyeOpen';
import { IconLoader } from '@central-icons-react/round-filled-radius-3-stroke-1/IconLoader';
import { api, subscribePointEvents } from '../api';
import { CommentCard } from './CommentCard';
import {
  MentionAutocomplete,
  type MentionItem,
} from './MentionAutocomplete';
import { InlineRename } from './InlineRename';
import { formatStateLabel, StateIcon } from './state-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  pointId: string;
  onUpdated: () => void;
  onNewPoint: () => void;
  onStateNotice?: (
    from: PointState,
    to: PointState,
    actor: 'human' | 'agent' | 'harness',
  ) => void;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-12 font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

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
  const [metaOpen, setMetaOpen] = React.useState(false);
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
    const { point: p } = await api.getPoint(pointId);
    setPoint(p);
    setPlan(p.description);
    setNotes(p.notes);
    setGitBranch(typeof p.meta?.branch === 'string' ? p.meta.branch : '');
    setGitPrUrl(typeof p.meta?.prUrl === 'string' ? p.meta.prUrl : '');
    await api.ensureSession(pointId);
    setMessages(await api.getMessages(pointId));
    setAgentRunning((await api.getAgentStatus(pointId)).running);
    setHarnessEvents(await api.listHarnessEvents(pointId));
  }, [pointId]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
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

  const changeState = React.useCallback(
    async (state: PointState) => {
      await api.updatePoint(pointId, { state });
      onUpdated();
      load();
    },
    [pointId, onUpdated, load],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!point) return;
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        onNewPoint();
        return;
      }
      if (typing && !(e.metaKey || e.ctrlKey)) return;
      if (e.key === 's' && point.state === 'done') {
        e.preventDefault();
        void changeState('shipped');
      }
      if (e.key === 'a' && point.state === 'needs-review') {
        e.preventDefault();
        void changeState('in-progress');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [point, onNewPoint, changeState]);

  if (!point) {
    return (
      <div className="flex flex-1 items-center justify-center text-13 text-muted-foreground">
        Loading…
      </div>
    );
  }

  const savePlan = async () => {
    await api.updatePoint(pointId, { description: plan });
    onUpdated();
  };

  const saveNotes = async () => {
    await api.updatePoint(pointId, { notes });
  };

  const saveGitMeta = async () => {
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

  const quoteSelection = () => {
    const el = planRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    if (start === end) return;
    setPendingQuote(plan.slice(start, end));
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
    setComposer(value.slice(0, start) + token + after);
    setMentionPrefix(null);
    requestAnimationFrame(() => {
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  };

  return (
    <div className="detail-layout">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <InlineRename
          value={point.task}
          size="lg"
          aria-label="Task title"
          className="font-medium"
          onSave={async (task) => {
            await api.updatePoint(pointId, { task });
            setPoint((p) => (p ? { ...p, task } : p));
            onUpdated();
          }}
        />
        <div className="mt-2 flex flex-col gap-1">
          {agentRunning ? (
            <span className="inline-flex items-center gap-1 text-12 text-muted-foreground">
              <IconLoader className="size-3 animate-spin" ariaHidden />
              Running
            </span>
          ) : null}
          <Select
            value={point.state}
            onValueChange={(v) => changeState(v as PointState)}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-full min-w-0 border-0 bg-transparent px-1 text-13 shadow-none focus:ring-0"
            >
              <SelectValue>
                <span className="flex items-center gap-1.5 capitalize">
                  <StateIcon state={point.state} />
                  {formatStateLabel(point.state)}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATES.map((s) => (
                <SelectItem key={s} value={s} className="text-13 capitalize">
                  <span className="flex items-center gap-1.5">
                    <StateIcon state={s} />
                    {formatStateLabel(s)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {point.state === 'todo' ||
        point.state === 'needs-review' ||
        point.state === 'in-progress' ||
        point.state === 'done' ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {point.state === 'todo' ? (
            <Button
              type="button"
              variant="ghost"
              className="text-13 h-7 px-2"
              onClick={() => runAgent('plan')}
            >
              Plan
            </Button>
          ) : null}
          {point.state === 'needs-review' ? (
            <Button
              type="button"
              variant="ghost"
              className="text-13 h-7 px-2"
              onClick={() => changeState('in-progress')}
            >
              Approve
            </Button>
          ) : null}
          {point.state === 'in-progress' ? (
            <Button
              type="button"
              variant="ghost"
              className="text-13 h-7 px-2"
              onClick={() => runAgent('execute')}
            >
              Execute
            </Button>
          ) : null}
          {point.state === 'done' ? (
            <Button
              type="button"
              variant="ghost"
              className="text-13 h-7 px-2"
              onClick={() => changeState('shipped')}
            >
              Ship
            </Button>
          ) : null}
        </div>
        ) : null}
        <button
          type="button"
          className="mt-2 flex cursor-pointer items-center gap-1 text-12 text-muted-foreground hover:text-foreground"
          onClick={() => setMetaOpen((o) => !o)}
        >
          <IconEyeOpen size={12} ariaHidden className="shrink-0" />
          {metaOpen ? 'Hide' : 'Show'} plan & git
        </button>
      </div>

      {metaOpen ? (
        <ScrollArea className="max-h-[36vh] shrink-0 border-b border-border">
          <div className="space-y-4 px-4 py-3">
            <section>
              <SectionLabel>Plan</SectionLabel>
              <Textarea
                ref={planRef}
                className="mt-1.5 min-h-[100px] resize-none border-border bg-transparent font-mono text-13 shadow-none"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                onBlur={savePlan}
                placeholder="Markdown plan"
              />
              <div className="mt-1.5 flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-12 h-6 px-2"
                  onClick={quoteSelection}
                >
                  Quote
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-12 h-6 px-2"
                  onClick={savePlan}
                >
                  Save
                </Button>
              </div>
            </section>
            <section>
              <SectionLabel>Git</SectionLabel>
              <Input
                className="mt-1.5 h-8 font-mono text-13"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                onBlur={saveGitMeta}
                placeholder="branch"
              />
              <Input
                className="mt-1.5 h-8 text-13"
                value={gitPrUrl}
                onChange={(e) => setGitPrUrl(e.target.value)}
                onBlur={saveGitMeta}
                placeholder="PR URL"
              />
            </section>
            <section>
              <SectionLabel>Notes</SectionLabel>
              <Textarea
                className="mt-1.5 min-h-[60px] resize-none border-border bg-transparent text-13 shadow-none"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
              />
            </section>
            {harnessEvents.length > 0 ? (
              <section>
                <SectionLabel>Harness</SectionLabel>
                <ul className="harness-log mt-1">
                  {harnessEvents.slice(0, 8).map((ev) => (
                    <li key={ev.id}>
                      <span className="harness-log-type">{ev.type}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </ScrollArea>
      ) : null}

      <div className="thread-panel min-h-0 flex-1">
        <ScrollArea className="flex-1 px-4 py-3">
          <div className="flex flex-col gap-2">
            {messages.length === 0 ? (
              <p className="text-13 text-muted-foreground">No messages yet</p>
            ) : (
              messages.map((m) => (
                <CommentCard
                  key={m.id}
                  message={m}
                  pointId={pointId}
                  onPermissionResolved={load}
                />
              ))
            )}
          </div>
        </ScrollArea>
        <Separator />
        <div className="composer composer-with-mentions shrink-0 px-4 py-3">
          {pendingQuote ? (
            <p className="mb-2 truncate text-12 text-muted-foreground">
              Quote: {pendingQuote.slice(0, 60)}
              {pendingQuote.length > 60 ? '…' : ''}
              <button
                type="button"
                className="ml-2 cursor-pointer underline"
                onClick={() => setPendingQuote(null)}
              >
                clear
              </button>
            </p>
          ) : null}
          <MentionAutocomplete
            items={mentionItems}
            query={mentionQuery}
            prefix={mentionPrefix ?? '@'}
            visible={mentionPrefix !== null}
            onSelect={insertMention}
          />
          <Textarea
            ref={composerRef}
            className="min-h-[56px] resize-none border-border bg-transparent text-14 shadow-none"
            value={composer}
            onChange={(e) => {
              setComposer(e.target.value);
              updateComposerMentions(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
            rows={2}
            placeholder="Reply…"
          />
          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              className="text-13 h-7"
              onClick={send}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
