import * as React from 'react';
import type { TaskPhoto } from '@liner/core';
import { IconCrossSmall } from '@central-icons-react/round-filled-radius-3-stroke-1/IconCrossSmall';
import { IconPlusSmall } from '@central-icons-react/round-outlined-radius-3-stroke-1.5/IconPlusSmall';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InlineDescription } from '@/components/InlineDescription';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Props = {
  description: string;
  photos: TaskPhoto[];
  onDescriptionChange: (value: string) => void;
  onPhotosChange: (photos: TaskPhoto[]) => void;
  idPrefix?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  textareaClassName?: string;
  minRows?: number;
  onBlur?: () => void;
  onSave?: (value: string) => void | Promise<void>;
  variant?: 'default' | 'minimal';
  showLabel?: boolean;
};

async function readImageFiles(files: FileList | null): Promise<TaskPhoto[]> {
  if (!files?.length) return [];
  const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
  const dataUrls = await Promise.all(
    imageFiles.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }),
    ),
  );
  return dataUrls.map((dataUrl) => ({
    id: crypto.randomUUID(),
    dataUrl,
  }));
}

export function TaskPhotoThumbnails({
  photos = [],
  onRemove,
  className,
}: {
  photos?: TaskPhoto[];
  onRemove?: (id: string) => void;
  className?: string;
}) {
  const items = photos ?? [];
  if (items.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((photo) => (
        <div
          key={photo.id}
          className="group relative size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
        >
          <img
            src={photo.dataUrl}
            alt=""
            className="size-full object-cover"
          />
          {onRemove ? (
            <button
              type="button"
              className="absolute top-0.5 right-0.5 flex size-4 cursor-pointer items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-foreground"
              aria-label="Remove photo"
              onClick={() => onRemove(photo.id)}
            >
              <IconCrossSmall size={10} ariaHidden />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function TaskDescriptionField({
  description = '',
  photos = [],
  onDescriptionChange,
  onPhotosChange,
  idPrefix = 'task',
  label = 'Description',
  placeholder,
  className,
  textareaClassName,
  minRows,
  onBlur,
  onSave,
  variant = 'default',
  showLabel = false,
}: Props) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [addingPhotos, setAddingPhotos] = React.useState(false);
  const descriptionId = `${idPrefix}-description`;
  const isMinimal = variant === 'minimal';
  const labelVisible = !isMinimal || showLabel;
  const resolvedPlaceholder =
    placeholder ?? (isMinimal ? 'add description...' : 'Add a description…');
  const resolvedMinRows = minRows ?? (isMinimal ? 1 : 3);

  const addPhotos = async (files: FileList | null) => {
    setAddingPhotos(true);
    try {
      const next = await readImageFiles(files);
      if (next.length > 0) {
        onPhotosChange([...photos, ...next]);
      }
    } finally {
      setAddingPhotos(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn(labelVisible && 'space-y-2', !isMinimal && className)}>
      {labelVisible ? (
        <Label htmlFor={descriptionId} className="text-13 font-normal">
          {label}
        </Label>
      ) : null}
      {!isMinimal ? (
        <TaskPhotoThumbnails
          photos={photos}
          onRemove={(id) =>
            onPhotosChange(photos.filter((p) => p.id !== id))
          }
        />
      ) : null}
      {isMinimal ? (
        <InlineDescription
          value={description}
          placeholder={resolvedPlaceholder}
          aria-label={!showLabel ? 'Description' : undefined}
          textareaClassName={textareaClassName}
          onSave={async (next) => {
            onDescriptionChange(next);
            if (onSave) await onSave(next);
            else onBlur?.();
          }}
        />
      ) : (
        <Textarea
          id={descriptionId}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          onBlur={onBlur}
          placeholder={resolvedPlaceholder}
          rows={resolvedMinRows}
          className={cn(
            'field-sizing-fixed min-h-[72px] resize-none text-13 shadow-none',
            textareaClassName,
          )}
        />
      )}
      {!isMinimal ? (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => void addPhotos(e.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            className="text-12 h-7 gap-1.5 px-0 has-[>svg]:px-0 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent [&_svg]:text-current"
            disabled={addingPhotos}
            onClick={() => fileInputRef.current?.click()}
          >
            <IconPlusSmall size={14} ariaHidden />
            {addingPhotos ? 'Adding…' : 'Add photos'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
