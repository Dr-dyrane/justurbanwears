import { permanentRedirect } from "next/navigation";

export default async function GarmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/studio/wardrobe/${encodeURIComponent(id)}`);
}
