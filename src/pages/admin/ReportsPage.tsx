import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Clock, FileBarChart, XCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface LogRow {
  id: string
  scanned_at: string
  checkpoint_id: string
  round_id: string | null
  profiles: { full_name: string } | null
  checkpoints: { name: string } | null
  rounds: { name: string; start_time: string; end_time: string } | null
}

interface IncidentRow {
  id: string
  category: string
  status: 'open' | 'in_progress' | 'resolved'
}

export default function ReportsPage() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState<LogRow[]>([])
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const start = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`
        const [l, i] = await Promise.all([
          supabase
            .from('patrol_logs')
            .select('*, profiles(full_name), checkpoints(name), rounds(name, start_time, end_time)')
            .gte('scanned_at', start)
            .order('scanned_at'),
          supabase
            .from('incidents')
            .select('id, category, status')
            .order('reported_at', { ascending: false })
            .limit(500),
        ])
        if (l.error) throw l.error
        if (i.error) throw i.error
        setLogs(l.data as LogRow[])
        setIncidents(i.data as IncidentRow[])
      } catch {
        toast.error('Gagal memuat laporan')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [profile])

  const stats = useMemo(() => {
    const perGuard = new Map<string, { name: string; total: number; onTime: number }>()
    for (const log of logs) {
      const key = log.profiles?.full_name ?? 'Satpam'
      const cur = perGuard.get(key) ?? { name: key, total: 0, onTime: 0 }
      cur.total++
      if (log.rounds) {
        const [sh, sm] = log.rounds.start_time.split(':').map(Number)
        const [eh, em] = log.rounds.end_time.split(':').map(Number)
        const t = new Date(log.scanned_at)
        const s = new Date(t).setHours(sh, sm, 0, 0)
        const e = new Date(t).setHours(eh, em, 0, 0)
        if (t.getTime() >= s && t.getTime() <= e) cur.onTime++
      }
      perGuard.set(key, cur)
    }
    const rows = [...perGuard.values()]
    const total = rows.reduce((n, r) => n + r.total, 0)
    const onTime = rows.reduce((n, r) => n + r.onTime, 0)
    const compliance = total ? Math.round((onTime / total) * 100) : 0
    const open = incidents.filter((x) => x.status === 'open').length
    const inProgress = incidents.filter((x) => x.status === 'in_progress').length
    const resolved = incidents.filter((x) => x.status === 'resolved').length
    return { rows, total, compliance, open, inProgress, resolved }
  }, [logs, incidents])

  const cards = [
    { label: 'Scan Hari Ini', value: stats.total, icon: FileBarChart, cls: 'text-brand-blue bg-brand-blue-light' },
    { label: 'Kepatuhan SLA', value: `${stats.compliance}%`, icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50' },
    { label: 'Insiden Open', value: stats.open, icon: AlertTriangle, cls: 'text-red-600 bg-red-50' },
    { label: 'Insiden Selesai', value: stats.resolved, icon: XCircle, cls: 'text-slate-600 bg-slate-100' },
  ]

  const incidentBar = [
    { label: 'Open', value: stats.open, cls: 'bg-red-500' },
    { label: 'Ditindak', value: stats.inProgress, cls: 'bg-amber-500' },
    { label: 'Selesai', value: stats.resolved, cls: 'bg-emerald-500' },
  ]
  const maxBar = Math.max(1, ...incidentBar.map((b) => b.value))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Laporan & Rekap</h1>
        <p className="text-sm text-slate-500">
          Rekap {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
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

      {loading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Clock className="size-4 text-brand-blue" />
            Kinerja Satpam Hari Ini
          </h2>
          {stats.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Belum ada data scan hari ini</p>
          ) : (
            <div className="space-y-3">
              {stats.rows.map((r) => (
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
      </div>
    </div>
  )
}