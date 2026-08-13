import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getAssignableGuards, getRounds, getSites, getCheckpoints } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { CalendarDays, Pencil, Plus, Route, Trash2, Users } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface RoundRow {
  id: string
  name: string
  start_time: string
  end_time: string
  tolerance_minutes: number
  active: boolean
  site_id: string
  sites: { name: string } | null
  round_checkpoints: { id: string; checkpoint_id: string }[]
  round_assignments: { id: string; guard_id: string; date: string; profiles: { full_name: string } | null }[]
}

export default function RoundsPage() {
  const { profile } = useAuth()
  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [checkpoints, setCheckpoints] = useState<{ id: string; name: string; site_id: string }[]>([])
  const [guards, setGuards] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<RoundRow | null>(null)

  const [form, setForm] = useState({
    id: '',
    name: '',
    site_id: '',
    start_time: '07:00',
    end_time: '08:00',
    tolerance_minutes: 15,
    selected: [] as string[],
  })

  async function load() {
    setLoading(true)
    try {
      const [r, s, c, g] = await Promise.all([
        getRounds(),
        getSites(),
        getCheckpoints(),
        getAssignableGuards(profile?.role === 'admin' ? profile.site_id : null),
      ])
      setRounds(r as RoundRow[])
      setSites(s)
      setCheckpoints(c)
      setGuards(g)
    } catch {
      toast.error('Gagal memuat data ronde')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [profile])

  useEffect(() => {
    if (open && !form.site_id) {
      setForm((f) => ({ ...f, site_id: f.site_id || profile?.site_id || sites[0]?.id || '' }))
    }
  }, [open, sites, profile, form.site_id])

  const siteCheckpoints = checkpoints.filter(
    (c) => !form.site_id || c.site_id === form.site_id,
  )

  function openCreate() {
    setForm({
      id: '',
      name: '',
      site_id: profile?.site_id || sites[0]?.id || '',
      start_time: '07:00',
      end_time: '08:00',
      tolerance_minutes: 15,
      selected: [],
    })
    setOpen(true)
  }

  function openEdit(round: RoundRow) {
    setForm({
      id: round.id,
      name: round.name,
      site_id: round.site_id,
      start_time: round.start_time.slice(0, 5),
      end_time: round.end_time.slice(0, 5),
      tolerance_minutes: round.tolerance_minutes,
      selected: round.round_checkpoints.map((rc) => rc.checkpoint_id),
    })
    setOpen(true)
  }

  async function saveRound() {
    if (!form.name.trim() || !form.site_id) {
      toast.error('Nama ronde dan site wajib diisi')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        site_id: form.site_id,
        start_time: form.start_time,
        end_time: form.end_time,
        tolerance_minutes: form.tolerance_minutes,
      }
      if (form.id) {
        const { error } = await supabase.from('rounds').update(payload).eq('id', form.id)
        if (error) throw error
        const { error: delErr } = await supabase
          .from('round_checkpoints')
          .delete()
          .eq('round_id', form.id)
        if (delErr) throw delErr
        if (form.selected.length) {
          const { error: rcErr } = await supabase.from('round_checkpoints').insert(
            form.selected.map((cid, i) => ({
              round_id: form.id,
              checkpoint_id: cid,
              order_index: i + 1,
            })),
          )
          if (rcErr) throw rcErr
        }
        toast.success('Ronde diperbarui')
      } else {
        const { data, error } = await supabase
          .from('rounds')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        if (form.selected.length) {
          const { error: rcErr } = await supabase.from('round_checkpoints').insert(
            form.selected.map((cid, i) => ({
              round_id: data.id,
              checkpoint_id: cid,
              order_index: i + 1,
            })),
          )
          if (rcErr) throw rcErr
        }
        toast.success('Ronde berhasil dibuat')
      }
      setOpen(false)
      load()
    } catch {
      toast.error('Gagal menyimpan ronde')
    } finally {
      setSaving(false)
    }
  }

  async function toggleRoundActive(round: RoundRow) {
    const { error } = await supabase
      .from('rounds')
      .update({ active: !round.active })
      .eq('id', round.id)
    if (error) return toast.error('Gagal mengubah status')
    load()
  }

  async function assignGuard(roundId: string, guardId: string) {
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('round_assignments').insert({
      round_id: roundId,
      guard_id: guardId,
      date: today,
    })
    if (error) {
      if (error.code === '23505') toast.error('Satpam sudah di-assign di ronde ini')
      else toast.error('Gagal assign')
      return
    }
    toast.success('Satpam di-assign untuk hari ini')
    load()
  }

  async function removeAssignment(id: string) {
    const { error } = await supabase.from('round_assignments').delete().eq('id', id)
    if (error) return toast.error('Gagal menghapus assignment')
    load()
  }

  async function removeRound() {
    if (!deleting) return
    const { error } = await supabase.from('rounds').delete().eq('id', deleting.id)
    if (error) return toast.error('Gagal menghapus ronde')
    toast.success('Ronde dihapus')
    setDeleting(null)
    load()
  }

  const todayAssignments = (r: RoundRow) =>
    r.round_assignments.filter((a) => a.date === new Date().toISOString().slice(0, 10))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Setting Ronde</h1>
          <p className="text-sm text-slate-500">Atur jadwal & titik patroli harian</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o)
              setForm({
                id: '',
                name: '',
                site_id: '',
                start_time: '07:00',
                end_time: '08:00',
                tolerance_minutes: 15,
                selected: [],
              })
          }}
        >
          <DialogTrigger asChild>
            <Button
              onClick={openCreate}
              className="h-11 rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white"
            >
              <Plus className="size-4" /> Ronde Baru
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? 'Edit Ronde' : 'Buat Ronde Baru'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nama Ronde</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="mis. Ronde Pagi"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Site</Label>
                <Select value={form.site_id} onValueChange={(v) => setForm({ ...form, site_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Mulai</Label>
                  <Input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Selesai</Label>
                  <Input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Toleransi (mnt)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.tolerance_minutes}
                    onChange={(e) =>
                      setForm({ ...form, tolerance_minutes: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Titik Patroli Wajib</Label>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-2xl border border-slate-200 p-2">
                  {siteCheckpoints.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-slate-400">
                      Belum ada titik di site ini
                    </p>
                  )}
                  {siteCheckpoints.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-sm hover:bg-slate-50"
                    >
                      <Checkbox
                        checked={form.selected.includes(c.id)}
                        onCheckedChange={(checked) => {
                          setForm({
                            ...form,
                            selected: checked
                              ? [...form.selected, c.id]
                              : form.selected.filter((x) => x !== c.id),
                          })
                        }}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <Button
                onClick={saveRound}
                disabled={saving}
                className="h-11 w-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white"
              >
                {saving ? 'Menyimpan...' : 'Simpan Ronde'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : rounds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Route className="mx-auto size-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-500">Belum ada ronde</p>
        </div>
      ) : (
        rounds.map((round) => (
          <div key={round.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{round.name}</h3>
                  <Badge
                    variant="outline"
                    className={cn(
                      round.active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500',
                    )}
                  >
                    {round.active ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {round.sites?.name} &middot; {round.start_time.slice(0, 5)}–{round.end_time.slice(0, 5)} &middot;
                  toleransi {round.tolerance_minutes} mnt &middot; {round.round_checkpoints.length} titik
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openEdit(round)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-brand-blue-light hover:text-brand-blue"
                  title="Edit"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => toggleRoundActive(round)}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand-blue hover:bg-brand-blue-light"
                >
                  {round.active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button
                  onClick={() => setDeleting(round)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Hapus"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {round.round_checkpoints.length === 0 && (
                <span className="text-xs text-slate-400">Belum ada titik</span>
              )}
              {Array.from({ length: round.round_checkpoints.length }, (_, i) => (
                <span
                  key={i}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500"
                >
                  Titik {i + 1}
                </span>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <Users className="size-4 text-slate-400" />
              <Select onValueChange={(gid) => assignGuard(round.id, gid)}>
                <SelectTrigger className="h-9 w-44 rounded-full text-xs">
                  <SelectValue placeholder="Assign satpam hari ini" />
                </SelectTrigger>
                <SelectContent>
                  {guards.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {todayAssignments(round).map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-full bg-brand-blue-light px-3 py-1 text-[11px] font-semibold text-brand-blue"
                >
                  <CalendarDays className="size-3" />
                  {a.profiles?.full_name ?? 'Satpam'}
                  <button
                    onClick={() => removeAssignment(a.id)}
                    className="text-brand-blue/60 hover:text-red-500"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus ronde ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Ronde "{deleting?.name}" beserta daftar titik dan penugasan terkait akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={removeRound} className="bg-red-600 text-white hover:bg-red-700">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}