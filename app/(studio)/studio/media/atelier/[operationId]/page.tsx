import type { Metadata } from "next";
import { StudioAtelierOperationWorkspace } from "../../../../../../components/studio/atelier/studio-atelier-operation-workspace";

export const metadata: Metadata = {
  title: "Atelier operation · Studio",
  description: "Recover and review one private durable Atelier operation.",
};

export default async function StudioAtelierOperationPage({
  params,
}: Readonly<{ params: Promise<Readonly<{ operationId: string }>> }>) {
  const { operationId } = await params;
  return <StudioAtelierOperationWorkspace operationId={operationId} />;
}
