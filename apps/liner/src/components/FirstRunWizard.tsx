import * as React from 'react';
import { api } from '../api';

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
    <div className="first-run-overlay" role="dialog" aria-labelledby="first-run-title">
      <div className="first-run-card">
        <h2 id="first-run-title">Welcome to Liner</h2>
        {step === 0 ? (
          <>
            <p>
              Organize work as nested points. Each point gets an agent thread.
              Promote backlog → todo for a plan, then approve and execute.
            </p>
            <div className="field">
              <label>Name this area (optional note)</label>
              <input
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="e.g. Liner v1.4"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onDismiss}>
                Skip
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => setStep(1)}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Create your first task in this area.</p>
            <div className="field">
              <label>First task</label>
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g. Ship v1.4 dogfood"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && taskTitle.trim()) finish();
                }}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Tip: enable <strong>Auto-run agents</strong> in Settings → General.
              Promote to <strong>todo</strong> to generate a plan.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setStep(0)}>
                Back
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy || !taskTitle.trim()}
                onClick={finish}
              >
                {busy ? 'Creating…' : 'Create task'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
