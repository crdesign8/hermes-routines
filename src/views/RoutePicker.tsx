import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import { routeKey } from '../domain/routing';

// Route selector for the active connection. Pure: routes in, one callback
// out. Entries that fail routeKey validation are skipped rather than
// rendered with a broken key.

export interface RoutePickerProps {
  routes: PluginProfileRoute[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function RoutePicker({ routes, selectedKey, onSelect }: RoutePickerProps) {
  return (
    <div>
      <label htmlFor="hermes-routines-profile" className="hr-label">
        Profile connection
      </label>
      <select
        id="hermes-routines-profile"
        className="hr-select"
        value={selectedKey ?? ''}
        onChange={(event) => {
          const next = event.target.value;
          if (next) onSelect(next);
        }}
      >
        {routes.map((route) => {
          try {
            const key = routeKey(route);
            return <option key={key} value={key}>{key}</option>;
          } catch {
            return null;
          }
        })}
      </select>
    </div>
  );
}
