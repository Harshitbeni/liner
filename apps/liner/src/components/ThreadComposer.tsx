import * as React from 'react';
import { IconPaperPlaneTopRight } from '@central-icons-react/round-filled-radius-3-stroke-1.5/IconPaperPlaneTopRight';
import {
  MentionAutocomplete,
  type MentionItem,
} from './MentionAutocomplete';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  pendingQuote: string | null;
  onClearQuote: () => void;
  mentionItems: MentionItem[];
  mentionQuery: string;
  mentionPrefix: '@' | '/' | null;
  onSelectMention: (item: MentionItem) => void;
  onUpdateMentions: (value: string, cursor: number) => void;
  placeholder?: string;
};

export function ThreadComposer({
  value,
  onChange,
  onSend,
  inputRef,
  pendingQuote,
  onClearQuote,
  mentionItems,
  mentionQuery,
  mentionPrefix,
  onSelectMention,
  onUpdateMentions,
  placeholder = 'Leave a comment…',
}: Props) {
  const [expanded, setExpanded] = React.useState(false);

  const insertTrigger = (prefix: '@' | '/') => {
    const el = inputRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? value.length;
    const next = value.slice(0, cursor) + prefix + value.slice(cursor);
    onChange(next);
    setExpanded(true);
    requestAnimationFrame(() => {
      const pos = cursor + 1;
      el.setSelectionRange(pos, pos);
      el.focus();
      onUpdateMentions(next, pos);
    });
  };

  const handleSend = () => {
    if (!value.trim()) return;
    void Promise.resolve(onSend()).then(() => {
      setExpanded(false);
    });
  };

  return (
    <div className="composer composer-with-mentions shrink-0 p-[12px]">
      {pendingQuote ? (
        <p className="mb-2 truncate text-12 text-muted-foreground">
          Quote: {pendingQuote.slice(0, 60)}
          {pendingQuote.length > 60 ? '…' : ''}
          <button
            type="button"
            className="ml-2 cursor-pointer underline"
            onClick={onClearQuote}
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
        onSelect={onSelectMention}
      />
      <div
        className={cn(
          'composer-shell rounded-lg border border-border bg-background pt-[4px] pr-[4px] pb-[4px] pl-[12px] transition-[min-height] duration-150',
          expanded
            ? 'composer-shell-expanded flex flex-col gap-2'
            : 'flex items-center gap-2',
        )}
      >
        <div
          className={cn(
            'composer-input min-w-0 py-[7px]',
            expanded ? 'w-full' : 'flex min-h-8 flex-1',
          )}
        >
          <Textarea
            ref={inputRef}
            className={cn(
              'min-h-0 w-full resize-none border-0 bg-transparent px-0 py-0 text-13 leading-[18px] shadow-none focus-visible:ring-0',
              expanded ? 'min-h-[72px]' : 'min-h-[18px] flex-1',
            )}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              onUpdateMentions(e.target.value, e.target.selectionStart);
            }}
            onFocus={() => setExpanded(true)}
            onBlur={() => {
              if (!value.trim()) setExpanded(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={expanded ? 3 : 1}
            placeholder={placeholder}
          />
        </div>
        {expanded ? (
          <div className="composer-footer flex items-center justify-between gap-2">
            <div className="flex gap-0.5">
              <button
                type="button"
                className="composer-shortcut"
                aria-label="Mention agent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertTrigger('@')}
              >
                @
              </button>
              <button
                type="button"
                className="composer-shortcut"
                aria-label="Insert skill"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertTrigger('/')}
              >
                /
              </button>
            </div>
            <button
              type="button"
              className="composer-send inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-foreground text-background transition-opacity disabled:pointer-events-none disabled:opacity-40"
              aria-label="Send"
              disabled={!value.trim()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSend}
            >
              <IconPaperPlaneTopRight size={14} ariaHidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="composer-send inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-foreground text-background transition-opacity disabled:pointer-events-none disabled:opacity-40"
            aria-label="Send"
            disabled={!value.trim()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSend}
          >
            <IconPaperPlaneTopRight size={14} ariaHidden />
          </button>
        )}
      </div>
    </div>
  );
}
