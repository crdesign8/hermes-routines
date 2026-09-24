// Compatibility shim (issue #5, phase-2).
// The canonical schedule-domain contract lives in ./schedule.ts.
// This module preserves all legacy import paths by re-exporting the
// canonical contract with zero semantic change: identical names,
// signatures, types, constants, and output strings.
// Only the legacy composer surface is re-exported (not the humanizer
// additions in schedule.ts) so `export *` chains through plugin.tsx
// keep resolving exactly as before.
// The explicit `.ts` extension is required so plain `node --test` (no
// loader, native type stripping) resolves this import at runtime; the
// @ts-ignore silences TS5097 under `moduleResolution: Bundler`
// without the allowImportingTsExtensions flag (typecheck stays clean).
// @ts-ignore TS5097: intentional explicit .ts extension for node runtime
export { buildCronExpression, DAYS_OF_MONTH, DAYS_OF_WEEK, DEFAULT_SCHEDULE_CONFIG, describeScheduleConfig, generateTimeSlots, INTERVAL_UNITS, INTERVAL_VALUES, TIME_SLOTS, toOrdinal, TRIGGER_OPTIONS, validateScheduleConfig, type DayOfWeek, type IntervalUnit, type ScheduleConfig, type TriggerType } from './schedule.ts';
