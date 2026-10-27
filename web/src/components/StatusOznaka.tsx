import type { Status } from "../lib/data";
import { STATUS } from "../lib/format";

export function StatusOznaka({ status, mala }: { status: Status; mala?: boolean }) {
  const s = STATUS[status];
  return (
    <span className={`status st-${status}`} style={mala ? { fontSize: "0.8rem" } : undefined}>
      <span className="ik" aria-hidden="true">
        {s.ikona}
      </span>
      {s.oznaka}
    </span>
  );
}
