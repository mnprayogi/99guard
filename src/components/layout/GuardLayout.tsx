import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { syncNow } from '@/lib/offline'
import { LogOut, MapPin, ShieldCheck, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

const tabs = [
  { to: '/patrol', label: 'Patroli', icon: MapPin },
  { to: '/patrol/insiden', label: 'Lapor', icon: ShieldCheck },
  { to: '/patrol/riwayat', label: 'Riwayat', icon: ClipboardList },
]

export default function GuardLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => {
      setOnline(true)
      syncNow()
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 font-sans">
      <header className="sticky top-0 z-30 bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white shadow-md shadow-blue-900/20">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-full bg-white">
              <ShieldCheck className="size-5 text-brand-blue" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">99Guard</p>
              <p className="text-[11px] leading-tight text-blue-50">
                {profile?.full_name || 'Satpam'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                online ? 'bg-emerald-500/25 text-emerald-50' : 'bg-red-500/30 text-red-50',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  online ? 'bg-emerald-300' : 'bg-red-200',
                )}
              />
              {online ? 'Online' : 'Offline'}
            </span>
            <button
              onClick={async () => {
                await signOut()
                navigate('/login', { replace: true })
              }}
              className="rounded-full p-1.5 transition hover:bg-white/15"
              title="Keluar"
            >
              <LogOut className="size-4.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-lg grid-cols-3">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/patrol'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition',
                  isActive ? 'text-brand-blue' : 'text-slate-500 hover:text-slate-700',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full transition',
                      isActive && 'bg-brand-blue-light',
                    )}
                  >
                    <tab.icon className="size-4.5" />
                  </span>
                  {tab.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}