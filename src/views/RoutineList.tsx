import { useEffect, type ReactElement } from 'react';
import type { RoutineJob } from '../domain/jobs';
import { jobIdOf } from '../domain/jobs';
import { routineKey, routineTitle } from '../domain/present';
import { RoutineCard } from './RoutineCard';
import { INSPECTOR_PANEL_ID } from './RoutineInspectorPanel';

export interface RoutineListProps {
  jobs: RoutineJob[];
  pending: string[];
  locked: boolean;
  selectedId?: string | null;
  onSelect?: (key: string | null) => void;
  inspectedId?: string | null;
  onInspect?: (key: string | null) => void;
  /**
   * Id of the panel a row's disclosure controls (the inspector). Optional
   * with the panel's own id as the default: a caller can never silently
   * hand every row an `undefined` relation, and the list and the panel can
   * never disagree about the id.
   */
  inspectorId?: string;
  /**
   * Builds the id of a row's disclosure control from its view key, so
   * dismissing the inspector can hand focus back to the row the user came
   * from. Omitted means no focus restoration: nothing is invented, and a
   * caller cannot emit a row id the page would never resolve.
   */
  rowControlId?: (viewKey: string) => string;
  /** Receives the canonical job_id plus the display title (mutations never key on the title). */
  onPause: (jobId: string, label: string) => void;
  onResume: (jobId: string, label: string) => void;
}

/**
 * The routine list. Rows never expand in place (issue #77): the only
 * selection state here is which row the inspector owns, and the row
 * reflects it without changing its own height.
 */
export function RoutineList({
  jobs,
  pending,
  locked,
  selectedId,
  onSelect,
  inspectedId,
  onInspect,
  inspectorId = INSPECTOR_PANEL_ID,
  rowControlId,
  onPause,
  onResume,
}: RoutineListProps): ReactElement {
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

  // Selecting the row that already owns the inspector closes it: the same
  // control that opened the detail surface closes it again, so the row is
  // a toggle and never a one-way door.
  function handleSelect(key: string): void {
    if (handleInspect) handleInspect(activeInspectorId === key ? null : key);
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
            inspected={activeInspectorId === viewKey}
            busy={busier}
            disabled={locked || jobId === ''}
            inspectorId={inspectorId}
            controlId={rowControlId ? rowControlId(viewKey) : undefined}
            onSelect={() => handleSelect(viewKey)}
            onPause={() => onPause(jobId, routineTitle(job, fallback))}
            onResume={() => onResume(jobId, routineTitle(job, fallback))}
          />
        );
      })}
    </ul>
  );
}
