import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getLivePatrolLogs } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Clock, MapPin, ShieldCheck } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface LiveLog {
  id: string
  scanned_at: string
  photo_url: string | null
  profiles: { full_name: string } | null
  checkpoints: { name: string } | null
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState<LiveLog[]>([])
  const [openIncidents, setOpenIncidents] = useState(0)
  const [loading, setLoading] = useState(true)

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
      } catch {
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
              <img
                src={log.photo_url ?? undefined}
                alt=""
                className="size-12 shrink-0 rounded-xl bg-slate-100 object-cover"
              />
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
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  <CheckCircle2 className="size-3" /> Tepat waktu
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}