import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getPatrolLogs } from '@/lib/api'
import { toast } from 'sonner'
import { MapPin } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { PatrolLog } from '@/lib/types'

export default function GuardHistory() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState<(PatrolLog & { checkpoints: { name: string } })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    getPatrolLogs(profile.id)
      .then(setLogs)
      .catch(() => toast.error('Gagal memuat riwayat'))
      .finally(() => setLoading(false))
  }, [profile])

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">Riwayat Patroli</h1>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <MapPin className="mx-auto size-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-500">Belum ada catatan patroli</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
            >
              {log.photo_url ? (
                <img
                  src={log.photo_url}
                  alt="Foto titik"
                  className="size-14 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <MapPin className="size-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {log.checkpoints?.name ?? 'Titik patroli'}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(log.scanned_at).toLocaleString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                {log.lat && log.lng && (
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {log.lat.toFixed(5)}, {log.lng.toFixed(5)}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                ✓
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}