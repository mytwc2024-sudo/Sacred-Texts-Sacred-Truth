function reply(body: unknown, status = 410) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(() => reply({
  ok: false,
  retired: true,
  error: "One-time native embedding diagnostic retired after semantic calibration.",
  replacement: "oracle-health",
}));
