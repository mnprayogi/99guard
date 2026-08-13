import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getSites } from '@/lib/api'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'

interface SiteRow {
  id: string
  name: string
  address: string | null
  created_at: string
}

export default function SitesPage() {
  const [sites, setSites] = useState<SiteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ id: '', name: '', address: '' })
  const [deleting, setDeleting] = useState<SiteRow | null>(null)

  async function load() {
    setLoading(true)
    try {
      setSites((await getSites()) as SiteRow[])
    } catch {
      toast.error('Gagal memuat site')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function save() {
    if (!form.name.trim()) {
      toast.error('Nama site wajib diisi')
      return
    }
    setSaving(true)
    const payload = { name: form.name.trim(), address: form.address.trim() || null }
    const { error } = form.id
      ? await supabase.from('sites').update(payload).eq('id', form.id)
      : await supabase.from('sites').insert(payload)
    setSaving(false)
    if (error) {
      toast.error(form.id ? 'Gagal memperbarui site' : 'Gagal menyimpan site')
      return
    }
    toast.success(form.id ? 'Site diperbarui' : 'Site berhasil dibuat')
    setForm({ id: '', name: '', address: '' })
    setOpen(false)
    load()
  }

  async function remove() {
    if (!deleting) return
    const { error } = await supabase.from('sites').delete().eq('id', deleting.id)
    if (error) {
      toast.error('Gagal menghapus site')
      return
    }
    toast.success('Site dihapus')
    setDeleting(null)
    load()
  }

  function openEdit(s: SiteRow) {
    setForm({ id: s.id, name: s.name, address: s.address ?? '' })
    setOpen(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Site</h1>
          <p className="text-sm text-slate-500">Kelola lokasi perusahaan yang dijaga</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) setForm({ id: '', name: '', address: '' })
          }}
        >
          <DialogTrigger asChild>
            <Button className="h-11 rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white">
              <Plus className="size-4" /> Site Baru
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? 'Edit Site' : 'Tambah Site'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nama Site</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="mis. Kantor Pusat"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Alamat</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Alamat lengkap (opsional)"
                />
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
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : sites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Building2 className="mx-auto size-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-500">Belum ada site</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sites.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-blue-light text-brand-blue">
                  <Building2 className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{s.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{s.address ?? 'Tanpa alamat'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(s)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-brand-blue-light hover:text-brand-blue"
                    title="Edit"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => setDeleting(s)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Hapus"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus site ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Site "{deleting?.name}" beserta titik patroli dan ronde terkait akan ikut terhapus. Tindakan ini tidak dapat dibatalkan.
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