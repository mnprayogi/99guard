import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { getCheckpoints, getSites } from '@/lib/api'
import CheckpointPoster from '@/components/admin/CheckpointPoster'
import { MapPin, Pencil, Plus, Printer, QrCode, Trash2 } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface CheckpointRow {
  id: string
  name: string
  qr_code: string
  description: string | null
  lat: number | null
  lng: number | null
  active: boolean
  site_id: string
  sites: { name: string } | null
}

export default function CheckpointsPage() {
  const [points, setPoints] = useState<CheckpointRow[]>([])
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    id: '',
    name: '',
    site_id: '',
    qr_code: '',
    description: '',
    lat: '',
    lng: '',
  })
  const [deleting, setDeleting] = useState<CheckpointRow | null>(null)
  const [qrPoint, setQrPoint] = useState<CheckpointRow | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [p, s] = await Promise.all([getCheckpoints(), getSites()])
      setPoints(p as CheckpointRow[])
      setSites(s)
    } catch {
      toast.error('Gagal memuat titik patroli')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (open && !form.site_id && sites[0]) {
      setForm((f) => ({ ...f, site_id: sites[0].id }))
    }
  }, [open, sites, form.site_id])

  async function showQr(point: CheckpointRow) {
    setQrPoint(point)
    setQrDataUrl('')
    try {
      const url = await QRCode.toDataURL(point.qr_code, {
        width: 480,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#1e293b', light: '#ffffff' },
      })
      setQrDataUrl(url)
    } catch {
      toast.error('Gagal membuat QR')
    }
  }

  async function save() {
    if (!form.name.trim() || !form.site_id) {
      toast.error('Nama titik dan site wajib diisi')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      site_id: form.site_id,
      qr_code: form.qr_code.trim() || `CP-${Date.now().toString().slice(-6)}`,
      description: form.description.trim() || null,
      lat: form.lat.trim() ? Number(form.lat) : null,
      lng: form.lng.trim() ? Number(form.lng) : null,
    }
    const { error } = form.id
      ? await supabase.from('checkpoints').update(payload).eq('id', form.id)
      : await supabase.from('checkpoints').insert(payload)
    setSaving(false)
    if (error) {
      toast.error(form.id ? 'Gagal memperbarui titik' : 'Gagal menyimpan titik')
      return
    }
    toast.success(form.id ? 'Titik diperbarui' : 'Titik berhasil dibuat')
    setOpen(false)
    setForm({ id: '', name: '', site_id: form.site_id, qr_code: '', description: '', lat: '', lng: '' })
    load()
  }

  function openEdit(p: CheckpointRow) {
    setForm({
      id: p.id,
      name: p.name,
      site_id: p.site_id,
      qr_code: p.qr_code,
      description: p.description ?? '',
      lat: p.lat?.toString() ?? '',
      lng: p.lng?.toString() ?? '',
    })
    setOpen(true)
  }

  async function toggleActive(p: CheckpointRow) {
    const { error } = await supabase.from('checkpoints').update({ active: !p.active }).eq('id', p.id)
    if (error) return toast.error('Gagal mengubah status')
    load()
  }

  async function remove() {
    if (!deleting) return
    const { error } = await supabase.from('checkpoints').delete().eq('id', deleting.id)
    if (error) {
      toast.error('Gagal menghapus titik')
      return
    }
    toast.success('Titik dihapus')
    setDeleting(null)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Titik Patroli</h1>
          <p className="text-sm text-slate-500">Kelola QR code di tiap titik</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) setForm({ id: '', name: '', site_id: '', qr_code: '', description: '', lat: '', lng: '' })
          }}
        >
          <DialogTrigger asChild>
            <Button className="h-11 rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white">
              <Plus className="size-4" /> Titik Baru
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? 'Edit Titik Patroli' : 'Tambah Titik Patroli'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nama Titik</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="mis. Lobby Utama"
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
              <div className="space-y-1.5">
                <Label>Kode QR</Label>
                <Input
                  value={form.qr_code}
                  onChange={(e) => setForm({ ...form, qr_code: e.target.value })}
                  placeholder="mis. CP-LOBBY-01 (kosongkan untuk otomatis)"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Deskripsi (opsional)</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="mis. Dekat pintu masuk utama"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Latitude (opsional)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: e.target.value })}
                    placeholder="-6.2088"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Longitude (opsional)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: e.target.value })}
                    placeholder="106.8456"
                  />
                </div>
              </div>
              <Button
                onClick={save}
                disabled={saving}
                className="h-11 w-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : points.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <MapPin className="mx-auto size-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-500">Belum ada titik patroli</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {points.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-blue-light text-brand-blue">
                  <MapPin className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{p.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{p.sites?.name}</p>
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    <QrCode className="size-3" /> {p.qr_code}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => showQr(p)}
                      className="rounded-full p-1.5 text-slate-400 hover:bg-brand-blue-light hover:text-brand-blue"
                      title="Tampilkan QR"
                    >
                      <Printer className="size-4" />
                    </button>
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded-full p-1.5 text-slate-400 hover:bg-brand-blue-light hover:text-brand-blue"
                      title="Edit"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => setDeleting(p)}
                      className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Hapus"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => toggleActive(p)}
                    className={cn(
                      'rounded-full px-3 py-1 text-[11px] font-bold',
                      p.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {p.active ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!qrPoint}
        onOpenChange={(o) => {
          if (!o) {
            setQrPoint(null)
            setQrDataUrl('')
          }
        }}
      >
        <DialogContent className="print-area max-w-xl">
          <DialogHeader>
            <DialogTitle>Poster QR Titik Patroli</DialogTitle>
          </DialogHeader>
          <div className="print-preview-wrap max-h-[65vh] overflow-auto rounded-2xl bg-slate-100 p-4">
            <div className="poster-preview">
              <CheckpointPoster
                name={qrPoint?.name ?? ''}
                qrCode={qrPoint?.qr_code ?? ''}
                site={qrPoint?.sites?.name ?? ''}
                description={qrPoint?.description ?? null}
                lat={qrPoint?.lat ?? null}
                lng={qrPoint?.lng ?? null}
                qrDataUrl={qrDataUrl}
              />
            </div>
          </div>
          <Button
            onClick={() => window.print()}
            disabled={!qrDataUrl}
            className="h-11 w-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white"
          >
            <Printer className="size-4" /> Cetak Poster
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus titik ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Titik "{deleting?.name}" akan dihapus permanen. Riwayat patroli yang sudah tercatat tetap tersimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}