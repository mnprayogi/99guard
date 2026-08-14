import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Clock, FileBarChart, XCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

interface LogRow {
  id: string
  scanned_at: string
  checkpoint_id: string
  round_id: string | null
  guard_id: string
  profiles: { full_name: string } | null
  checkpoints: { name: string } | null
  rounds: { name: string; start_time: string; end_time: string; tolerance_minutes: number } | null
}

interface IncidentRow {
  id: string
  category: string
  status: 'open' | 'in_progress' | 'resolved'
  reported_at: string
  updated_at: string
}

interface AssignRow {
  id: string
  date: string
  profiles: { full_name: string } | null
  rounds: {
    id: string
    name: string
    start_time: string
    end_time: string
    tolerance_minutes: number
    round_checkpoints: { checkpoints: { id: string; name: string } }[]
  } | null
}

type Tab = 'satpam' | 'ronde' | 'titik'

const categoryLabel: Record<string, string> = {
  kebakaran: 'Kebakaran',
  pencurian: 'Pencurian',
  vandalisme: 'Vandalisme',
  kesehatan: 'Kesehatan',
  lainnya: 'Lainnya',
}

const today = () => new Date().toISOString().slice(0, 10)

export default function ReportsPage() {
  const { profile } = useAuth()
  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState(today())
  const [tab, setTab] = useState<Tab>('satpam')
  const [logs, setLogs] = useState<LogRow[]>([])
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [assignments, setAssignments] = useState<AssignRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [l, i, a] = await Promise.all([
          supabase
            .from('patrol_logs')
            .select(
              '*, profiles(full_name), checkpoints(name), rounds(name, start_time, end_time, tolerance_minutes)',
            )
            .gte('scanned_at', `${fromDate}T00:00:00.000Z`)
            .lte('scanned_at', `${toDate}T23:59:59.999Z`)
            .order('scanned_at'),
          supabase
            .from('incidents')
            .select('id, category, status, reported_at, updated_at')
            .gte('reported_at', `${fromDate}T00:00:00.000Z`)
            .lte('reported_at', `${toDate}T23:59:59.999Z`)
            .order('reported_at', { ascending: false })
            .limit(500),
          supabase
            .from('round_assignments')
            .select(
              'id, date, profiles(full_name), rounds(id, name, start_time, end_time, tolerance_minutes, round_checkpoints(checkpoints(id, name)))',
            )
            .gte('date', fromDate)
            .lte('date', toDate),
        ])
        if (l.error) throw l.error
        if (i.error) throw i.error
        if (a.error) throw a.error
        setLogs(l.data as LogRow[])
        setIncidents(i.data as IncidentRow[])
        setAssignments(a.data as AssignRow[])
      } catch (e) {
        console.error('[ReportsPage] gagal memuat laporan:', e)
        toast.error('Gagal memuat laporan')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [profile, fromDate, toDate])

  const stats = useMemo(() => {
    const total = logs.length
    const open = incidents.filter((x) => x.status === 'open').length
    const inProgress = incidents.filter((x) => x.status === 'in_progress').length
    const resolved = incidents.filter((x) => x.status === 'resolved').length
    const resolvedMs = incidents
      .filter((x) => x.status === 'resolved')
      .map((x) => new Date(x.updated_at).getTime() - new Date(x.reported_at).getTime())
    const avgResponseMs =
      resolvedMs.length > 0 ? resolvedMs.reduce((a, b) => a + b, 0) / resolvedMs.length : null
    const catCount = new Map<string, number>()
    for (const inc of incidents) catCount.set(inc.category, (catCount.get(inc.category) ?? 0) + 1)
    return { total, open, inProgress, resolved, avgResponseMs, catCount }
  }, [logs, incidents])

  const perGuard = useMemo(() => {
    const map = new Map<string, { name: string; total: number; onTime: number }>()
    for (const log of logs) {
      const key = log.profiles?.full_name ?? 'Satpam'
      const cur = map.get(key) ?? { name: key, total: 0, onTime: 0 }
      cur.total++
      if (log.rounds) {
        const [sh, sm] = log.rounds.start_time.split(':').map(Number)
        const [eh, em] = log.rounds.end_time.split(':').map(Number)
        const t = new Date(log.scanned_at).getTime()
        const s = new Date(t).setHours(sh, sm, 0, 0) - log.rounds.tolerance_minutes * 60000
        const e = new Date(t).setHours(eh, em, 0, 0)
        if (t >= s && t <= e) cur.onTime++
      }
      map.set(key, cur)
    }
    return [...map.values()]
  }, [logs])

  const perRound = useMemo(() => {
    const now = Date.now()
    return assignments.map((a) => {
      const r = a.rounds
      const points = r?.round_checkpoints.map((rc) => rc.checkpoints) ?? []
      const [sh, sm] = (r?.start_time ?? '00:00').split(':').map(Number)
      const [eh, em] = (r?.end_time ?? '00:00').split(':').map(Number)
      const start = new Date(`${a.date}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`).getTime()
      const end = new Date(`${a.date}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`).getTime()
      const pointIds = new Set(points.map((p) => p.id))
      const roundLogs = logs.filter(
        (l) =>
          l.round_id === r?.id ||
          (pointIds.has(l.checkpoint_id) &&
            new Date(l.scanned_at).getTime() >= start &&
            new Date(l.scanned_at).getTime() <= end),
      )
      const scannedIds = new Set(roundLogs.map((l) => l.checkpoint_id))
      const done = points.filter((p) => scannedIds.has(p.id))
      const missed = points.filter((p) => !scannedIds.has(p.id))
      const ended = now > end
      return {
        id: a.id,
        date: a.date,
        guardName: a.profiles?.full_name ?? 'Satpam',
        roundName: r?.name ?? 'Ronde',
        points,
        doneCount: done.length,
        missed: ended ? missed : [],
        ended,
      }
    })
  }, [assignments, logs])

  const perCheckpoint = useMemo(() => {
    const map = new Map<
      string,
      { name: string; count: number; lastAt: string | null; lastGuard: string | null }
    >()
    for (const log of logs) {
      const key = log.checkpoints?.name ?? 'Titik patroli'
      const cur = map.get(key) ?? { name: key, count: 0, lastAt: null, lastGuard: null }
      cur.count++
      if (!cur.lastAt || log.scanned_at > cur.lastAt) {
        cur.lastAt = log.scanned_at
        cur.lastGuard = log.profiles?.full_name ?? 'Satpam'
      }
      map.set(key, cur)
    }
    return [...map.values()]
  }, [logs])

  const compliance = perGuard.length
    ? Math.round((perGuard.reduce((n, r) => n + r.onTime, 0) / Math.max(1, perGuard.reduce((n, r) => n + r.total, 0))) * 100)
    : 0

  const cards = [
    { label: 'Scan Periode', value: stats.total, icon: FileBarChart, cls: 'text-brand-blue bg-brand-blue-light' },
    { label: 'Kepatuhan SLA', value: `${compliance}%`, icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50' },
    { label: 'Insiden Open', value: stats.open, icon: AlertTriangle, cls: 'text-red-600 bg-red-50' },
    { label: 'Insiden Selesai', value: stats.resolved, icon: XCircle, cls: 'text-slate-600 bg-slate-100' },
  ]

  const incidentBar = [
    { label: 'Open', value: stats.open, cls: 'bg-red-500' },
    { label: 'Ditindak', value: stats.inProgress, cls: 'bg-amber-500' },
    { label: 'Selesai', value: stats.resolved, cls: 'bg-emerald-500' },
  ]
  const maxBar = Math.max(1, ...incidentBar.map((b) => b.value))

  const catEntries = Object.entries(categoryLabel).map(([key, label]) => ({
    label,
    value: stats.catCount.get(key) ?? 0,
  }))
  const maxCat = Math.max(1, ...catEntries.map((c) => c.value))

  const fmtResponse = (ms: number | null) => {
    if (ms === null) return '—'
    const mins = Math.round(ms / 60000)
    if (mins < 60) return `${mins} mnt`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${h} jam ${m} mnt`
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'satpam', label: 'Per Satpam' },
    { key: 'ronde', label: 'Per Ronde' },
    { key: 'titik', label: 'Per Titik' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Laporan & Rekap</h1>
        <p className="text-sm text-slate-500">
          Rekap {new Date(`${fromDate}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}
          {fromDate !== toDate &&
            ` – ${new Date(`${toDate}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => e.target.value && setFromDate(e.target.value)}
          className="h-10 w-40 rounded-full text-sm"
        />
        <span className="text-xs text-slate-400">s/d</span>
        <Input
          type="date"
          value={toDate}
          onChange={(e) => e.target.value && setToDate(e.target.value)}
          className="h-10 w-40 rounded-full text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={cn('mb-2 flex size-9 items-center justify-center rounded-full', c.cls)}>
              <c.icon className="size-4.5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="text-xs font-medium text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 rounded-full px-4 py-2.5 text-xs font-bold transition',
              tab === t.key
                ? 'bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : tab === 'satpam' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Clock className="size-4 text-brand-blue" />
            Kinerja Satpam
          </h2>
          {perGuard.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Belum ada data scan pada periode ini</p>
          ) : (
            <div className="space-y-3">
              {perGuard.map((r) => (
                <div key={r.name} className="flex items-center gap-3">
                  <span className="w-32 truncate text-xs font-semibold text-slate-700">{r.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark"
                      style={{ width: `${(r.onTime / Math.max(1, r.total)) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-600">
                    {r.onTime}/{r.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'ronde' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Clock className="size-4 text-brand-blue" />
            Kepatuhan Per Ronde
          </h2>
          {perRound.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Belum ada penugasan pada periode ini</p>
          ) : (
            <div className="space-y-3">
              {perRound.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-800">
                      {r.roundName} <span className="font-medium text-slate-400">· {r.guardName}</span>
                    </p>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                        r.ended
                          ? r.missed.length === 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                          : 'bg-blue-50 text-brand-blue',
                      )}
                    >
                      {r.ended
                        ? r.missed.length === 0
                          ? 'Compliant'
                          : `${r.missed.length} terlewat`
                        : 'Belum berakhir'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {r.doneCount}/{r.points.length} titik discan
                  </p>
                  {r.missed.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.missed.map((p) => (
                        <span
                          key={p.id}
                          className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600"
                        >
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Clock className="size-4 text-brand-blue" />
            Aktivitas Per Titik
          </h2>
          {perCheckpoint.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Belum ada scan pada periode ini</p>
          ) : (
            <div className="space-y-3">
              {perCheckpoint.map((c) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="w-40 truncate text-xs font-semibold text-slate-700">{c.name}</span>
                  <span className="rounded-full bg-brand-blue-light px-2.5 py-0.5 text-[11px] font-bold text-brand-blue">
                    {c.count}x
                  </span>
                  <span className="ml-auto text-right text-[11px] text-slate-500">
                    {c.lastAt
                      ? `${new Date(c.lastAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${c.lastGuard}`
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold text-slate-900">Status Insiden</h2>
        <div className="flex h-32 items-end gap-6">
          {incidentBar.map((b) => (
            <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-sm font-bold text-slate-700">{b.value}</span>
              <div
                className={cn('w-full max-w-16 rounded-t-xl transition-all', b.cls)}
                style={{ height: `${(b.value / maxBar) * 96 + 8}px` }}
              />
              <span className="text-[11px] font-medium text-slate-500">{b.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs font-medium text-slate-500">
          Rata-rata waktu penyelesaian (open → resolved):{' '}
          <span className="font-bold text-slate-700">{fmtResponse(stats.avgResponseMs)}</span>
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold text-slate-900">Insiden per Kategori</h2>
        {catEntries.every((c) => c.value === 0) ? (
          <p className="py-6 text-center text-sm text-slate-400">Belum ada insiden pada periode ini</p>
        ) : (
          <div className="space-y-3">
            {catEntries.map((c) => (
              <div key={c.label} className="flex items-center gap-3">
                <span className="w-28 truncate text-xs font-semibold text-slate-700">{c.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark"
                    style={{ width: `${(c.value / maxCat) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold text-slate-600">{c.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}