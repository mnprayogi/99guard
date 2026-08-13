import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getSites } from '@/lib/api'
import { cn } from '@/lib/utils'
import { KeyRound, Plus, ShieldCheck, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Role } from '@/lib/types'

interface UserRow {
  id: string
  full_name: string
  role: Role
  active: boolean
  site_id: string | null
  sites: { name: string } | null
}

const roleLabel: Record<Role, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  satpam: 'Satpam',
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'satpam' as Role,
    site_id: '',
  })
  const [creating, setCreating] = useState(false)

  const [resetUser, setResetUser] = useState<UserRow | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [u, s] = await Promise.all([
        supabase.from('profiles').select('*, sites(name)').order('full_name'),
        getSites(),
      ])
      if (u.error) throw u.error
      setUsers(u.data as UserRow[])
      setSites(s)
    } catch {
      toast.error('Gagal memuat pengguna')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function updateRole(user: UserRow, role: Role) {
    setUpdating(user.id)
    const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id)
    setUpdating(null)
    if (error) {
      toast.error('Gagal mengubah role')
      return
    }
    toast.success(`Role ${user.full_name} → ${roleLabel[role]}`)
    load()
  }

  async function updateSite(user: UserRow, siteId: string) {
    setUpdating(user.id)
    const { error } = await supabase
      .from('profiles')
      .update({ site_id: siteId || null })
      .eq('id', user.id)
    setUpdating(null)
    if (error) {
      toast.error('Gagal mengubah site')
      return
    }
    toast.success(`Site ${user.full_name} diperbarui`)
    load()
  }

  async function toggleActive(user: UserRow) {
    setUpdating(user.id)
    const { error } = await supabase.from('profiles').update({ active: !user.active }).eq('id', user.id)
    setUpdating(null)
    if (error) {
      toast.error('Gagal mengubah status')
      return
    }
    toast.success(user.active ? `${user.full_name} dinonaktifkan` : `${user.full_name} diaktifkan`)
    load()
  }

  async function createUser() {
    if (!createForm.email.trim() || !createForm.password || !createForm.full_name.trim()) {
      toast.error('Email, password, dan nama wajib diisi')
      return
    }
    setCreating(true)
    const { error } = await supabase.rpc('admin_create_user', {
      p_email: createForm.email.trim(),
      p_password: createForm.password,
      p_full_name: createForm.full_name.trim(),
      p_role: createForm.role,
      p_site_id: createForm.site_id || null,
    })
    setCreating(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Pengguna berhasil dibuat')
    setCreateOpen(false)
    setCreateForm({ email: '', password: '', full_name: '', role: 'satpam', site_id: '' })
    load()
  }

  async function resetPassword() {
    if (!resetUser || !newPassword) return
    setResetting(true)
    const { error } = await supabase.rpc('admin_reset_password', {
      p_user_id: resetUser.id,
      p_new_password: newPassword,
    })
    setResetting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Password diperbarui')
    setResetUser(null)
    setNewPassword('')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pengguna</h1>
          <p className="text-sm text-slate-500">Kelola akun admin & satpam</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="h-11 rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white">
              <Plus className="size-4" /> Pengguna Baru
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buat Pengguna Baru</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nama Lengkap</Label>
                <Input
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                  placeholder="Nama pengguna"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="nama@perusahaan.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Minimal 6 karakter"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select
                    value={createForm.role}
                    onValueChange={(v) => setCreateForm({ ...createForm, role: v as Role })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(roleLabel).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Site</Label>
                  <Select
                    value={createForm.site_id}
                    onValueChange={(v) => setCreateForm({ ...createForm, site_id: v })}
                  >
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
              </div>
              <Button
                onClick={createUser}
                disabled={creating}
                className="h-11 w-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white"
              >
                {creating ? 'Membuat...' : 'Simpan'}
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
      ) : (
        <div className="space-y-2.5">
          {users.map((u) => (
            <div key={u.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-blue-light text-brand-blue">
                  {u.role === 'superadmin' ? <ShieldCheck className="size-5" /> : <UserCog className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{u.full_name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {u.sites ? `Site: ${u.sites.name}` : 'Belum ada site'}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[10px] font-bold',
                    u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {u.active ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <Select value={u.role} onValueChange={(v) => updateRole(u, v as Role)}>
                  <SelectTrigger disabled={updating === u.id} className="h-9 w-36 rounded-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(roleLabel).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={u.site_id ?? ''} onValueChange={(v) => updateSite(u, v)}>
                  <SelectTrigger disabled={updating === u.id} className="h-9 w-40 rounded-full text-xs">
                    <SelectValue placeholder="Tanpa site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tanpa site</SelectItem>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Dialog open={resetUser?.id === u.id} onOpenChange={(o) => !o && setResetUser(null)}>
                  <DialogTrigger asChild>
                    <button
                      onClick={() => setResetUser(u)}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      <KeyRound className="size-3.5" /> Reset Password
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Reset Password — {u.full_name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Password Baru</Label>
                        <Input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Minimal 6 karakter"
                        />
                      </div>
                      <Button
                        onClick={resetPassword}
                        disabled={resetting || !newPassword}
                        className="h-11 w-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white"
                      >
                        {resetting ? 'Menyimpan...' : 'Simpan Password'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <button
                  onClick={() => toggleActive(u)}
                  disabled={updating === u.id}
                  className="ml-auto rounded-full px-3 py-1.5 text-xs font-semibold text-brand-blue hover:bg-brand-blue-light disabled:opacity-50"
                >
                  {u.active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}