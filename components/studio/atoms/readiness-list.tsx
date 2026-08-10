import { Check, Circle } from "lucide-react";
import type { ReadinessGate } from "../../../lib/studio/domain/readiness";

export function ReadinessList({ gates, compact = false }: { gates: ReadinessGate[]; compact?: boolean }) {
  return (
    <ul className={compact ? "studio-gates is-compact" : "studio-gates"}>
      {gates.map((gate) => (
        <li className={gate.ready ? "is-ready" : undefined} key={gate.id}>
          {gate.ready
            ? <Check aria-hidden="true" size={15} strokeWidth={2.2} />
            : <Circle aria-hidden="true" size={15} strokeWidth={1.8} />}
          <span>{gate.label}</span>
        </li>
      ))}
    </ul>
  );
}
