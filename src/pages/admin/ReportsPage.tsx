import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Clock, Download, FileBarChart, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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

interface GuardDetail {
  name: string
  rounds: string[]
  visited: number
  missed: number
  total: number
  onTime: number
  firstScan: string | null
  lastScan: string | null
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

const scrollbarCls =
  '[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300'

function isOnTime(log: LogRow): boolean {
  if (!log.rounds) return false
  const [sh, sm] = log.rounds.start_time.split(':').map(Number)
  const [eh, em] = log.rounds.end_time.split(':').map(Number)
  const t = new Date(log.scanned_at).getTime()
  const s = new Date(t).setHours(sh, sm, 0, 0) - log.rounds.tolerance_minutes * 60000
  const e = new Date(t).setHours(eh, em, 0, 0)
  return t >= s && t <= e
}

const fmtDT = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

const fmtDate = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

const slaBadgeCls = (g: GuardDetail) =>
  g.total > 0 && g.onTime / g.total >= 0.8
    ? 'bg-emerald-50 text-emerald-600'
    : g.total > 0
      ? 'bg-amber-50 text-amber-600'
      : 'bg-slate-100 text-slate-400'

export default function ReportsPage() {
  const { profile } = useAuth()
  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState(today())
  const [tab, setTab] = useState<Tab>('satpam')
  const [logs, setLogs] = useState<LogRow[]>([])
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [assignments, setAssignments] = useState<AssignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

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
      if (isOnTime(log)) cur.onTime++
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

  const perGuardDetail = useMemo(() => {
    const map = new Map<string, GuardDetail>()
    for (const log of logs) {
      const key = log.profiles?.full_name ?? 'Satpam'
      const cur = map.get(key) ?? {
        name: key,
        rounds: [],
        visited: 0,
        missed: 0,
        total: 0,
        onTime: 0,
        firstScan: null,
        lastScan: null,
      }
      cur.total++
      if (isOnTime(log)) cur.onTime++
      if (!cur.firstScan || log.scanned_at < cur.firstScan) cur.firstScan = log.scanned_at
      if (!cur.lastScan || log.scanned_at > cur.lastScan) cur.lastScan = log.scanned_at
      map.set(key, cur)
    }
    for (const r of perRound) {
      const cur = map.get(r.guardName) ?? {
        name: r.guardName,
        rounds: [],
        visited: 0,
        missed: 0,
        total: 0,
        onTime: 0,
        firstScan: null,
        lastScan: null,
      }
      if (!cur.rounds.includes(r.roundName)) cur.rounds.push(r.roundName)
      cur.visited += r.doneCount
      if (r.ended) cur.missed += r.missed.length
      map.set(r.guardName, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [logs, perRound])

  const rangeDays = useMemo(() => {
    const ms = new Date(`${toDate}T00:00:00`).getTime() - new Date(`${fromDate}T00:00:00`).getTime()
    return Math.round(ms / 86400000) + 1
  }, [fromDate, toDate])

  const slaTrend = useMemo(() => {
    const weekly = rangeDays > 31
    const keyOf = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const weekStartOf = (d: Date) => {
      const copy = new Date(d)
      const day = (copy.getDay() + 6) % 7
      copy.setDate(copy.getDate() - day)
      return copy
    }
    const per = new Map<string, { onTime: number; total: number }>()
    for (const log of logs) {
      const d = new Date(`${log.scanned_at.slice(0, 10)}T00:00:00`)
      const key = keyOf(weekly ? weekStartOf(d) : d)
      const cur = per.get(key) ?? { onTime: 0, total: 0 }
      cur.total++
      if (isOnTime(log)) cur.onTime++
      per.set(key, cur)
    }
    const out: { key: string; label: string; sla: number; scans: number }[] = []
    const start = new Date(`${fromDate}T00:00:00`)
    const end = new Date(`${toDate}T00:00:00`)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = keyOf(weekly ? weekStartOf(d) : d)
      if (out.length > 0 && out[out.length - 1].key === key) continue
      const v = per.get(key) ?? { onTime: 0, total: 0 }
      out.push({
        key,
        label: `${key.slice(8, 10)}/${key.slice(5, 7)}`,
        sla: v.total > 0 ? Math.round((v.onTime / v.total) * 100) : 0,
        scans: v.total,
      })
    }
    return out
  }, [logs, rangeDays, fromDate, toDate])

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

  async function exportPdf() {
    setExporting(true)
    try {
      const doc = new jsPDF()
      doc.setFontSize(15)
      doc.setFont('helvetica', 'bold')
      doc.text('Laporan & Rekap e-Patroli', 14, 16)
      doc.setFontSize(9.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(110)
      doc.text(`Periode: ${fmtDate(fromDate)} s/d ${fmtDate(toDate)}`, 14, 23)
      doc.setTextColor(0)

      autoTable(doc, {
        startY: 28,
        head: [['Metrik', 'Nilai']],
        body: [
          ['Jumlah scan', String(stats.total)],
          ['Kepatuhan SLA', `${compliance}%`],
          ['Insiden terbuka', String(stats.open)],
          ['Insiden ditindak', String(stats.inProgress)],
          ['Insiden selesai', String(stats.resolved)],
          ['Rata-rata waktu penyelesaian', fmtResponse(stats.avgResponseMs)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
        theme: 'grid',
      })
      let y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 28) + 8

      if (perGuardDetail.length > 0) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text('Kinerja & Log Presensi Satpam', 14, y)
        autoTable(doc, {
          startY: y + 2,
          head: [['Satpam', 'Ronde / Shift', 'Titik dikunjungi', 'Titik missed', 'Tepat waktu', 'Scan pertama', 'Scan terakhir']],
          body: perGuardDetail.map((g) => [
            g.name,
            g.rounds.join(', ') || '—',
            String(g.visited),
            String(g.missed),
            `${g.onTime}/${g.total}`,
            fmtDT(g.firstScan),
            fmtDT(g.lastScan),
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
          theme: 'grid',
        })
        y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8
      }

      if (perRound.length > 0) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text('Kepatuhan Per Ronde', 14, y)
        autoTable(doc, {
          startY: y + 2,
          head: [['Ronde', 'Satpam', 'Tanggal', 'Titik discan', 'Status']],
          body: perRound.map((r) => [
            r.roundName,
            r.guardName,
            fmtDate(r.date),
            `${r.doneCount}/${r.points.length}`,
            r.ended ? (r.missed.length === 0 ? 'Compliant' : `${r.missed.length} terlewat`) : 'Belum berakhir',
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
          theme: 'grid',
        })
        y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8
      }

      if (perCheckpoint.length > 0) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text('Aktivitas Per Titik', 14, y)
        autoTable(doc, {
          startY: y + 2,
          head: [['Titik patroli', 'Jumlah scan', 'Terakhir discan', 'Oleh']],
          body: perCheckpoint.map((c) => [
            c.name,
            String(c.count),
            c.lastAt ? fmtDT(c.lastAt) : '—',
            c.lastGuard ?? '—',
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
          theme: 'grid',
        })
        y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8
      }

      if (incidents.length > 0) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text('Insiden per Kategori', 14, y)
        autoTable(doc, {
          startY: y + 2,
          head: [['Kategori', 'Jumlah']],
          body: catEntries.map((c) => [c.label, String(c.value)]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
          theme: 'grid',
        })
      }

      doc.save(`laporan-99guard-${fromDate}-s/d-${toDate}.pdf`)
      toast.success('PDF berhasil diunduh')
    } catch (e) {
      console.error('[ReportsPage] gagal export PDF:', e)
      toast.error('Gagal membuat PDF')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900">Laporan &amp; Rekap</h1>
            <p className="truncate text-sm text-slate-500">
              Rekap {fmtDate(fromDate)}
              {fromDate !== toDate && ` – ${fmtDate(toDate)}`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 lg:gap-3">
            <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return
                  if (v > toDate) {
                    setFromDate(toDate)
                    setToDate(v)
                  } else {
                    setFromDate(v)
                  }
                }}
                className="h-10 w-full rounded-full text-sm"
              />
              <span className="text-xs text-slate-400">s/d</span>
              <Input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return
                  if (v < fromDate) {
                    setToDate(fromDate)
                    setFromDate(v)
                  } else {
                    setToDate(v)
                  }
                }}
                className="h-10 w-full rounded-full text-sm"
              />
            </div>
            <Button
              onClick={exportPdf}
              disabled={exporting}
              className="h-10 w-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark px-4 text-xs font-bold shadow-sm sm:w-auto"
            >
              <Download className="size-4" />
              {exporting ? 'Membuat PDF...' : 'Unduh PDF'}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
          >
            <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', c.cls)}>
              <c.icon className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight text-slate-900">{c.value}</p>
              <p className="truncate text-[11px] font-medium text-slate-500">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <FileBarChart className="size-4 text-brand-blue" />
          Tren Patroli &amp; Kepatuhan SLA
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            {rangeDays > 31 ? 'per minggu' : 'per hari'}
          </span>
        </h2>
        {slaTrend.every((p) => p.scans === 0) ? (
          <p className="py-6 text-center text-sm text-slate-400">Belum ada data scan pada periode ini</p>
        ) : (
          <div className={cn('h-52 w-full overflow-x-auto sm:h-64', scrollbarCls)}>
            <div className="h-full min-w-[440px] sm:min-w-0">
              <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={slaTrend} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  minTickGap={24}
                  tickMargin={6}
                />
                <YAxis
                  yAxisId="sla"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis
                  yAxisId="scans"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(value, name) =>
                    String(name) === 'Kepatuhan SLA' ? [`${value}%`, name] : [value, name]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="scans"
                  dataKey="scans"
                  name="Jumlah scan"
                  fill="#bfdbfe"
                  radius={[6, 6, 0, 0]}
                  barSize={18}
                />
                <Line
                  yAxisId="sla"
                  type="monotone"
                  dataKey="sla"
                  name="Kepatuhan SLA"
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#059669' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 rounded-full px-2 py-2.5 text-xs font-bold transition sm:px-4',
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
            Kinerja &amp; Log Presensi Satpam
          </h2>
          {perGuardDetail.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Belum ada data scan pada periode ini</p>
          ) : (
            <>
              <div className="space-y-3 sm:hidden">
                {perGuardDetail.map((g) => (
                  <div key={g.name} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-bold text-slate-900">{g.name}</p>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', slaBadgeCls(g))}>
                        {g.onTime}/{g.total}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Ronde / Shift
                        </dt>
                        <dd className="mt-0.5 font-medium text-slate-700">{g.rounds.join(', ') || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Titik dikunjungi
                        </dt>
                        <dd className="mt-0.5 font-medium text-slate-700">{g.visited}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Titik missed
                        </dt>
                        <dd className={cn('mt-0.5 font-medium', g.missed > 0 ? 'font-bold text-red-600' : 'text-slate-700')}>
                          {g.missed}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Tepat waktu
                        </dt>
                        <dd className="mt-0.5 font-medium text-slate-700">
                          {g.onTime}/{g.total}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Scan pertama
                        </dt>
                        <dd className="mt-0.5 font-medium text-slate-700">{fmtDT(g.firstScan)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Scan terakhir
                        </dt>
                        <dd className="mt-0.5 font-medium text-slate-700">{fmtDT(g.lastScan)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
              <div className="hidden sm:block">
                <Table className={scrollbarCls}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Satpam</TableHead>
                      <TableHead>Ronde / Shift</TableHead>
                      <TableHead className="text-center">Titik dikunjungi</TableHead>
                      <TableHead className="text-center">Titik missed</TableHead>
                      <TableHead className="text-center">Tepat waktu</TableHead>
                      <TableHead>Scan pertama</TableHead>
                      <TableHead>Scan terakhir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perGuardDetail.map((g) => (
                      <TableRow key={g.name}>
                        <TableCell className="font-semibold text-slate-800">{g.name}</TableCell>
                        <TableCell className="text-xs text-slate-500">{g.rounds.join(', ') || '—'}</TableCell>
                        <TableCell className="text-center text-slate-700">{g.visited}</TableCell>
                        <TableCell className={cn('text-center', g.missed > 0 ? 'font-bold text-red-600' : 'text-slate-700')}>
                          {g.missed}
                        </TableCell>
                        <TableCell className="text-center text-slate-700">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', slaBadgeCls(g))}>
                            {g.onTime}/{g.total}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{fmtDT(g.firstScan)}</TableCell>
                        <TableCell className="text-xs text-slate-500">{fmtDT(g.lastScan)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
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
                <div key={c.name} className="flex flex-wrap items-center gap-3">
                  <span className="w-40 truncate text-xs font-semibold text-slate-700">{c.name}</span>
                  <span className="rounded-full bg-brand-blue-light px-2.5 py-0.5 text-[11px] font-bold text-brand-blue">
                    {c.count}x
                  </span>
                  <span className="ml-auto text-right text-[11px] text-slate-500">
                    {c.lastAt
                      ? `${fmtDT(c.lastAt)} · ${c.lastGuard}`
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