import { WardrobeWorkbench } from "../../../../components/studio/wardrobe-workbench";

export const dynamic = "force-dynamic";

export default function StudioWardrobePage() {
  const engineEnabled = ["openai-sites", "neon-auth"].includes(process.env.STUDIO_AI_ENGINE_AUTH_MODE || "")
    && Boolean(process.env.STUDIO_OPERATOR_EMAILS?.trim());
  return <WardrobeWorkbench engineEnabled={engineEnabled} />;
}
