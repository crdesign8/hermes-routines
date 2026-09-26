import { useEffect, useState, type ReactElement } from 'react';
import type { RoutineJob } from '../domain/jobs';
import { jobIdOf } from '../domain/jobs';
import { routineKey, routineTitle } from '../domain/present';
import { RoutineCard } from './RoutineCard';

export interface RoutineListProps {
  jobs: RoutineJob[];
  pending: string[];
  locked: boolean;
  selectedId?: string | null;
  onSelect?: (key: string | null) => void;
  inspectedId?: string | null;
  onInspect?: (key: string | null) => void;
  /** Receives the canonical job_id plus the display title (mutations never key on the title). */
  onPause: (jobId: string, label: string) => void;
  onResume: (jobId: string, label: string) => void;
}

export function RoutineList({
  jobs,
  pending,
  locked,
  selectedId,
  onSelect,
  inspectedId,
  onInspect,
  onPause,
  onResume,
}: RoutineListProps): ReactElement {
  // Downward in-place expansion state per card
  const [expandedNames, setExpandedNames] = useState<Set<string>>(() => new Set());

  const activeInspectorId = inspectedId !== undefined ? inspectedId : (selectedId ?? null);
  const handleInspect = onInspect ?? onSelect;

  useEffect(() => {
    if (activeInspectorId === null) return;
    const stillThere = jobs.some(
      (job, index) => routineKey(job, `routine ${index + 1}`) === activeInspectorId,
    );
    if (!stillThere && handleInspect) {
      handleInspect(null);
    }
  }, [jobs, activeInspectorId, handleInspect]);

  function handleToggleExpand(key: string): void {
    setExpandedNames((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleEdit(key: string): void {
    if (handleInspect) {
      handleInspect(activeInspectorId === key ? null : key);
    }
  }

  return (
    <ul className="hr-list" aria-label="Routines">
      {jobs.map((job, index) => {
        const fallback = `routine ${index + 1}`;
        // Two keys per row: the canonical job_id drives mutations and
        // pending/busy matching, while the view key (id, else the
        // positional label) drives rendering and inspector selection. A row
        // without a job_id renders but stays unaddressable: pause/resume are
        // disabled rather than fired at the display name.
        const jobId = jobIdOf(job);
        const viewKey = routineKey(job, fallback);
        const busier = jobId !== '' && pending.indexOf(jobId) !== -1;
        return (
          <RoutineCard
            key={`${index}::${viewKey}`}
            job={job}
            fallback={fallback}
            expanded={expandedNames.has(viewKey)}
            inspected={activeInspectorId === viewKey}
            busy={busier}
            disabled={locked || jobId === ''}
            onToggleExpand={() => handleToggleExpand(viewKey)}
            onEdit={() => handleEdit(viewKey)}
            onPause={() => onPause(jobId, routineTitle(job, fallback))}
            onResume={() => onResume(jobId, routineTitle(job, fallback))}
          />
        );
      })}
    </ul>
  );
}
