import type { ReactNode } from "react";
import studioAdaptiveWorkspaceCss from "../../../../studio-adaptive-workspace.css?raw";

export default function StudioGarmentDossierLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style data-studio-adaptive-workspace-css>{studioAdaptiveWorkspaceCss}</style>
      {children}
    </>
  );
}
