export function StatusPill({ status }: { status: string }) {
  const slug = status.toLowerCase().replaceAll(" ", "-");
  return <span className={`status-pill status-${slug}`}>{status}</span>;
}
