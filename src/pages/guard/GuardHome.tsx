import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { getGuardTodayRounds, getTodayPatrolLogs, type RoundWithDetails } from '@/lib/api'
import { db } from '@/lib/db'
import { syncNow } from '@/lib/offline'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Camera, CheckCircle2, MapPin, QrCode, RefreshCw, WifiOff } from 'lucide-react'
import WatchmanRing from '@/components/guard/WatchmanRing'
import { Skeleton } from '@/components/ui/skeleton'

export default function GuardHome() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [scannedIds, setScannedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  async function load() {
    if (!profile) return
    setLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const [r, logs, queue, count] = await Promise.all([
        getGuardTodayRounds(profile.id, today),
        getTodayPatrolLogs(profile.id, today),
        db.patrolQueue.toArray(),
        db.patrolQueue.count(),
      ])
      const ids = new Set(logs.map((l) => l.checkpoint_id))
      queue.forEach((q) => ids.add(q.checkpoint_id))
      setRounds(r)
      setScannedIds(ids)
      setPending(count)
    } catch {
      toast.error('Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [profile])

  async function handleSync() {
    setSyncing(true)
    const res = await syncNow()
    setSyncing(false)
    if (res.synced > 0 || res.failed === 0) {
      toast.success(`${res.synced} data berhasil disinkronkan`)
      if (res.failed > 0) toast.error(`${res.failed} gagal, akan dicoba lagi`)
    } else {
      toast.error('Gagal sinkron, coba lagi nanti')
    }
    const [p, i] = await Promise.all([db.patrolQueue.count(), db.incidentQueue.count()])
    setPending(p + i)
    load()
  }

  const allPoints = rounds.flatMap((round) =>
    round.round_checkpoints
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((p) => ({
        id: p.checkpoints.id,
        name: p.checkpoints.name,
        scanned: scannedIds.has(p.checkpoints.id),
      })),
  )
  const dailyDone = allPoints.filter((p) => p.scanned).length

  return (
    <div className="space-y-4">
      {pending > 0 && (
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm transition hover:bg-amber-100 disabled:opacity-60"
        >
          <span className="flex items-center gap-2 font-semibold text-amber-800">
            <WifiOff className="size-4" />
            {pending} data belum tersinkron
          </span>
          <RefreshCw className={cn('size-4 text-amber-700', syncing && 'animate-spin')} />
        </button>
      )}

      <div className="rounded-3xl bg-gradient-to-br from-brand-blue to-brand-blue-dark p-5 text-white shadow-md shadow-blue-900/20">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-blue-100">
              {new Date().toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <h1 className="mt-1 text-xl font-bold">Halo, {profile?.full_name}</h1>
            <p className="mt-1 text-sm text-blue-100">Siap menjalankan patroli hari ini?</p>
          </div>
          {!loading && (
            <div className="rounded-full bg-white/10 p-1.5">
              <WatchmanRing
                done={dailyDone}
                total={allPoints.length}
                status={allPoints.length && dailyDone >= allPoints.length ? 'done' : 'active'}
                points={allPoints}
                onPointClick={() => navigate('/patrol/scan')}
                size={104}
                label="hari ini"
              />
            </div>
          )}
        </div>
        <Link
          to="/patrol/scan"
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[14px] font-semibold text-brand-blue shadow-sm transition active:scale-[0.98]"
        >
          <QrCode className="size-5" />
          Mulai Scan QR
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">Ronde Hari Ini</h2>
        <span className="rounded-full bg-brand-blue-light px-3 py-1 text-xs font-semibold text-brand-blue">
          {rounds.length} ronde
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : rounds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <MapPin className="mx-auto size-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-500">
            Tidak ada ronde yang di-assign hari ini
          </p>
        </div>
      ) : (
        rounds.map((round) => {
          const points = round.round_checkpoints.slice().sort((a, b) => a.order_index - b.order_index)
          const done = points.filter((p) => scannedIds.has(p.checkpoints.id)).length
          const now = new Date()
          const [sh, sm] = round.start_time.split(':').map(Number)
          const [eh, em] = round.end_time.split(':').map(Number)
          const start = new Date(now).setHours(sh, sm, 0, 0)
          const end = new Date(now).setHours(eh, em, 0, 0)
          const isActive = now.getTime() >= start && now.getTime() <= end
          const isDone = done >= points.length && points.length > 0
          const status = isDone ? 'done' : isActive ? 'active' : 'waiting'

          return (
            <div
              key={round.id}
              className={cn(
                'rounded-2xl border bg-white p-4 shadow-sm',
                isActive ? 'border-brand-blue/40 ring-1 ring-brand-blue/20' : 'border-slate-200',
              )}
            >
              <div className="flex items-center gap-4">
                <WatchmanRing
                  done={done}
                  total={points.length}
                  status={status}
                  points={points.map((p) => ({
                    id: p.checkpoints.id,
                    name: p.checkpoints.name,
                    scanned: scannedIds.has(p.checkpoints.id),
                  }))}
                  onPointClick={() => navigate('/patrol/scan')}
                  size={128}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{round.name}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {round.start_time.slice(0, 5)} &ndash; {round.end_time.slice(0, 5)} WIB
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
                        isDone
                          ? 'bg-emerald-100 text-emerald-700'
                          : isActive
                            ? 'bg-brand-blue-light text-brand-blue'
                            : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      {isDone ? 'Selesai' : isActive ? 'Berjalan' : 'Menunggu'}
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {points.map((p) => {
                      const scanned = scannedIds.has(p.checkpoints.id)
                      return (
                        <span
                          key={p.id}
                          className={cn(
                            'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium',
                            scanned
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {scanned ? (
                            <CheckCircle2 className="size-3" />
                          ) : (
                            <MapPin className="size-3" />
                          )}
                          {p.checkpoints.name}
                        </span>
                      )
                    })}
                  </div>

                  {isActive && done < points.length && (
                    <Link
                      to="/patrol/scan"
                      className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-brand-blue-light text-sm font-semibold text-brand-blue transition active:scale-[0.98]"
                    >
                      <Camera className="size-4" />
                      Scan Titik Berikutnya ({points.length - done} sisa)
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}