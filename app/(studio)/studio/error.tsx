"use client";

import { useEffect } from "react";
import { StudioRouteRecovery } from "../../../components/studio/navigation/studio-route-recovery";

export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <StudioRouteRecovery kind="error" onRetry={reset} />;
}
