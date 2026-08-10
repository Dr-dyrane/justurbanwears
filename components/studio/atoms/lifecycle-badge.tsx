import type { StudioLifecycleState } from "../../../lib/studio/domain/entities";

export function LifecycleBadge({ state }: { state: StudioLifecycleState }) {
  return (
    <span className={`studio-lifecycle studio-lifecycle-${state.toLowerCase()}`}>
      <i aria-hidden="true" />
      {state.toLowerCase()}
    </span>
  );
}
