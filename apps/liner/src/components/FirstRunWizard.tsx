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
  open: boolean;
  areaId: string;
  initialName?: string;
  onComplete: () => void;
  onDismiss: () => void;
};

export function FirstRunWizard({
  open,
  areaId,
  initialName = '',
  onComplete,
  onDismiss,
}: Props) {
  const [areaName, setAreaName] = React.useState(initialName);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    if (!areaName.trim()) return;
    setBusy(true);
    try {
      await api.updateArea(areaId, { name: areaName.trim() });
      onComplete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-16 leading-none font-semibold">
            Welcome to Liner
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="area-name" className="text-13 font-normal">
              Name
            </Label>
            <Input
              id="area-name"
              autoFocus
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              placeholder="Area name"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDismiss}>
            Skip
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={busy || !areaName.trim()}
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
