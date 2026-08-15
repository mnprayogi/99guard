import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import {
  BarChart3,
  ClipboardList,
  HardDrive,
  LayoutDashboard,
  LogOut,
  MapPin,
  MapPinned,
  Menu,
  Route,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/ronde', label: 'Ronde', icon: Route },
  { to: '/admin/insiden', label: 'Insiden', icon: ClipboardList },
  { to: '/admin/laporan', label: 'Laporan', icon: BarChart3 },
]

const superNav = [
  { to: '/admin/pengguna', label: 'Pengguna', icon: Users, end: false },
  { to: '/admin/site', label: 'Site', icon: MapPinned, end: false },
  { to: '/admin/titik', label: 'Titik Patroli', icon: MapPin, end: false },
  { to: '/admin/penyimpanan', label: 'Penyimpanan', icon: HardDrive, end: false },
]

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const isSuper = profile?.role === 'superadmin'

  const nav = [...adminNav, ...(isSuper ? superNav : [])]

  const content = (
    <>
      <div className="flex items-center gap-2.5 px-4 pb-6 pt-5">
        <div className="flex size-9 items-center justify-center rounded-full bg-white">
          <ShieldCheck className="size-5 text-brand-blue" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-white">99Guard</p>
          <p className="text-[11px] leading-tight text-blue-200">Panel Admin</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-white text-brand-blue shadow-sm'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white',
              )
            }
          >
            <item.icon className="size-4.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 pb-5">
        <div className="mb-2 flex items-center gap-2.5 rounded-2xl bg-white/10 px-3.5 py-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
            {(profile?.full_name || 'A').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{profile?.full_name}</p>
            <p className="text-[10px] capitalize text-blue-200">{profile?.role}</p>
          </div>
        </div>
        <button
          onClick={async () => {
            await signOut()
            navigate('/login', { replace: true })
          }}
          className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-blue-100 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-4.5" />
          Keluar
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-dvh bg-slate-100 font-sans">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-gradient-to-b from-brand-blue to-brand-blue-dark lg:flex">
        {content}
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild className="lg:hidden">
          <Button variant="outline" size="icon" className="absolute left-3 top-3 z-40 bg-white">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 bg-brand-blue p-0 text-white">
          <SheetTitle className="sr-only">Menu Admin</SheetTitle>
          {content}
        </SheetContent>
      </Sheet>

      <main className="min-h-dvh flex-1 px-4 pb-4 pt-14 sm:px-6 lg:ml-64 lg:px-8 lg:py-6">
        <Outlet />
      </main>
    </div>
  )
}