import * as React from 'react';
import { api } from '../api';
import { TaskDescriptionField } from './TaskDescriptionField';
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
  const [taskDescription, setTaskDescription] = React.useState('');

  const submit = async () => {
    if (!task.trim()) return;
    const point = await api.createPoint({
      task: task.trim(),
      areaId,
      parentId,
      taskDescription: taskDescription.trim() || undefined,
    });
    onCreated(point.id);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-16 leading-none font-semibold">
            New Task
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title" className="text-13 font-normal">
              Title
            </Label>
            <Input
              id="task-title"
              autoFocus
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Task title"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
          <TaskDescriptionField
            idPrefix="create-task"
            minRows={3}
            showLabel
            description={taskDescription}
            photos={[]}
            onDescriptionChange={setTaskDescription}
            onPhotosChange={() => {}}
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
