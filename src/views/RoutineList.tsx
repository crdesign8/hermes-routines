import { useEffect, useState } from 'react';
import type { RoutineJob } from '../domain/jobs';
import { jobIdOf } from '../domain/jobs';
import { RoutineCard } from './RoutineCard';

// Expandable routine list. Expansion is local list state (mirrors Crew's
// _JobsList _expandedJobId): expanding is progressive disclosure, not page
// state, and a removed job clears a dangling expansion.

export interface RoutineListProps {
  jobs: RoutineJob[];
  pending: string[];
  locked: boolean;
  onPause: (name: string) => void;
  onResume: (name: string) => void;
}

export function RoutineList({ jobs, pending, locked, onPause, onResume }: RoutineListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (expanded === null) return;
    const stillThere = jobs.some((job, index) => (jobIdOf(job) || `routine ${index + 1}`) === expanded);
    if (!stillThere) setExpanded(null);
  }, [jobs, expanded]);

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
            expanded={expanded === name}
            busy={busy}
            disabled={locked}
            onToggleExpand={() => setExpanded((current) => (current === name ? null : name))}
            onPause={() => onPause(name)}
            onResume={() => onResume(name)}
          />
        );
      })}
    </ul>
  );
}
