import * as React from 'react';
import { api } from '../api';

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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{parentId ? 'New sub-task' : 'New task'}</h3>
        <input
          autoFocus
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Task title"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
