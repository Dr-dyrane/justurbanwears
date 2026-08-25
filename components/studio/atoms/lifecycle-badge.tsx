import type { StudioLifecycleState } from "../../../lib/studio/domain/entities";
import { LifecycleMeta } from "./lifecycle-meta";

export function LifecycleBadge({ state }: { state: StudioLifecycleState }) {
  return (
    <LifecycleMeta
      className={`studio-lifecycle studio-lifecycle-${state.toLowerCase()}`}
      state={state}
    />
  );
}
