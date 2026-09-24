import type { ReactElement } from 'react';
import type { RoutineFilter } from '../domain/jobs';

// In-view filter navigation. Pure: filter in, one callback out. The
// current filter is marked with aria-current so keyboard and screen
// reader users can tell which slice is showing.

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
] as const satisfies readonly { value: RoutineFilter; label: string }[];

export interface FilterNavProps {
  filter: RoutineFilter;
  disabled: boolean;
  onSelect: (value: RoutineFilter) => void;
}

export function FilterNav({ filter, disabled, onSelect }: FilterNavProps): ReactElement {
  return (
    <nav className="hr-filters" aria-label="Filter routines by status">
      {FILTER_OPTIONS.map((entry) => (
        <button
          key={entry.value}
          type="button"
          className={'hr-filter-chip' + (filter === entry.value ? ' hr-filter-chip-current' : '')}
          aria-current={filter === entry.value ? 'true' : undefined}
          disabled={disabled}
          onClick={() => onSelect(entry.value)}
        >
          {entry.label}
        </button>
      ))}
    </nav>
  );
}
