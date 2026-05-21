import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IconChevronDownSmall } from '@central-icons-react/round-filled-radius-3-stroke-1/IconChevronDownSmall';
import { IconChevronRightSmall } from '@central-icons-react/round-filled-radius-3-stroke-1/IconChevronRightSmall';
import type { ThreadMessage } from '@liner/core';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  message: ThreadMessage;
  pointId?: string;
  onPermissionResolved?: () => void;
};

const PERMISSION_STALE_MS = 5 * 60 * 1000;

export function CommentCard({
  message,
  pointId,
  onPermissionResolved,
}: Props) {
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [permissionDismissed, setPermissionDismissed] = React.useState(false);
  const perm = message.meta?.permissionRequest;
  const permStale =
    Date.now() - new Date(message.createdAt).getTime() >= PERMISSION_STALE_MS;

  React.useEffect(() => {
    setPermissionDismissed(false);
  }, [message.id, perm?.requestId]);

  const respond = async (approved: boolean) => {
    if (!pointId || !perm) return;
    await api.respondToPermission(pointId, perm.requestId, approved);
    onPermissionResolved?.();
  };

  const tools = message.meta?.tools ?? [];

  return (
    <article
      className={cn(
        'rounded-sm border border-border px-3 py-2',
        message.role === 'user' && 'bg-muted/60',
      )}
    >
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-12 text-muted-foreground">
        <span className="capitalize text-foreground">{message.role}</span>
        <span>{new Date(message.createdAt).toLocaleString()}</span>
        {message.meta?.streaming ? <span>streaming</span> : null}
      </div>
      {message.content.trim() ? (
        <div className="prose prose-sm dark:prose-invert mt-1.5 max-w-none text-13 leading-[18px] text-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      ) : null}
      {tools.length > 0 ? (
        <div className="mt-1.5">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-0.5 text-12 text-muted-foreground"
            onClick={() => setToolsOpen((o) => !o)}
          >
            {toolsOpen ? (
              <IconChevronDownSmall size={12} ariaHidden />
            ) : (
              <IconChevronRightSmall size={12} ariaHidden />
            )}
            Tools ({tools.length})
          </button>
          {toolsOpen ? (
            <ul className="tool-blocks-list mt-1">
              {tools.map((t) => (
                <li key={t.toolUseId}>
                  {t.toolName} · {t.status}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {perm && pointId && !permissionDismissed ? (
        <div className="mt-2 rounded-sm border border-border bg-muted/40 p-2">
          <p className="text-13">{perm.summary}</p>
          <div className="mt-2 flex gap-1">
            <Button
              type="button"
              variant="ghost"
              className="text-12 h-6 px-2"
              onClick={() => respond(true)}
            >
              Approve
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-12 h-6 px-2"
              onClick={() => respond(false)}
            >
              Deny
            </Button>
            {permStale ? (
              <Button
                type="button"
                variant="ghost"
                className="text-12 h-6 px-2"
                onClick={() => setPermissionDismissed(true)}
              >
                Dismiss
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
