import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method tidak diizinkan" }, { status: 405 })
  }

  const auth = req.headers.get("Authorization") ?? ""
  if (!auth.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { page?: string; step?: string; message?: string; meta?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 })
  }

  const page = (body.page ?? "unknown").slice(0, 40)
  const step = (body.step ?? "unknown").slice(0, 60)
  const message = (body.message ?? "").slice(0, 500)

  const res = await fetch(`${supabaseUrl}/rest/v1/client_logs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: null,
      page,
      step,
      message,
      meta: body.meta ?? null,
    }),
  })

  if (!res.ok) {
    return Response.json({ error: `Gagal menyimpan: ${res.status}` }, { status: 502 })
  }
  return Response.json({ ok: true })
})