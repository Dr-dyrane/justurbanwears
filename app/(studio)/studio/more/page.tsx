import { Camera, ExternalLink, ScanLine, Settings2, Users } from "lucide-react";
import { StudioLink as Link } from "../../../../components/studio/atoms/studio-link";

const tools = [
  { href: "/studio/models", label: "Models", note: "Identity, consent and presentation authority.", icon: Users },
  { href: "/studio/media", label: "Media", note: "Private garment and Wear imagery.", icon: Camera },
  { href: "/studio/stocktake", label: "Stocktake", note: "Confirm what is physically in hand.", icon: ScanLine },
  { href: "/studio?settings=1", label: "Settings", note: "Studio preferences and operator controls.", icon: Settings2 },
  { href: "/shop", label: "Open Shop", note: "See the public wardrobe.", icon: ExternalLink },
];

export default function StudioMorePage() {
  return (
    <section className="studio-more-page">
      <header className="studio-ops-heading">
        <div><p className="eyebrow">Studio</p><h1>More.</h1><p>Tools that matter, without keeping them in the way.</p></div>
      </header>
      <nav className="studio-more-list" aria-label="More Studio tools">
        {tools.map(({ href, icon: Icon, label, note }) => (
          <Link className="studio-more-row" href={href} key={href}>
            <Icon aria-hidden="true" size={21} strokeWidth={1.75} />
            <span><strong>{label}</strong><small>{note}</small></span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>
    </section>
  );
}
