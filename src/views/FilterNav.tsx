import type { ReactElement } from 'react';
import type { RoutineFilter } from '../domain/jobs';

// In-view filter navigation. Pure: filters in, one callback out. The
// current filter is marked with aria-current so keyboard and screen
// reader users can tell which slice is showing.
//
// Each chip carries the number of rows it would reveal (issue #79). The
// count used to live in a separate "Showing all N routines." line below
// the chips, where it only restated the chip already marked as current;
// putting it on the chip itself makes every slice's size legible at a
// glance and leaves nothing painted twice. The count is announced through
// the chip's accessible name, so the visual number is never read twice.

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
] as const satisfies readonly { value: RoutineFilter; label: string }[];

export interface FilterNavProps {
  filter: RoutineFilter;
  disabled: boolean;
  /**
   * Rows each chip would reveal, over the search-matched set. Omitting it
   * renders the labels alone, so a caller without counts cannot paint a
   * number it cannot compute.
   */
  counts?: Record<RoutineFilter, number>;
  onSelect: (value: RoutineFilter) => void;
}

export function FilterNav({ filter, disabled, counts, onSelect }: FilterNavProps): ReactElement {
  return (
    <nav className="hr-filters" aria-label="Filter routines by status">
      {FILTER_OPTIONS.map((entry) => {
        const count = counts ? counts[entry.value] : null;
        return (
          <button
            key={entry.value}
            type="button"
            className={'hr-filter-chip' + (filter === entry.value ? ' hr-filter-chip-current' : '')}
            aria-current={filter === entry.value ? 'true' : undefined}
            // One accessible name for the whole control: a bare "All 15"
            // would announce a label and a bare number, and the live
            // region below the list already announces the settled count.
            aria-label={
              count === null ? undefined : `${entry.label} — ${count} ${count === 1 ? 'routine' : 'routines'}`
            }
            disabled={disabled}
            onClick={() => onSelect(entry.value)}
          >
            {entry.label}
            {count === null ? null : (
              <span className="hr-filter-count" aria-hidden="true">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
