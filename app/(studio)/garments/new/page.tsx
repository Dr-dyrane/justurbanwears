import { permanentRedirect } from "next/navigation";

export default function NewGarmentPage() {
  permanentRedirect("/studio/wardrobe?intake=1");
}
