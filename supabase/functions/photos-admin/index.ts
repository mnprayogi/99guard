import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import JSZip from "npm:jszip@3.10.1"

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const BUCKET = "photos"

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  }
}

function parseStoragePath(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx < 0) return null
  return url.slice(idx + marker.length)
}

async function requireAdmin(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? ""
  const token = auth.replace("Bearer ", "")
  if (!token) return null
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  return data && (data.role === "superadmin" || data.role === "admin") ? user.id : null
}

async function listObjects(): Promise<{ name: string; size: number }[]> {
  const all: { name: string; size: number }[] = []
  for (const folder of ["checkins", "incidents"]) {
    let offset = 0
    for (;;) {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(folder, { limit: 1000, offset })
      if (error) throw error
      if (!data.length) break
      for (const f of data) {
        const size = f.metadata?.size
        if (typeof size === "number") {
          all.push({ name: `${folder}/${f.name}`, size })
        }
      }
      offset += data.length
      if (data.length < 1000) break
    }
  }
  return all
}

async function getDbPaths(): Promise<
  { path: string; source_table: "patrol_logs" | "incident_photos"; source_row_id: string }[]
> {
  const [logs, photos] = await Promise.all([
    supabaseAdmin.from("patrol_logs").select("id, photo_url").not("photo_url", "is", null),
    supabaseAdmin.from("incident_photos").select("id, photo_url"),
  ])
  const rows: { path: string; source_table: "patrol_logs" | "incident_photos"; source_row_id: string }[] = []
  for (const r of logs.data ?? []) {
    const path = parseStoragePath(r.photo_url)
    if (path) rows.push({ path, source_table: "patrol_logs", source_row_id: r.id })
  }
  for (const r of photos.data ?? []) {
    const path = parseStoragePath(r.photo_url)
    if (path) rows.push({ path, source_table: "incident_photos", source_row_id: r.id })
  }
  return rows
}

interface ArchiveItem {
  source_table: "patrol_logs" | "incident_photos" | "orphan"
  source_row_id?: string
  original_url: string
  storage_path: string
  file_size_bytes?: number
}

async function doArchive(
  items: ArchiveItem[],
  adminId: string,
  cors: Record<string, string>,
): Promise<Response> {
  let archived = 0
  let failed = 0
  const errors: string[] = []
  for (const it of items) {
    try {
      if (it.source_table === "patrol_logs" && it.source_row_id) {
        const { error } = await supabaseAdmin
          .from("patrol_logs")
          .update({ photo_url: null })
          .eq("id", it.source_row_id)
        if (error) throw error
      }
      if (it.source_table === "incident_photos" && it.source_row_id) {
        const { error } = await supabaseAdmin
          .from("incident_photos")
          .update({ photo_url: null })
          .eq("id", it.source_row_id)
        if (error) throw error
      }
      const { error: insErr } = await supabaseAdmin.from("photo_archives").insert({
        source_table: it.source_table,
        source_row_id: it.source_row_id ?? null,
        original_url: it.original_url,
        storage_path: it.storage_path,
        file_size_bytes: it.file_size_bytes ?? null,
        archived_by: adminId,
      })
      if (insErr) throw insErr
      const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove([it.storage_path])
      if (rmErr) throw rmErr
      archived++
    } catch (e) {
      failed++
      if (errors.length < 5) errors.push(`${it.storage_path}: ${String(e)}`)
    }
  }
  return Response.json({ archived, failed, errors }, { headers: cors })
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get("Origin"))
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors })
  }
  const adminId = await requireAdmin(req)
  if (!adminId) {
    return Response.json({ error: "Hanya admin/superadmin" }, { status: 403, headers: cors })
  }
  const url = new URL(req.url)
  const action = url.searchParams.get("action")

  try {
    if ((req.method === "GET" || req.method === "POST") && action === "stats") {
      const objects = await listObjects()
      const dbRows = await getDbPaths()
      const dbMap = new Map(dbRows.map((r) => [r.path, r]))
      const totalBytes = objects.reduce((s, o) => s + o.size, 0)
      const items: ArchiveItem[] = []
      const orphanPaths: string[] = []
      for (const o of objects) {
        const ref = dbMap.get(o.name)
        if (ref) {
          items.push({
            source_table: ref.source_table,
            source_row_id: ref.source_row_id,
            original_url: supabaseAdmin.storage.from(BUCKET).getPublicUrl(o.name).data.publicUrl,
            storage_path: o.name,
            file_size_bytes: o.size,
          })
        } else {
          orphanPaths.push(o.name)
        }
      }
      return Response.json(
        {
          totalFiles: objects.length,
          totalBytes,
          byFolder: {
            checkins: objects.filter((o) => o.name.startsWith("checkins/")).length,
            incidents: objects.filter((o) => o.name.startsWith("incidents/")).length,
          },
          orphanPaths,
          items,
        },
        { headers: cors },
      )
    }

    if ((req.method === "GET" || req.method === "POST") && action === "backup") {
      const objects = await listObjects()
      if (!objects.length) {
        return Response.json({ error: "Tidak ada file untuk dibackup" }, { status: 400, headers: cors })
      }
      const zip = new JSZip()
      let failed = 0
      for (const o of objects) {
        const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(o.name)
        if (error || !data) {
          failed++
          continue
        }
        const buf = await data.arrayBuffer()
        zip.file(o.name, new Uint8Array(buf))
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" })
      const date = new Date().toISOString().slice(0, 10)
      const zipName = `backups/foto-backup-${date}.zip`
      const { data: old, error: listErr } = await supabaseAdmin.storage.from(BUCKET).list("backups", {
        limit: 200,
      })
      if (!listErr && old?.length) {
        await supabaseAdmin.storage.from(BUCKET).remove(old.map((f) => `backups/${f.name}`))
      }
      const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(zipName, blob, {
        contentType: "application/zip",
        upsert: true,
      })
      if (upErr) throw upErr
      const { data: signed, error: signErr } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(
        zipName,
        300,
      )
      if (signErr || !signed) throw signErr ?? new Error("Gagal membuat URL unduhan")
      return Response.json(
        { url: signed.signedUrl, fileName: `99guard-foto-backup-${date}.zip`, failed },
        { headers: cors },
      )
    }

    if (req.method === "POST" && action === "archive") {
      const body = await req.json()
      return await doArchive(body.items ?? [], adminId, cors)
    }

    if (req.method === "POST" && action === "cleanup-orphans") {
      const objects = await listObjects()
      const dbRows = await getDbPaths()
      const dbSet = new Set(dbRows.map((r) => r.path))
      const orphans = objects.filter((o) => !dbSet.has(o.name))
      const items: ArchiveItem[] = orphans.map((o) => ({
        source_table: "orphan",
        original_url: supabaseAdmin.storage.from(BUCKET).getPublicUrl(o.name).data.publicUrl,
        storage_path: o.name,
        file_size_bytes: o.size,
      }))
      return await doArchive(items, adminId, cors)
    }

    if (req.method === "POST" && action === "delete-photo") {
      const body = await req.json()
      const path: string | undefined = body.storage_path
      const photoId: string | undefined = body.photo_id
      if (!path && !photoId) {
        return Response.json({ error: "storage_path atau photo_id wajib" }, { status: 400, headers: cors })
      }
      if (path) {
        const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove([path])
        if (rmErr) return Response.json({ error: String(rmErr) }, { status: 500, headers: cors })
      }
      if (photoId) {
        const { error: delErr } = await supabaseAdmin.from("incident_photos").delete().eq("id", photoId)
        if (delErr) return Response.json({ error: String(delErr) }, { status: 500, headers: cors })
      }
      return Response.json({ ok: true }, { headers: cors })
    }

    return Response.json({ error: "Aksi tidak dikenal" }, { status: 400, headers: cors })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: cors })
  }
})
