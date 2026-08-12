import wordmarkSvg from "../../design/identity-2026/justurban-wordmark.svg?raw";

export function GET() {
  return new Response(wordmarkSvg, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
