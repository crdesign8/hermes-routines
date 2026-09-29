import { useMemo, useState, type ReactElement } from 'react';
import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import {
  DAYS_OF_MONTH,
  DAYS_OF_WEEK,
  DEFAULT_SCHEDULE_CONFIG,
  INTERVAL_UNITS,
  INTERVAL_VALUES,
  TIME_SLOTS,
  TRIGGER_OPTIONS,
  buildCronExpression,
  describeScheduleConfig,
  type DayOfWeek,
  type IntervalUnit,
  type ScheduleConfig,
  type TriggerType,
} from '../domain/routineSchedule';
import { SelectField, type SelectOption } from './SelectField';
import {
  DELIVERY_CUSTOM_SENTINEL,
  DELIVERY_PRESET_OPTIONS,
  MODEL_OVERRIDE_READONLY_NOTE,
  normalizeDelivery,
} from '../domain/advancedSettings';

export interface RoutineComposerPanelProps {
  activeProfile: string | null;
  activeRoute: PluginProfileRoute | null;
  disabled: boolean;
  onClose: () => void;
  /**
   * Direct path. `delivery` is the normalized target, or undefined for the
   * backend default (absent — the `deliver` key is omitted entirely).
   * Optional so pre-#65 four-argument callers keep working.
   */
  onSubmit: (
    name: string,
    schedule: string,
    prompt: string,
    active: boolean,
    delivery?: string,
  ) => Promise<boolean>;
  /**
   * Guided path: create the routine PAUSED and hand back its authoritative
   * handle so the page can open a configuration chat for it. Omitted (or
   * refused by the caller) keeps the ordinary form path untouched.
   * `delivery` carries the same meaning as on `onSubmit`.
   */
  onSubmitGuided?: (name: string, schedule: string, prompt: string, delivery?: string) => Promise<boolean>;
}

export function RoutineComposerPanel({
  disabled,
  onClose,
  onSubmit,
  onSubmitGuided,
}: RoutineComposerPanelProps): ReactElement {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [active, setActive] = useState(true);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>(DEFAULT_SCHEDULE_CONFIG);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'direct' | 'guided'>(onSubmitGuided ? 'guided' : 'direct');
  // Advanced section slots, APPENDED after the original seven (name,
  // prompt, active, scheduleConfig, submitting, error, mode) — never
  // inserted: tests drive this component with a positional FIFO preset
  // queue (reactStub.__presetStates), so order is contract.
  const [deliveryChoice, setDeliveryChoice] = useState('');
  const [deliveryCustom, setDeliveryCustom] = useState('');

  const timeOptions: Array<SelectOption<string>> = useMemo(
    () => TIME_SLOTS.map((t) => ({ value: t, label: t })),
    [],
  );

  const dayOfWeekOptions: Array<SelectOption<DayOfWeek>> = useMemo(
    () => DAYS_OF_WEEK.map((d) => ({ value: d, label: d })),
    [],
  );

  const intervalValueOptions: Array<SelectOption<number>> = useMemo(
    () => INTERVAL_VALUES.map((v) => ({ value: v, label: String(v) })),
    [],
  );

  const intervalUnitOptions: Array<SelectOption<IntervalUnit>> = useMemo(
    () => INTERVAL_UNITS.map((u) => ({ value: u, label: u })),
    [],
  );

  const deliveryOptions: Array<SelectOption<string>> = useMemo(
    () => DELIVERY_PRESET_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    [],
  );

  const cronExpr = useMemo(() => buildCronExpression(scheduleConfig), [scheduleConfig]);
  const humanSentence = useMemo(() => describeScheduleConfig(scheduleConfig), [scheduleConfig]);

  async function handleSubmit(): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName || submitting || disabled) return;

    // The backend runs the top-level prompt string; an empty instruction
    // is rejected here so the form fails fast instead of round-tripping.
    const promptText = prompt.trim();
    if (!promptText) {
      setError('Describe what this routine should do.');
      return;
    }

    // Advanced delivery, manual path: the SAME normalizer the guided
    // proposal path calls (D6), so the two cannot diverge. An invalid
    // typed value is refused with a visible error — never submitted,
    // never silently dropped.
    const candidate = deliveryChoice === DELIVERY_CUSTOM_SENTINEL ? deliveryCustom : deliveryChoice;
    const normalized = normalizeDelivery(candidate);
    if (!normalized.ok) {
      setError(normalized.message);
      return;
    }
    const delivery = normalized.present ? normalized.delivery : undefined;

    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'guided' && onSubmitGuided) {
        // The guided path is deliberately not a variation of the Active
        // toggle: it always creates PAUSED, because a routine whose
        // configuration is an unfinished conversation must not be runnable.
        // Absent delivery stays absent from the call as well (never an
        // explicit undefined fourth argument): the guided handler's arity
        // is pinned — it never receives an active flag, and it receives a
        // delivery only when one was chosen.
        const ok = await (delivery === undefined
          ? onSubmitGuided(trimmedName, cronExpr, promptText)
          : onSubmitGuided(trimmedName, cronExpr, promptText, delivery));
        if (!ok) {
          setError('Failed to create routine. Please verify parameters.');
        }
        return;
      }
      // The name is submitted as typed (trimmed): it is a human-readable
      // title, not a technical id — Hermes generates the job_id. Absent
      // delivery stays absent from the call, mirroring the guided path.
      const ok = await (delivery === undefined
        ? onSubmit(trimmedName, cronExpr, promptText, active)
        : onSubmit(trimmedName, cronExpr, promptText, active, delivery));
      if (!ok) {
        setError('Failed to create routine. Please verify parameters.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create routine.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="hr-inspector hr-create-inspector" aria-label="Create Routine">
      <header className="hr-inspector-header">
        <button
          type="button"
          className="hr-btn-action hr-btn-back"
          onClick={onClose}
          aria-label="Back to routines"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <path
              fillRule="evenodd"
              d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
            />
          </svg>
          <span>Back to routines</span>
        </button>
      </header>

      <div className="hr-inspector-body">
        <h3 className="hr-create-title">Create Routine</h3>

        {/* Creation path. The guided one creates the routine paused and
            opens a Hermes chat to finish configuring it; the direct one is
            the ordinary form. Both collect the same fields, so the only
            difference the user sees is what happens next. */}
        {onSubmitGuided ? (
          <div className="hr-create-active-card">
            <div className="hr-create-active-info">
              <span className="hr-create-active-title">Configure with Hermes</span>
              <span className="hr-create-active-subtitle">
                {mode === 'guided'
                  ? 'Creates the routine paused, then opens a chat to finish configuring it.'
                  : 'Creates the routine right away with the settings below.'}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={mode === 'guided'}
              aria-label="Toggle guided configuration"
              className={`hr-switch-pill ${mode === 'guided' ? 'hr-switch-active' : ''}`}
              onClick={() => setMode(mode === 'guided' ? 'direct' : 'guided')}
            >
              <span className="hr-switch-thumb" />
            </button>
          </div>
        ) : null}

        {/* Active Toggle Card — the direct path only. A guided routine is
            always created paused, so a toggle here would promise something
            the guided path does not do. */}
        {mode === 'direct' ? (
          <div className="hr-create-active-card">
            <div className="hr-create-active-info">
              <span className="hr-create-active-title">Active</span>
              <span className="hr-create-active-subtitle">This routine will run on the schedule below.</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={active}
              aria-label="Toggle routine active state"
              className={`hr-switch-pill ${active ? 'hr-switch-active' : ''}`}
              onClick={() => setActive(!active)}
            >
              <span className="hr-switch-thumb" />
            </button>
          </div>
        ) : null}

        {/* Name Input */}
        <div className="hr-create-field">
          <label className="hr-field-label">Name</label>
          <input
            type="text"
            className="hr-create-input"
            placeholder="Name this Routine"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name this Routine"
          />
        </div>

        {/* What should this routine do Textarea */}
        <div className="hr-create-field">
          <label className="hr-field-label">What should this routine do?</label>
          <textarea
            className="hr-create-textarea"
            placeholder="e.g. Check server health and notify #ops channel"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            aria-label="What should this routine do?"
          />
        </div>

        {/* WHEN TO RUN Section */}
        <div className="hr-create-when-section">
          <div className="hr-create-section-label">WHEN TO RUN</div>

          {/* Trigger Dropdown */}
          <SelectField<TriggerType>
            label="Trigger"
            value={scheduleConfig.trigger}
            options={TRIGGER_OPTIONS}
            onChange={(val) => setScheduleConfig((prev) => ({ ...prev, trigger: val }))}
          />

          {/* Sub-selectors */}
          {scheduleConfig.trigger === 'every_day' || scheduleConfig.trigger === 'weekdays' ? (
            <div className="hr-create-sub-row">
              <SelectField<string>
                label="at"
                value={scheduleConfig.time}
                options={timeOptions}
                onChange={(val) => setScheduleConfig((prev) => ({ ...prev, time: val }))}
              />
            </div>
          ) : null}

          {scheduleConfig.trigger === 'every_week' ? (
            <div className="hr-create-sub-split">
              <SelectField<DayOfWeek>
                label="on"
                value={scheduleConfig.dayOfWeek}
                options={dayOfWeekOptions}
                onChange={(val) => setScheduleConfig((prev) => ({ ...prev, dayOfWeek: val }))}
              />
              <SelectField<string>
                label="at"
                value={scheduleConfig.time}
                options={timeOptions}
                onChange={(val) => setScheduleConfig((prev) => ({ ...prev, time: val }))}
              />
            </div>
          ) : null}

          {scheduleConfig.trigger === 'every_month' ? (
            <div className="hr-create-sub-split">
              <SelectField<number>
                label="on the"
                value={scheduleConfig.dayOfMonth}
                options={DAYS_OF_MONTH}
                onChange={(val) => setScheduleConfig((prev) => ({ ...prev, dayOfMonth: val }))}
              />
              <SelectField<string>
                label="at"
                value={scheduleConfig.time}
                options={timeOptions}
                onChange={(val) => setScheduleConfig((prev) => ({ ...prev, time: val }))}
              />
            </div>
          ) : null}

          {scheduleConfig.trigger === 'interval' ? (
            <div className="hr-create-sub-split">
              <SelectField<number>
                label="every"
                value={scheduleConfig.intervalValue}
                options={intervalValueOptions}
                onChange={(val) => setScheduleConfig((prev) => ({ ...prev, intervalValue: val }))}
              />
              <SelectField<IntervalUnit>
                label="unit"
                value={scheduleConfig.intervalUnit}
                options={intervalUnitOptions}
                onChange={(val) => setScheduleConfig((prev) => ({ ...prev, intervalUnit: val }))}
              />
            </div>
          ) : null}

          {/* Subtitle natural sentence preview */}
          <div className="hr-create-preview-sentence">{humanSentence}</div>
        </div>

        {/* ADVANCED Section — secondary, after WHEN TO RUN. The primary
            composer above stays focused on name / instruction / schedule;
            everything here is an override of the backend default, and
            absent means absent. Delivery offers ONLY the verified D3
            options that need no discovery: `origin` is not offered (it
            cannot resolve for a plugin create), and there is deliberately
            NO model picker — the override is shown as a read-only line
            (D2), because an editable control that silently does nothing
            is the failure the issue forbids. */}
        <div className="hr-create-when-section">
          <div className="hr-create-section-label">ADVANCED</div>
          <SelectField<string>
            label="Delivery"
            value={deliveryChoice}
            options={deliveryOptions}
            onChange={(val) => setDeliveryChoice(val)}
          />
          {deliveryChoice === DELIVERY_CUSTOM_SENTINEL ? (
            <div className="hr-create-field">
              <label className="hr-field-label">Custom delivery target</label>
              <input
                type="text"
                className="hr-create-input"
                placeholder="platform:chat_id or bot-chat:profile"
                value={deliveryCustom}
                onChange={(e) => setDeliveryCustom(e.target.value)}
                aria-label="Custom delivery target"
              />
            </div>
          ) : null}
          <div className="hr-create-field">
            <label className="hr-field-label">Model override</label>
            <div className="hr-create-preview-sentence">{MODEL_OVERRIDE_READONLY_NOTE}</div>
          </div>
        </div>

        {error ? (
          <div className="hr-create-error" role="alert">
            {error}
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="hr-create-actions">
          <button
            type="button"
            className="hr-btn hr-btn-back-routines"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="hr-btn hr-btn-create-submit"
            disabled={!name.trim() || !prompt.trim() || submitting || disabled}
            onClick={handleSubmit}
          >
            {submitting
              ? 'Creating…'
              : mode === 'guided' && onSubmitGuided
                ? 'Create & Configure with Hermes'
                : 'Create Routine'}
          </button>
        </div>
      </div>
    </aside>
  );
}
