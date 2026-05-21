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
  parentId?: string | null;
  onCreated: (pointId: string) => void;
  onClose: () => void;
};

export function TaskCreator({ areaId, parentId, onCreated, onClose }: Props) {
  const [task, setTask] = React.useState('');

  const submit = async () => {
    if (!task.trim()) return;
    const point = await api.createPoint({
      task: task.trim(),
      areaId,
      parentId,
    });
    onCreated(point.id);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{parentId ? 'New sub-task' : 'New task'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="task-title">Title</Label>
          <Input
            id="task-title"
            autoFocus
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Task title"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!task.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
