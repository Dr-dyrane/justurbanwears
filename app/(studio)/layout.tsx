import { AppShell } from "../../components/studio/app-shell";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
