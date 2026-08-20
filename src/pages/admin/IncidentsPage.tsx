import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getIncidents } from '@/lib/api'
import { logClient } from '@/lib/debugLog'
import { cn } from '@/lib/utils'
import { AlertTriangle, Archive, CheckCircle2, Clock, Trash2 } from 'lucide-react'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import type { IncidentStatus } from '@/lib/types'

interface IncidentRow {
  id: string
  category: string
  status: IncidentStatus
  description: string | null
  reported_at: string
  lat: number | null
  lng: number | null
  profiles: { full_name: string } | null
  sites: { name: string } | null
  incident_photos: { id: string; photo_url: string | null }[]
}

interface ActionRow {
  id: string
  action: string
  note: string | null
  created_at: string
  profiles: { full_name: string } | null
}

const statusMap: Record<IncidentStatus, { label: string; cls: string }> = {
  open: { label: 'Terbuka', cls: 'bg-red-50 text-red-600 border-red-200' },
  in_progress: { label: 'Ditindak', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  resolved: { label: 'Selesai', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

const categoryLabel: Record<string, string> = {
  kebakaran: 'Kebakaran',
  pencurian: 'Pencurian',
  vandalisme: 'Vandalisme',
  kesehatan: 'Kesehatan',
  lainnya: 'Lainnya',
}

function storagePathFromUrl(url: string): string | null {
  const marker = '/object/public/photos/'
  const idx = url.indexOf(marker)
  return idx < 0 ? null : url.slice(idx + marker.length)
}

const PAGE_SIZE = 10

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [detail, setDetail] = useState<IncidentRow | null>(null)
  const [actions, setActions] = useState<ActionRow[]>([])
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const [deleting, setDeleting] = useState<IncidentRow | null>(null)
  const [deletingId, setDeletingId] = useState('')
  const [deletingPhoto, setDeletingPhoto] = useState<{ id: string; photo_url: string | null } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = (await getIncidents()) as IncidentRow[]
      setIncidents(data)
      setHasMore(data.length === PAGE_SIZE)
    } catch {
      toast.error('Gagal memuat insiden')
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const data = (await getIncidents(undefined, incidents.length, incidents.length + PAGE_SIZE - 1)) as IncidentRow[]
      setIncidents((prev) => [...prev, ...data])
      setHasMore(data.length === PAGE_SIZE)
    } catch {
      toast.error('Gagal memuat insiden')
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('incidents-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'incidents' },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [])

  async function setStatus(status: IncidentStatus) {
    if (!detail) return
    setWorking(true)
    try {
      const { error } = await supabase
        .from('incidents')
        .update({ status })
        .eq('id', detail.id)
      if (error) throw error

      const { data: user } = await supabase.auth.getUser()
      await supabase.from('incident_actions').insert({
        incident_id: detail.id,
        admin_id: user.user?.id ?? null,
        action: `Status diperbarui ke ${status}`,
        note: note.trim() || null,
      })
      toast.success('Status insiden diperbarui')
      setDetail(null)
      setNote('')
      load()
    } catch {
      toast.error('Gagal memperbarui status')
    } finally {
      setWorking(false)
    }
  }

  async function openDetail(inc: IncidentRow) {
    setDetail(inc)
    setNote('')
    const { data, error } = await supabase
      .from('incident_actions')
      .select('id, action, note, created_at, profiles(full_name)')
      .eq('incident_id', inc.id)
      .order('created_at', { ascending: true })
    if (error) return
    setActions((data ?? []) as ActionRow[])
  }

  async function removeIncident() {
    if (!deleting) return
    setDeletingId(deleting.id)
    try {
      const paths = (deleting.incident_photos ?? [])
        .map((p) => (p.photo_url ? storagePathFromUrl(p.photo_url) : null))
        .filter((x): x is string => !!x)
      for (const p of paths) {
        const { error } = await supabase.functions.invoke('photos-admin?action=delete-photo', {
          body: { storage_path: p },
        })
        if (error) {
          console.warn('[IncidentsPage] hapus file storage gagal (file yatim, akan dibersihkan nanti):', p, error)
          logClient('incidents', 'remove_incident', 'storage remove gagal', { path: p, err: String(error) })
        }
      }
      const { data, error } = await supabase
        .from('incidents')
        .delete()
        .eq('id', deleting.id)
        .select('id')
        .returns<{ id: string }[]>()
      if (error) throw error
      if (!data || data.length === 0) {
        toast.error('Tidak diizinkan menghapus insiden ini')
        return
      }
      toast.success('Insiden dihapus')
      if (detail?.id === deleting.id) setDetail(null)
      setDeleting(null)
      load()
    } catch (e) {
      console.error('[IncidentsPage] gagal menghapus insiden:', e)
      toast.error('Gagal menghapus insiden')
    } finally {
      setDeletingId('')
    }
  }

  async function removePhoto() {
    if (!deletingPhoto) return
    setWorking(true)
    logClient('incidents', 'remove_photo', 'mulai', { photoId: deletingPhoto.id })
    try {
      const path = deletingPhoto.photo_url ? storagePathFromUrl(deletingPhoto.photo_url) : null
      const { error } = await supabase.functions.invoke('photos-admin?action=delete-photo', {
        body: { photo_id: deletingPhoto.id, storage_path: path ?? undefined },
      })
      if (error) throw error
      if (detail) {
        setDetail({
          ...detail,
          incident_photos: detail.incident_photos.filter((p) => p.id !== deletingPhoto.id),
        })
      }
      setDeletingPhoto(null)
      logClient('incidents', 'remove_photo', 'berhasil', { photoId: deletingPhoto.id })
      toast.success('Foto dihapus')
      load()
    } catch (e) {
      console.error('[IncidentsPage] gagal menghapus foto:', e)
      logClient('incidents', 'remove_photo', 'gagal', { photoId: deletingPhoto.id, err: String(e) })
      toast.error('Gagal menghapus foto')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Insiden</h1>
        <p className="text-sm text-slate-500">Pantau dan tindak lanjuti laporan satpam</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : incidents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <AlertTriangle className="mx-auto size-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-500">Belum ada insiden</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <Dialog key={inc.id}>
              <DialogTrigger asChild>
                <button
                  onClick={() => openDetail(inc)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-blue/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase',
                          statusMap[inc.status].cls,
                        )}
                      >
                        {statusMap[inc.status].label}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">
                        {categoryLabel[inc.category] ?? inc.category}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(inc.reported_at).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-700">
                    {inc.description ?? 'Tidak ada deskripsi'}
                  </p>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {inc.profiles?.full_name ?? 'Satpam'} · {inc.sites?.name ?? '-'}
                  </p>
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase',
                        statusMap[inc.status].cls,
                      )}
                    >
                      {statusMap[inc.status].label}
                    </span>
                    {categoryLabel[inc.category] ?? inc.category}
                  </DialogTitle>
                </DialogHeader>
                <button
                  onClick={() => setDeleting(inc)}
                  className="absolute top-2 right-2 rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Hapus insiden"
                >
                  <Trash2 className="size-4" />
                </button>

                <p className="text-sm text-slate-700">{inc.description ?? 'Tidak ada deskripsi'}</p>
                <p className="text-xs text-slate-400">
                  Dilaporkan {new Date(inc.reported_at).toLocaleString('id-ID')} oleh{' '}
                  {inc.profiles?.full_name ?? 'Satpam'}
                </p>

                {inc.incident_photos.length > 0 && inc.incident_photos[0].photo_url && (
                  <div className="relative">
                    <img
                      src={inc.incident_photos[0].photo_url}
                      alt="Foto insiden"
                      className="aspect-video w-full rounded-2xl object-cover"
                    />
                    <button
                      onClick={() => setDeletingPhoto(inc.incident_photos[0])}
                      className="absolute top-2 right-2 rounded-full bg-black/50 p-2 text-white transition hover:bg-red-600"
                      title="Hapus foto"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
                {inc.incident_photos.length > 0 && !inc.incident_photos[0].photo_url && (
                  <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl bg-slate-100">
                    <Archive className="size-8 text-slate-300" />
                    <p className="text-xs font-semibold text-slate-400">Foto diarsipkan oleh superadmin</p>
                  </div>
                )}

                {actions.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Riwayat Tindakan
                    </p>
                    {actions.map((a) => (
                      <div key={a.id} className="flex gap-2.5">
                        <div className="flex flex-col items-center">
                          <span className="size-2 rounded-full bg-brand-blue" />
                          <span className="mt-1 w-px flex-1 bg-slate-200" />
                        </div>
                        <div className="pb-1">
                          <p className="text-xs font-semibold text-slate-700">{a.action}</p>
                          {a.note && <p className="text-xs text-slate-500">{a.note}</p>}
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {a.profiles?.full_name ?? 'Admin'} ·{' '}
                            {new Date(a.created_at).toLocaleString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {inc.status !== 'resolved' && (
                  <div className="space-y-3">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Catatan tindakan (opsional)..."
                      rows={2}
                    />
                    <div className="flex gap-2">
                      {inc.status === 'open' && (
                        <Button
                          onClick={() => setStatus('in_progress')}
                          disabled={working}
                          className="flex-1 rounded-full bg-amber-500 text-white hover:bg-amber-600"
                        >
                          <Clock className="size-4" /> Proses
                        </Button>
                      )}
                      <Button
                        onClick={() => setStatus('resolved')}
                        disabled={working}
                        className="flex-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="size-4" /> Selesaikan
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          ))}
        </div>
      )}

      {!loading && incidents.length > 0 && hasMore && (
        <Button
          onClick={loadMore}
          disabled={loadingMore}
          variant="outline"
          className="mx-auto flex h-10 w-full rounded-full text-xs font-semibold sm:w-auto sm:px-8"
        >
          {loadingMore ? 'Memuat...' : 'Muat lebih banyak'}
        </Button>
      )}

      <AlertDialog open={!!deletingPhoto} onOpenChange={(o) => !o && setDeletingPhoto(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus foto insiden ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Foto akan dihapus dari penyimpanan dan tidak dapat dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={removePhoto}
              disabled={working}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {working ? 'Menghapus...' : 'Hapus Foto'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus insiden ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Insiden "{deleting?.description?.slice(0, 60) ?? 'tanpa deskripsi'}" beserta foto dan
              riwayat tindakannya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={removeIncident}
              disabled={!!deletingId}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deletingId ? 'Menghapus...' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}