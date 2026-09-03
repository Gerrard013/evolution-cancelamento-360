export async function GET() {
  return Response.json({ ok: true, service: "evolution-cancelamento-360" }, {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
