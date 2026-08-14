import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Archive, Download, FileImage, FolderOpen, HardDrive, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'

interface Stats {
  totalFiles: number
  totalBytes: number
  byFolder: { checkins: number; incidents: number }
  orphanPaths: string[]
  items: {
    source_table: string
    source_row_id: string
    original_url: string
    storage_path: string
    file_size_bytes: number
  }[]
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

export default function StoragePage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmCleanup, setConfirmCleanup] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke<Stats>('photos-admin?action=stats', {
        method: 'GET',
      })
      if (error) throw error
      setStats(data ?? null)
    } catch (e) {
      console.error('[StoragePage] gagal memuat statistik:', e)
      const status = (e as { context?: { status?: number } })?.context?.status
      toast.error(
        status === 403 ? 'Hanya admin/superadmin yang dapat mengakses' : 'Gagal memuat statistik penyimpanan',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function backup() {
    setBusy('backup')
    try {
      const { data, error } = await supabase.functions.invoke<{
        url: string
        fileName: string
        failed: number
      }>('photos-admin?action=backup', { method: 'GET' })
      if (error) throw error
      if (!data?.url) throw new Error('URL backup kosong')
      const a = document.createElement('a')
      a.href = data.url
      a.download = data.fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast.success('Backup berhasil diunduh')
      if (data.failed > 0) toast.warning(`${data.failed} file gagal dibackup`)
    } catch (e) {
      console.error('[StoragePage] backup gagal:', e)
      const msg = (e as { context?: { status?: number } })?.context?.status === 400
        ? 'Tidak ada file untuk dibackup'
        : 'Gagal membuat backup'
      toast.error(msg)
    } finally {
      setBusy(null)
    }
  }

  async function archive() {
    if (!stats?.items.length) return
    setBusy('archive')
    try {
      const { data, error } = await supabase.functions.invoke<{ archived: number; failed: number; errors?: string[] }>(
        'photos-admin?action=archive',
        { body: { items: stats.items } },
      )
      if (error) throw error
      toast.success(`${data?.archived ?? 0} foto diarsipkan & dihapus dari storage`)
      if (data?.failed) {
        const first = data.errors?.[0]?.split(': ').slice(1).join(': ') ?? 'terjadi kesalahan'
        toast.error(`${data.failed} foto gagal diarsipkan: ${first}`)
      }
      setConfirmArchive(false)
      load()
    } catch (e) {
      console.error('[StoragePage] arsip gagal:', e)
      toast.error('Gagal mengarsipkan foto')
    } finally {
      setBusy(null)
    }
  }

  async function cleanup() {
    if (!stats?.orphanPaths.length) return
    setBusy('cleanup')
    try {
      const { data, error } = await supabase.functions.invoke<{ archived: number; failed: number; errors?: string[] }>(
        'photos-admin?action=cleanup-orphans',
      )
      if (error) throw error
      toast.success(`${data?.archived ?? 0} file yatim dihapus`)
      if (data?.failed) {
        const first = data.errors?.[0]?.split(': ').slice(1).join(': ') ?? 'terjadi kesalahan'
        toast.error(`${data.failed} file gagal dihapus: ${first}`)
      }
      setConfirmCleanup(false)
      load()
    } catch (e) {
      console.error('[StoragePage] cleanup gagal:', e)
      toast.error('Gagal membersihkan file yatim')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Penyimpanan Foto</h1>
          <p className="text-sm text-slate-500">
            Backup, arsip, dan hemat kuota storage Supabase
          </p>
        </div>
      </div>

      {loading || !stats ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <HardDrive className="size-4" /> Total Storage
              </div>
              <p className="mt-1.5 text-2xl font-extrabold text-slate-900">
                {formatBytes(stats.totalBytes)}
              </p>
              <p className="text-xs text-slate-500">{stats.totalFiles} file foto</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <FolderOpen className="size-4" /> Per Folder
              </div>
              <p className="mt-1.5 text-sm font-bold text-slate-900">
                Check-in: {stats.byFolder.checkins} file
              </p>
              <p className="text-xs text-slate-500">Insiden: {stats.byFolder.incidents} file</p>
            </div>
          </div>

          {stats.orphanPaths.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <Trash2 className="size-4 text-amber-600" />
                <p className="text-sm font-bold text-amber-800">
                  {stats.orphanPaths.length} file yatim (tanpa referensi)
                </p>
              </div>
              <p className="mt-1 text-xs text-amber-700">
                Sisa dari insiden/log yang dihapus. Bersihkan untuk menghemat storage.
              </p>
            </div>
          )}

          <div className="space-y-2.5">
            <Button
              onClick={backup}
              disabled={!!busy || stats.totalFiles === 0}
              className="h-12 w-full rounded-2xl bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white"
            >
              {busy === 'backup' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Backup Semua Foto (ZIP)
            </Button>

            <Button
              onClick={() => setConfirmArchive(true)}
              disabled={!!busy || stats.items.length === 0}
              variant="outline"
              className="h-12 w-full rounded-2xl border-brand-blue text-brand-blue hover:bg-brand-blue-light"
            >
              {busy === 'archive' ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
              Arsip & Hapus {stats.items.length} Foto dari Storage
            </Button>

            <Button
              onClick={() => setConfirmCleanup(true)}
              disabled={!!busy || stats.orphanPaths.length === 0}
              variant="outline"
              className="h-12 w-full rounded-2xl border-red-200 text-red-600 hover:bg-red-50"
            >
              {busy === 'cleanup' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Bersihkan File Yatim ({stats.orphanPaths.length})
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
            <p className="flex items-center gap-1.5 font-bold text-slate-700">
              <FileImage className="size-4 text-brand-blue" /> Catatan
            </p>
            <p className="mt-1.5">
              Setelah arsip, file dihapus dari storage dan <code className="rounded bg-slate-100 px-1">photo_url</code>{' '}
              menjadi kosong — foto tetap tercatat di tabel arsip (metadata + jalur penyimpanan) dan tampil sebagai
              "Foto diarsipkan" di aplikasi. Backup ZIP menyimpan salinan file asli dan diunduh lewat tautan singkat
              (file sementara di folder <code className="rounded bg-slate-100 px-1">backups/</code>, diganti tiap backup baru).
            </p>
          </div>

          {stats.items.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-auto rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Daftar Foto ({stats.items.length})
              </p>
              {stats.items.map((it) => (
                <div
                  key={it.storage_path}
                  className="flex items-center justify-between gap-2 text-xs text-slate-600"
                >
                  <span className="truncate font-mono">{it.storage_path}</span>
                  <span className="shrink-0 text-slate-400">
                    {formatBytes(it.file_size_bytes)} · {it.source_table}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arsip & hapus {stats?.items.length} foto?</AlertDialogTitle>
            <AlertDialogDescription>
              Foto akan dihapus dari storage dan diarsipkan (metadata disimpan). Pastikan Anda sudah
              menjalankan Backup (ZIP) terlebih dahulu. Riwayat patroli tetap tampil dengan label "Foto diarsipkan".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={archive}
              disabled={!!busy}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {busy === 'archive' ? 'Mengarsipkan...' : 'Arsip & Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCleanup} onOpenChange={setConfirmCleanup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {stats?.orphanPaths.length} file yatim?</AlertDialogTitle>
            <AlertDialogDescription>
              File tanpa referensi di database (sisa insiden/log yang sudah dihapus) akan diarsipkan
              metadata-nya lalu dihapus dari storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={cleanup}
              disabled={!!busy}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {busy === 'cleanup' ? 'Menghapus...' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
