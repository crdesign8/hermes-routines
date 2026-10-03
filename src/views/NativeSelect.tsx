import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hermes/plugin-sdk';
import type { ReactElement } from 'react';

// Labelled select over the host UI kit's Radix primitives (issue #100).
//
// This replaces the hand-written combobox that used to live in
// SelectField.tsx. The old control re-implemented what Radix already ships:
// outside-click dismissal, active-item scroll-into-view, arrow-key roving,
// Escape-to-close. All of that is now the host's, which means it is also
// focus-trapped, type-ahead, screen-reader-correct and styled by the theme.
//
// The label stays OUTSIDE the trigger on purpose. Upstream's SelectTrigger
// is a single-line control surface; rendering a block label inside it would
// fight the control's fixed height and its own padding. Keeping <label> as a
// sibling preserves the click-the-label-to-focus affordance a bare
// aria-label gave away, and it keeps the visual label the composer always
// had ("Trigger", "at", "on the", "unit").
//
// Values cross the boundary as STRINGS: upstream's Radix Select is
// string-only, so a number/union option value is serialized on the way in
// and parsed on the way out. A parse miss returns the incoming value
// unchanged rather than coercing to undefined — a select that silently
// resets the form is worse than one that keeps what the user had.

export interface SelectOption<T = string | number> {
  value: T;
  label: string;
}

export interface NativeSelectProps<T = string | number> {
  label: string;
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
  /** Accessible name when the visible label alone is not descriptive enough. */
  'aria-label'?: string;
}

export function NativeSelect<T = string | number>({
  label,
  value,
  options,
  onChange,
  className = '',
  disabled = false,
  'aria-label': ariaLabel,
}: NativeSelectProps<T>): ReactElement {
  const encoded = String(value);
  const selected = options.find((option) => String(option.value) === encoded);

  return (
    <div className={`hr-select ${className}`.trim()}>
      <span className="hr-field-label" id={`hr-select-label-${encoded}`}>
        {label}
      </span>
      <Select
        disabled={disabled}
        // An option list always holds a selection, so the placeholder is the
        // first option's own label rather than a synthetic "Choose…".
        value={encoded}
        onValueChange={(next) => {
          const match = options.find((option) => String(option.value) === next);
          if (match !== undefined) onChange(match.value);
        }}
      >
        <SelectTrigger aria-label={ariaLabel ?? label}>
          <SelectValue placeholder={selected?.label ?? options[0]?.label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={String(option.value)} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
