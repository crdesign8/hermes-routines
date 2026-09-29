import { useMemo, useRef, useState, type ReactElement } from 'react';
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

/**
 * How the routine leaves this form. Not a stored preference: the two
 * creation paths are two DIFFERENT acts, so the choice is made by pressing
 * the act itself instead of by toggling a property first (issue #72).
 */
type CreationPath = 'direct' | 'guided';

export function RoutineComposerPanel({
  disabled,
  onClose,
  onSubmit,
  onSubmitGuided,
}: RoutineComposerPanelProps): ReactElement {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [startEnabled, setStartEnabled] = useState(true);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>(DEFAULT_SCHEDULE_CONFIG);
  // Which act is in flight, if any. One slot, not a boolean plus a label:
  // "which button is busy" and "is the form busy" are the same question, and
  // keeping them apart would let the buttons disagree with each other.
  const [pendingPath, setPendingPath] = useState<CreationPath | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Advanced section slots, APPENDED after the originals (name, prompt,
  // startEnabled, scheduleConfig, pendingPath, error) — never inserted:
  // tests drive this component with a positional FIFO preset queue
  // (reactStub.__presetStates), so order is contract.
  const [deliveryChoice, setDeliveryChoice] = useState('');
  const [deliveryCustom, setDeliveryCustom] = useState('');
  // Synchronous in-flight claim. A ref, not state: `setPendingPath` only
  // paints on the next render, so two clicks in one tick would both read
  // `pendingPath === null` and create the routine twice — a create is not
  // idempotent, and the backend mints a second job. It carries no display
  // information, so it needs no state.
  const inFlightRef = useRef(false);

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

  // The floor the BACKEND imposes on any create, not a completeness rule
  // this form invented: `cron.manage` `add` has no paused key and the
  // backend refuses a job with a blank prompt, and the composer always has
  // a schedule. Everything past this pair is what the guided session asks
  // about, which is why the assisted path is offered on a partial draft.
  const draftReady = name.trim() !== '' && prompt.trim() !== '';
  const busy = pendingPath !== null || disabled;

  async function handleSubmit(path: CreationPath): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;

    // The backend runs the top-level prompt string; an empty instruction
    // is rejected here so the form fails fast instead of round-tripping.
    const promptText = prompt.trim();
    if (!promptText) {
      setError('Describe what this routine should do.');
      return;
    }

    // Advanced delivery, both paths: the SAME normalizer the guided
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

    // Claim the act before the first await, not after the re-render: two
    // clicks in one tick both read `pendingPath === null`, and a create is
    // NOT idempotent — the backend mints a second routine. The ref is the
    // synchronous half of that guard; state is what paints it.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setPendingPath(path);
    setError(null);
    try {
      if (path === 'guided') {
        // No guided handler means the act does not exist — and the only
        // safe answer is to do nothing. Falling through would run the
        // DIRECT create for a press on the assisted path.
        if (!onSubmitGuided) return;
        // The guided path is deliberately not a variation of the
        // Start enabled switch: it always creates PAUSED, because a
        // routine whose configuration is an unfinished conversation must
        // not be runnable — so the `startEnabled` decision is not even
        // offered on it, and the handler arity (name, schedule, prompt,
        // delivery) is pinned with no active flag. The trailing
        // `delivery` is undefined for the backend default.
        const ok = await onSubmitGuided(trimmedName, cronExpr, promptText, delivery);
        if (!ok) {
          setError('Failed to create routine. Please verify parameters.');
        }
        return;
      }
      // The name is submitted as typed (trimmed): it is a human-readable
      // title, not a technical id — Hermes generates the job_id.
      const ok = await onSubmit(trimmedName, cronExpr, promptText, startEnabled, delivery);
      if (!ok) {
        setError('Failed to create routine. Please verify parameters.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create routine.';
      setError(message);
    } finally {
      inFlightRef.current = false;
      setPendingPath(null);
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

        {/* The form starts with the user's intent, in their words: what to
            automate, then when. The two creation paths are offered at the
            BOTTOM as two acts, not as a setting above the fields (issue
            #72) — a toggle would promise a durable property the guided
            path does not have, and would ask how the mechanism works
            before asking what should be automated. */}

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

        {/* Start enabled — a CREATION outcome, not an existing state. The
            copy states what happens to the routine this act creates, which
            is the whole difference from the "Active" label an existing
            routine carries in the inspector. */}
        <div className="hr-create-active-card">
          <div className="hr-create-active-info">
            <span className="hr-create-active-title">Start enabled</span>
            <span className="hr-create-active-subtitle">
              {startEnabled
                ? 'The routine runs on the schedule above as soon as it is created.'
                : 'The routine is created paused, so it waits until you turn it on yourself.'}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={startEnabled}
            aria-label="Start the routine enabled"
            className={`hr-switch-pill ${startEnabled ? 'hr-switch-active' : ''}`}
            onClick={() => setStartEnabled(!startEnabled)}
          >
            <span className="hr-switch-thumb" />
          </button>
        </div>

        {error ? (
          <div className="hr-create-error" role="alert">
            {error}
          </div>
        ) : null}

        {/* Finish with Hermes — the secondary COMPLETION path, next to the
            final actions. It is a button, not a switch, because choosing
            it is an act (create paused, then open a configuration chat),
            not a property the routine keeps. The card says what Hermes
            does and why the user would pick it, and it accepts a partial
            draft: anything left vague is exactly what the session asks
            about, and nothing vague can run because the routine is paused
            until a proposal is reviewed and applied. */}
        {onSubmitGuided ? (
          <section className="hr-create-hermes-card" aria-labelledby="hr-create-hermes-title">
            <div className="hr-create-hermes-info">
              <span className="hr-create-hermes-title" id="hr-create-hermes-title">
                Finish with Hermes
              </span>
              <span className="hr-create-hermes-subtitle">
                Hermes reviews this draft in a chat, asks about whatever is still missing, and
                completes the setup for you. Nothing here has to be finished first.
              </span>
            </div>
            <button
              type="button"
              className="hr-btn hr-btn-create-hermes"
              aria-label="Create this routine and finish the setup with Hermes"
              disabled={!draftReady || busy}
              onClick={() => void handleSubmit('guided')}
            >
              {pendingPath === 'guided' ? 'Starting…' : 'Finish with Hermes'}
            </button>
            <span className="hr-create-hermes-hint">
              {draftReady
                ? 'The routine is created paused and stays paused until you review what Hermes proposes.'
                : 'Add a name and an instruction, and the rest is what the conversation is for.'}
            </span>
          </section>
        ) : null}

        {/* Final actions */}
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
            disabled={!draftReady || busy}
            onClick={() => void handleSubmit('direct')}
          >
            {pendingPath === 'direct' ? 'Creating…' : 'Create Routine'}
          </button>
        </div>
      </div>
    </aside>
  );
}
