import { IconSidebarSimpleRightWide } from '@central-icons-react/round-outlined-radius-3-stroke-1.5/IconSidebarSimpleRightWide';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TOGGLE_ICON_SIZE = 16;

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  /** Slightly stronger surface when floating over the task list */
  floating?: boolean;
};

export function DetailSidebarToggle({
  collapsed,
  onToggle,
  className,
  floating = false,
}: Props) {
  const label = collapsed ? 'Show task details' : 'Hide task details';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn(
        'shrink-0 text-muted-foreground',
        floating &&
          'detail-sidebar-toggle-floating border border-border bg-background/90 shadow-sm backdrop-blur-sm hover:bg-accent',
        className,
      )}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <IconSidebarSimpleRightWide size={TOGGLE_ICON_SIZE} ariaHidden />
    </Button>
  );
}
