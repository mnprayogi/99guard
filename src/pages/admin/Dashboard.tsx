import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getLivePatrolLogs, getTodayCompliance, type AssignmentCompliance } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Clock, MapPin, ShieldCheck, ZoomIn } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface LiveLog {
  id: string
  scanned_at: string
  photo_url: string | null
  profiles: { full_name: string } | null
  checkpoints: { name: string } | null
  rounds: { name: string; start_time: string; end_time: string; tolerance_minutes: number } | null
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState<LiveLog[]>([])
  const [openIncidents, setOpenIncidents] = useState(0)
  const [compliance, setCompliance] = useState<AssignmentCompliance[]>([])
  const [loading, setLoading] = useState(true)
  const [viewPhoto, setViewPhoto] = useState<LiveLog | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [l, i] = await Promise.all([
          getLivePatrolLogs(),
          supabase.from('incidents').select('id').eq('status', 'open'),
        ])
        if (!active) return
        setLogs(l as LiveLog[])
        setOpenIncidents(i.data?.length ?? 0)
        try {
          setCompliance(await getTodayCompliance())
        } catch (err) {
          console.error('[Dashboard] getTodayCompliance gagal:', err)
        }
      } catch (err) {
        console.error('[Dashboard] gagal memuat data:', err)
        toast.error('Gagal memuat data')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()

    const ch1 = supabase
      .channel('live-patrol')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'patrol_logs' },
        async (payload) => {
          const row = payload.new as LiveLog
          setLogs((prev) => [row, ...prev].slice(0, 50))
          setLoading(false)
          try {
            setCompliance(await getTodayCompliance())
          } catch {
            // abaikan — refresh berikutnya menangani
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'incidents' },
        (payload) => {
          const row = payload.new as { status: string }
          if (row.status === 'open') setOpenIncidents((n) => n + 1)
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(ch1)
    }
  }, [])

  const todayLabel = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const nowMs = Date.now()
  const missedRounds = compliance.filter((c) => {
    const [eh, em] = (c.endTime || '00:00').split(':').map(Number)
    const end = new Date().setHours(eh, em, 0, 0)
    return nowMs > end && c.missedIds.length > 0
  })

  function slaLabel(log: LiveLog): { label: string; cls: string } {
    if (!log.rounds) return { label: 'Tanpa ronde', cls: 'bg-slate-100 text-slate-500' }
    const [sh, sm] = log.rounds.start_time.split(':').map(Number)
    const [eh, em] = log.rounds.end_time.split(':').map(Number)
    const t = new Date(log.scanned_at).getTime()
    const start = new Date().setHours(sh, sm, 0, 0) - log.rounds.tolerance_minutes * 60000
    const end = new Date().setHours(eh, em, 0, 0)
    if (t < start) return { label: 'Lebih awal', cls: 'bg-amber-100 text-amber-700' }
    if (t > end) return { label: 'Terlambat', cls: 'bg-red-100 text-red-700' }
    return { label: 'Tepat waktu', cls: 'bg-emerald-100 text-emerald-700' }
  }

  const stats = [
    {
      label: 'Scan Hari Ini',
      value: String(logs.length),
      icon: MapPin,
      bg: 'bg-brand-blue-light',
      text: 'text-brand-blue',
    },
    {
      label: 'Insiden Open',
      value: String(openIncidents),
      icon: AlertTriangle,
      bg: 'bg-red-50',
      text: 'text-red-600',
    },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">{todayLabel}</p>
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-brand-blue to-brand-blue-dark p-5 text-white shadow-md shadow-blue-900/20">
        <div className="flex items-center gap-2 text-sm text-blue-100">
          <ShieldCheck className="size-4" />
          Monitoring patroli berlangsung secara real-time
        </div>
        <p className="mt-1 text-xs text-blue-200">
          {profile?.site_id ? 'Cakupan: site Anda' : 'Cakupan: semua site'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={cn('mb-2 flex size-9 items-center justify-center rounded-full', s.bg, s.text)}>
              <s.icon className="size-4.5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            <p className="text-xs font-medium text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {missedRounds.length > 0 && (
        <div className="space-y-2.5">
          {missedRounds.map((m) => (
            <div key={m.assignmentId} className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle className="size-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-red-800">
                    Ronde {m.roundName} selesai — {m.missedIds.length} titik terlewat
                  </p>
                  <p className="mt-0.5 text-xs text-red-600">
                    {m.guardName} &middot; {m.doneCount}/{m.points.length} discan
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.missedIds.map((id) => {
                      const pt = m.points.find((p) => p.id === id)
                      return (
                        <span
                          key={id}
                          className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700"
                        >
                          {pt?.name ?? 'Titik'}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">Aktivitas Patroli Terkini</h2>
        <Link to="/admin/insiden" className="text-xs font-semibold text-brand-blue hover:underline">
          Lihat insiden →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Clock className="mx-auto size-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-500">
            Belum ada aktivitas patroli hari ini
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              {log.photo_url ? (
                <button
                  onClick={() => setViewPhoto(log)}
                  className="group relative shrink-0 overflow-hidden rounded-xl"
                  title="Lihat foto"
                >
                  <img
                    src={log.photo_url}
                    alt="Foto scan"
                    className="size-12 bg-slate-100 object-cover transition group-hover:scale-105"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                    <ZoomIn className="size-4 text-white" />
                  </span>
                </button>
              ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <MapPin className="size-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {log.profiles?.full_name ?? 'Satpam'}
                </p>
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="size-3" />
                  {log.checkpoints?.name ?? 'Titik patroli'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-700">
                  {new Date(log.scanned_at).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <span
                  className={cn(
                    'mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                    slaLabel(log).cls,
                  )}
                >
                  {log.rounds ? <CheckCircle2 className="size-3" /> : <Clock className="size-3" />}{' '}
                  {slaLabel(log).label}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!viewPhoto} onOpenChange={(o) => !o && setViewPhoto(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle className="sr-only">Foto scan</DialogTitle>
          {viewPhoto?.photo_url && (
            <img
              src={viewPhoto.photo_url}
              alt="Foto scan"
              className="max-h-[70vh] w-full rounded-xl bg-slate-100 object-contain"
            />
          )}
          <div className="text-center">
            <p className="text-sm font-bold text-slate-900">
              {viewPhoto?.profiles?.full_name ?? 'Satpam'}
            </p>
            <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-slate-500">
              <MapPin className="size-3" />
              {viewPhoto?.checkpoints?.name ?? 'Titik patroli'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {viewPhoto &&
                new Date(viewPhoto.scanned_at).toLocaleString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}