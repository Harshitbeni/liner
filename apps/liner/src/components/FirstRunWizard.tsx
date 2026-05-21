import * as React from 'react';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

type Props = {
  areaId: string;
  onDone: (pointId: string) => void;
  onDismiss: () => void;
};

export function FirstRunWizard({ areaId, onDone, onDismiss }: Props) {
  const [step, setStep] = React.useState(0);
  const [areaName, setAreaName] = React.useState('');
  const [taskTitle, setTaskTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const finish = async () => {
    if (!taskTitle.trim()) return;
    setBusy(true);
    try {
      const point = await api.createPoint({
        task: taskTitle.trim(),
        areaId,
        parentId: null,
      });
      onDone(point.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle id="first-run-title">Welcome to Liner</DialogTitle>
        </DialogHeader>
        {step === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Organize work as nested points. Each point gets an agent thread.
              Promote backlog → todo for a plan, then approve and execute.
            </p>
            <div className="space-y-2">
              <Label htmlFor="area-note">Name this area (optional note)</Label>
              <Input
                id="area-note"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="e.g. Liner v1.4"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onDismiss}>
                Skip
              </Button>
              <Button type="button" onClick={() => setStep(1)}>
                Next
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Create your first task in this area.
            </p>
            <div className="space-y-2">
              <Label htmlFor="first-task">First task</Label>
              <Input
                id="first-task"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g. Ship v1.4 dogfood"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && taskTitle.trim()) finish();
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: enable <strong>Auto-run agents</strong> in Settings → General.
              Promote to <strong>todo</strong> to generate a plan.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button
                type="button"
                disabled={busy || !taskTitle.trim()}
                onClick={finish}
              >
                {busy ? 'Creating…' : 'Create task'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
