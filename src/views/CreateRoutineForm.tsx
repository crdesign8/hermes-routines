import type { FormEvent } from 'react';

// Create form for one routine: local shape validation runs first (through
// the domain builders), then `cron.manage add` scoped to the selected
// profile route. Pure — drafts and submit handling live in the page.

export interface CreateRoutineFormProps {
  draftId: string;
  draftSchedule: string;
  locked: boolean;
  canSubmit: boolean;
  onDraftIdChange: (value: string) => void;
  onDraftScheduleChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function CreateRoutineForm(props: CreateRoutineFormProps) {
  return (
    <form className="hr-form" onSubmit={props.onSubmit}>
      <fieldset className="hr-fieldset">
        <legend>Create routine</legend>
        <label htmlFor="hermes-routines-job" className="hr-label">
          Routine id
        </label>
        <input
          id="hermes-routines-job"
          className="hr-input"
          name="job_id"
          autoComplete="off"
          maxLength={128}
          value={props.draftId}
          disabled={props.locked}
          onChange={(event) => props.onDraftIdChange(event.target.value)}
          placeholder="e.g. morning-brief"
        />
        <label htmlFor="hermes-routines-schedule" className="hr-label">
          Schedule
        </label>
        <input
          id="hermes-routines-schedule"
          className="hr-input"
          name="schedule"
          autoComplete="off"
          maxLength={256}
          value={props.draftSchedule}
          disabled={props.locked}
          onChange={(event) => props.onDraftScheduleChange(event.target.value)}
          placeholder="e.g. 0 9 * * MON"
        />
        <p className="hr-row-meta">
          Validated locally, then saved with cron.manage on the selected profile.
        </p>
        <button
          type="submit"
          className="hr-btn hr-btn-primary"
          disabled={props.locked || !props.canSubmit}
        >
          {props.locked ? 'Saving…' : 'Create routine'}
        </button>
      </fieldset>
    </form>
  );
}
