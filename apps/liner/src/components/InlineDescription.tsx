import * as React from 'react';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onSave: (value: string) => void | Promise<void>;
  className?: string;
  textareaClassName?: string;
  placeholder?: string;
  'aria-label'?: string;
};

const metrics = 'text-14 font-normal';
const minHeight = 'min-h-[40px]'; // 2 lines × 20px line-height (text-14)

export function InlineDescription({
  value,
  onSave,
  className,
  textareaClassName,
  placeholder = 'add description...',
  'aria-label': ariaLabel,
}: Props) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  React.useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      const len = draft.length;
      textareaRef.current?.setSelectionRange(len, len);
    }
  }, [editing]);

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const commit = async () => {
    setEditing(false);
    if (draft !== value) await onSave(draft);
    else setDraft(value);
  };

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraft(value);
    setEditing(true);
  };

  const displayText = editing ? draft : value;
  const showPlaceholder = !displayText;

  return (
    <div
      className={cn('relative min-w-0', metrics, minHeight, className)}
      title={editing ? undefined : 'Double-click to edit'}
    >
      <div
        className={cn(
          'block w-full whitespace-pre-wrap break-words',
          editing && 'invisible',
          showPlaceholder && 'text-muted-foreground',
        )}
        aria-hidden={editing}
        onDoubleClick={startEdit}
      >
        {showPlaceholder ? placeholder : displayText}
      </div>
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          aria-label={ariaLabel ?? 'Description'}
          placeholder={placeholder}
          className={cn(
            'absolute inset-0 box-border field-sizing-content min-h-0 w-full min-w-0 resize-none appearance-none overflow-hidden border-0 bg-transparent p-0 font-[inherit] text-inherit shadow-none outline-none ring-0 focus:shadow-none focus:outline-none focus:ring-0 focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0',
            metrics,
            textareaClassName,
          )}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
        />
      ) : null}
    </div>
  );
}
