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
import { PanelNav } from './PanelNav';
import {
  BROADCAST_ACKNOWLEDGEMENT,
  BROADCAST_ADDRESS_ACTION,
  BROADCAST_ADVANCED_ACTION,
  DESTINATION_ADVANCED,
  composerDestinationDelivery,
  destinationOptions,
  findDestinationOption,
  type AdvancedDestinationInput,
  type DestinationOption,
} from '../domain/destinations';

export interface RoutineComposerPanelProps {
  activeProfile: string | null;
  activeRoute: PluginProfileRoute | null;
  disabled: boolean;
  onClose: () => void;
  /**
   * Direct path. `delivery` is the normalized target, or undefined for the
   * profile's own default (absent — the `deliver` key is omitted entirely).
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
  /**
   * Destinations the profile actually exposes (issue #73), normally the
   * resolved route roster. Omitted means "nothing discovered" — the picker
   * then offers only the two outcomes that always exist plus the advanced
   * override, never an invented destination.
   */
  destinationRoutes?: unknown;
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
  destinationRoutes,
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
  // Results section slots, APPENDED after the originals (name, prompt,
  // startEnabled, scheduleConfig, pendingPath, error) — never inserted:
  // tests drive this component with a positional FIFO preset queue
  // (reactStub.__presetStates), so order is contract. `destinationChoice`
  // replaces the pre-#73 `deliveryChoice`/`deliveryCustom` pair: one
  // answer to "where do results go", plus the structured fields of the
  // developer override behind it.
  const [destinationChoice, setDestinationChoice] = useState('');
  const [advancedPlatform, setAdvancedPlatform] = useState('');
  const [advancedChatId, setAdvancedChatId] = useState('');
  const [advancedThreadId, setAdvancedThreadId] = useState('');
  const [broadcastConfirmed, setBroadcastConfirmed] = useState(false);
  // Appended, never inserted: tests drive this component with a positional
  // FIFO preset queue. Fan-out is not a picker value; it is an explicit act
  // inside the advanced path (issue #90).
  const [broadcastOptIn, setBroadcastOptIn] = useState(false);
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

  // Destinations the profile really exposes, resolved from the roster the
  // page hands down. The advanced override is a UI affordance, not a
  // destination, so it is added here rather than in the domain builder —
  // the domain never offers it, so it can never be a suggestion.
  const destinationChoices: DestinationOption[] = useMemo(
    () => [
      ...destinationOptions(destinationRoutes),
      {
        value: DESTINATION_ADVANCED,
        label: 'Advanced override…',
        detail: 'Name a platform and address directly, if you need to.',
        broadcast: false,
      },
    ],
    [destinationRoutes],
  );

  const selectedDestination: DestinationOption | null = findDestinationOption(
    destinationChoices,
    destinationChoice,
  );

  const advancedInput: AdvancedDestinationInput = useMemo(
    () => ({
      platform: advancedPlatform,
      chatId: advancedChatId,
      threadId: advancedThreadId,
    }),
    [advancedPlatform, advancedChatId, advancedThreadId],
  );

  // Fan-out is not a picker row. It exists only after the user opens the
  // advanced path and then chooses it — opening advanced does not select it,
  // and a primary value of `all` cannot submit (issue #90).
  const broadcastPending = destinationChoice === DESTINATION_ADVANCED && broadcastOptIn;
  const broadcastBlocked = broadcastPending && !broadcastConfirmed;

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

    // Results destination, both paths: the SAME normalizer the guided
    // proposal path calls (D6), so the two cannot diverge. An invalid
    // structured override is refused with a visible error — never
    // submitted, never silently dropped.
    const normalized = composerDestinationDelivery(destinationChoice, advancedInput, {
      optedIn: broadcastOptIn,
      confirmed: broadcastConfirmed,
    });
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
        {/* The form covers the list on a narrow viewport (Back) and sits
            beside it in the split view (dismiss) — issue #78. */}
        <PanelNav closeLabel="Cancel and close the create form" onClose={onClose} />
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

        {/* RESULTS Section — secondary, after WHEN TO RUN, and phrased as
            the question the user actually has (issue #73): "where should
            results go?". The options are the destinations the profile
            really exposes, named in human terms; the backend string is
            generated by the domain, never typed here. `origin` is not
            offered (it cannot resolve for a plugin create) and no
            unreachable destination is listed — a destination that cannot
            resolve is a dead one. There is deliberately NO model picker:
            the override is shown as a read-only line (D2), because an
            editable control that silently does nothing is the failure the
            issue forbids. */}
        <div className="hr-create-when-section">
          <div className="hr-create-section-label">RESULTS</div>
          <SelectField<string>
            label="Where should results go?"
            value={destinationChoice}
            options={destinationChoices.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(val) => {
              setDestinationChoice(val);
              setBroadcastOptIn(false);
              setBroadcastConfirmed(false);
            }}
          />
          {selectedDestination !== null ? (
            <div className="hr-create-preview-sentence">{selectedDestination.detail}</div>
          ) : null}

          {/* The developer escape hatch: structured fields, never one
              protocol string, and hidden behind an explicit choice so it
              cannot be the path a normal user takes by accident. */}
          {destinationChoice === DESTINATION_ADVANCED && !broadcastOptIn ? (
            <div className="hr-create-field">
              <label className="hr-field-label">Advanced destination override</label>
              <div className="hr-create-sub-split">
                <input
                  type="text"
                  className="hr-create-input"
                  placeholder="Platform"
                  value={advancedPlatform}
                  onChange={(e) => setAdvancedPlatform(e.target.value)}
                  aria-label="Advanced destination platform"
                />
                <input
                  type="text"
                  className="hr-create-input"
                  placeholder="Channel or chat id"
                  value={advancedChatId}
                  onChange={(e) => setAdvancedChatId(e.target.value)}
                  aria-label="Advanced destination channel or chat id"
                />
              </div>
              <input
                type="text"
                className="hr-create-input"
                placeholder="Thread id (optional)"
                value={advancedThreadId}
                onChange={(e) => setAdvancedThreadId(e.target.value)}
                aria-label="Advanced destination thread id"
              />
              <div className="hr-create-preview-sentence">
                {selectedDestination?.detail ?? ''}
              </div>
              {/* Quiet opt-in: asking for the fan-out guard is not itself a
                  risk, so it takes no bordered surface. The bordered card
                  below is reserved for the acknowledged fan-out state. */}
              <div className="hr-create-broadcast-quiet">
                <p className="hr-create-broadcast-note">
                  Sending to every connected channel is not a normal destination.
                </p>
                <button
                  type="button"
                  className="hr-btn"
                  onClick={() => {
                    setBroadcastOptIn(true);
                    setBroadcastConfirmed(false);
                  }}
                >
                  {BROADCAST_ADVANCED_ACTION}
                </button>
              </div>
            </div>
          ) : null}

          {broadcastPending ? (
            <div className="hr-create-broadcast-card">
              <p className="hr-create-broadcast-note">
                Results are delivered to every channel this profile is connected to. Nothing narrows
                this later.
              </p>
              <label className="hr-create-broadcast-check">
                <input
                  type="checkbox"
                  checked={broadcastConfirmed}
                  onChange={(e) => setBroadcastConfirmed(e.target.checked)}
                  aria-label={BROADCAST_ACKNOWLEDGEMENT}
                />
                <span>{BROADCAST_ACKNOWLEDGEMENT}</span>
              </label>
              <button
                type="button"
                className="hr-btn"
                onClick={() => {
                  setBroadcastOptIn(false);
                  setBroadcastConfirmed(false);
                }}
              >
                {BROADCAST_ADDRESS_ACTION}
              </button>
            </div>
          ) : null}

          {/* No model block here (issue #74): the RPC the plugin calls has
              no `model`/`provider` key, so any control would be a lie.
              A setting that cannot be taken is not a field — the stored
              pin stays where it is honest, in the inspector's read-only
              report of what the backend actually holds. */}
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

        {/* Finish with Hermes — the secondary completion path, next to the
            final actions. It is a quiet secondary act, not a card: the
            attention-budget rule (CONTRIBUTING.md) reserves highlighted
            containers for the primary action, failure/risk, and immediate
            attention, and this optional path is none of those. One button
            plus one sentence carry it; the value is in the chat after the
            click, not in the size of the surface. It accepts a partial
            draft: anything left vague is what the session asks about, and
            nothing vague can run because the routine is created paused
            until a proposal is reviewed and applied. */}
        {onSubmitGuided ? (
          <section className="hr-create-hermes-quiet" aria-labelledby="hr-create-hermes-title">
            <span id="hr-create-hermes-title" className="hr-sr-only">
              Finish with Hermes
            </span>
            <button
              type="button"
              className="hr-btn hr-btn-create-hermes"
              aria-label="Create this routine and finish the setup with Hermes"
              disabled={!draftReady || busy || broadcastBlocked}
              onClick={() => void handleSubmit('guided')}
            >
              {pendingPath === 'guided' ? 'Starting…' : 'Finish with Hermes →'}
            </button>
            <p className="hr-create-hermes-note">
              Let Hermes review this paused routine in chat before you enable it.
            </p>
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
            disabled={!draftReady || busy || broadcastBlocked}
            onClick={() => void handleSubmit('direct')}
          >
            {pendingPath === 'direct' ? 'Creating…' : 'Create Routine'}
          </button>
        </div>
      </div>
    </aside>
  );
}
