import { permanentRedirect } from "next/navigation";

export default async function ShootDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/studio/media/${encodeURIComponent(id)}`);
}
