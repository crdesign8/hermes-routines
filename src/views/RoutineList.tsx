import { useEffect, useState, type ReactElement } from 'react';
import type { RoutineJob } from '../domain/jobs';
import { jobIdOf } from '../domain/jobs';
import { RoutineCard } from './RoutineCard';

export interface RoutineListProps {
  jobs: RoutineJob[];
  pending: string[];
  locked: boolean;
  selectedId?: string | null;
  onSelect?: (name: string | null) => void;
  inspectedId?: string | null;
  onInspect?: (name: string | null) => void;
  onPause: (name: string) => void;
  onResume: (name: string) => void;
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
    const stillThere = jobs.some((job, index) => (jobIdOf(job) || `routine ${index + 1}`) === activeInspectorId);
    if (!stillThere && handleInspect) {
      handleInspect(null);
    }
  }, [jobs, activeInspectorId, handleInspect]);

  function handleToggleExpand(name: string): void {
    setExpandedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function handleEdit(name: string): void {
    if (handleInspect) {
      handleInspect(activeInspectorId === name ? null : name);
    }
  }

  return (
    <ul className="hr-list" aria-label="Routines">
      {jobs.map((job, index) => {
        const fallback = `routine ${index + 1}`;
        const name = jobIdOf(job) || fallback;
        const busy = pending.indexOf(name) !== -1;
        return (
          <RoutineCard
            key={`${index}::${name}`}
            job={job}
            fallback={fallback}
            expanded={expandedNames.has(name)}
            inspected={activeInspectorId === name}
            busy={busy}
            disabled={locked}
            onToggleExpand={() => handleToggleExpand(name)}
            onEdit={() => handleEdit(name)}
            onPause={() => onPause(name)}
            onResume={() => onResume(name)}
          />
        );
      })}
    </ul>
  );
}
