import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ThreadMessage } from '@liner/core';
import { api } from '../api';

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
  const roleClass =
    message.role === 'user'
      ? 'user'
      : message.role === 'system'
        ? 'system'
        : '';

  const tools = message.meta?.tools ?? [];
  const perm = message.meta?.permissionRequest;
  const permAgeMs = Date.now() - new Date(message.createdAt).getTime();
  const permStale = permAgeMs >= PERMISSION_STALE_MS;

  React.useEffect(() => {
    setPermissionDismissed(false);
  }, [message.id, perm?.requestId]);

  const respond = async (approved: boolean) => {
    if (!pointId || !perm) return;
    await api.respondToPermission(pointId, perm.requestId, approved);
    onPermissionResolved?.();
  };

  return (
    <article className={`comment-card ${roleClass}`}>
      <div className="comment-meta">
        <span>{message.role}</span>
        <span>{new Date(message.createdAt).toLocaleString()}</span>
        {message.meta?.streaming ? <span className="agent-running">streaming…</span> : null}
        {message.meta?.mentionAgents?.length ? (
          <span>@{message.meta.mentionAgents.join(', @')}</span>
        ) : null}
      </div>
      {message.content.trim() ? (
        <div className="comment-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      ) : null}
      {tools.length > 0 ? (
        <div className="tool-blocks">
          <button
            type="button"
            className="tool-blocks-toggle"
            onClick={() => setToolsOpen((o) => !o)}
          >
            {toolsOpen ? '▼' : '▶'} Tools ({tools.length})
          </button>
          {toolsOpen ? (
            <ul className="tool-blocks-list">
              {tools.map((t) => (
                <li key={t.toolUseId}>
                  <strong>{t.toolName}</strong>
                  <span className={`tool-status ${t.status}`}>{t.status}</span>
                  {t.result ? (
                    <pre className="tool-result">{t.result.slice(0, 400)}</pre>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {perm && pointId && !permissionDismissed ? (
        <div className={`permission-prompt ${permStale ? 'stale' : ''}`}>
          <p>{perm.summary}</p>
          {permStale ? (
            <p className="permission-stale-warning">
              This permission request is over 5 minutes old. Approve or deny if
              still valid, or dismiss.
            </p>
          ) : null}
          <div className="permission-actions">
            <button type="button" className="primary" onClick={() => respond(true)}>
              Approve
            </button>
            <button type="button" onClick={() => respond(false)}>
              Deny
            </button>
            {permStale ? (
              <button
                type="button"
                onClick={() => setPermissionDismissed(true)}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {message.meta?.collapsedTools &&
      message.role === 'assistant' &&
      !tools.length ? (
        <div className="collapsed-tools">Tool details collapsed</div>
      ) : null}
      {message.meta?.quotedPlan ? (
        <div className="collapsed-tools">Includes plan quote</div>
      ) : null}
    </article>
  );
}
