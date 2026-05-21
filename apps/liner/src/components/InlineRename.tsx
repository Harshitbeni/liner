import * as React from 'react';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onSave: (value: string) => void | Promise<void>;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  'aria-label'?: string;
  /** Matches surrounding text metrics to prevent layout jump */
  size?: 'sm' | 'lg';
};

const sizeMetrics = {
  sm: 'h-[18px] text-13 leading-[18px]',
  lg: 'h-[22px] text-16 leading-[22px]',
} as const;

export function InlineRename({
  value,
  onSave,
  className,
  inputClassName,
  placeholder,
  'aria-label': ariaLabel,
  size = 'sm',
}: Props) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const metrics = sizeMetrics[size];

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const commit = async () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed) {
      setDraft(value);
      return;
    }
    if (trimmed !== value) await onSave(trimmed);
    else setDraft(value);
  };

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraft(value);
    setEditing(true);
  };

  return (
    <div
      className={cn('relative min-w-0 flex-1', metrics, className)}
      title={editing ? undefined : 'Double-click to rename'}
    >
      <span
        className={cn(
          'block w-full truncate',
          editing && 'invisible',
        )}
        aria-hidden={editing}
        onDoubleClick={startEdit}
      >
        {value || '\u00a0'}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          aria-label={ariaLabel ?? 'Rename'}
          placeholder={placeholder}
          className={cn(
            'absolute inset-0 box-border w-full min-w-0 appearance-none border-0 bg-transparent p-0 font-[inherit] text-inherit outline-none',
            metrics,
            'shadow-[inset_0_0_0_1px_var(--border)] focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]',
            inputClassName,
          )}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
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
