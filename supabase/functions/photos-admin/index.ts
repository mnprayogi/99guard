import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import JSZip from "npm:jszip@3.10.1"

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const BUCKET = "photos"

function parseStoragePath(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx < 0) return null
  return url.slice(idx + marker.length)
}

async function requireSuperadmin(req: Request): Promise<string | null> {
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
  return data?.role === "superadmin" ? user.id : null
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

async function doArchive(items: ArchiveItem[], adminId: string): Promise<Response> {
  let archived = 0
  let failed = 0
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
    } catch {
      failed++
    }
  }
  return Response.json({ archived, failed })
}

Deno.serve(async (req: Request) => {
  const adminId = await requireSuperadmin(req)
  if (!adminId) {
    return Response.json({ error: "Hanya superadmin" }, { status: 403 })
  }
  const url = new URL(req.url)
  const action = url.searchParams.get("action")

  try {
    if (req.method === "GET" && action === "stats") {
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
      return Response.json({
        totalFiles: objects.length,
        totalBytes,
        byFolder: {
          checkins: objects.filter((o) => o.name.startsWith("checkins/")).length,
          incidents: objects.filter((o) => o.name.startsWith("incidents/")).length,
        },
        orphanPaths,
        items,
      })
    }

    if (req.method === "GET" && action === "backup") {
      const objects = await listObjects()
      if (!objects.length) {
        return Response.json({ error: "Tidak ada file untuk dibackup" }, { status: 400 })
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
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" })
      const date = new Date().toISOString().slice(0, 10)
      return new Response(blob, {
        status: failed ? 206 : 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="99guard-foto-backup-${date}.zip"`,
        },
      })
    }

    if (req.method === "POST" && action === "archive") {
      const body = await req.json()
      return await doArchive(body.items ?? [], adminId)
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
      return await doArchive(items, adminId)
    }

    return Response.json({ error: "Aksi tidak dikenal" }, { status: 400 })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
})