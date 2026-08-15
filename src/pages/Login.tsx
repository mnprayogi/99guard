import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import ConnectedDots from '@/components/ConnectedDots'

export default function Login() {
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }
    await refreshProfile()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white font-sans dark:bg-slate-950">
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand-blue to-brand-blue-dark pb-16 pt-16 text-white">
        <ConnectedDots
          className="pointer-events-none absolute inset-0 h-full w-full"
          color="rgba(255,255,255,0.5)"
          linkColor="rgba(255,255,255,0.16)"
          density={0.00012}
          speed={0.4}
        />
        <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-white shadow-lg shadow-blue-900/30">
            <img src="/logo.png" alt="99Guard" className="size-20 rounded-full object-cover" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">99Guard</h1>
            <p className="mt-1 text-sm font-medium text-blue-100">Sistem e-Patroli Satpam</p>
          </div>
        </div>
        <svg
          className="absolute bottom-[-1px] left-0 w-[200%] text-white dark:text-slate-950"
          viewBox="0 0 2880 70"
          fill="currentColor"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g className="animate-wave motion-reduce:animate-none">
            <path d="M0,32 C240,72 480,8 720,32 C960,56 1200,8 1440,32 L1440,70 L0,70 Z" />
            <path
              d="M0,50 C240,24 480,58 720,50 C960,40 1200,58 1440,50 L1440,70 L0,70 Z"
              opacity="0.4"
            />
            <path d="M1440,32 C1680,72 1920,8 2160,32 C2400,56 2640,8 2880,32 L2880,70 L1440,70 Z" />
            <path
              d="M1440,50 C1680,24 1920,58 2160,50 C2400,40 2640,58 2880,50 L2880,70 L1440,70 Z"
              opacity="0.4"
            />
          </g>
        </svg>
      </header>

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-8 pb-8 pt-6">
        <ConnectedDots
          className="pointer-events-none absolute inset-0 h-full w-full"
          color="rgba(15,98,254,0.10)"
          linkColor="rgba(15,98,254,0.05)"
          density={0.00008}
          speed={0.25}
        />
        <div className="relative z-10">
          <h2 className="text-[22px] font-bold text-slate-900 dark:text-white">
            Selamat datang kembali
          </h2>
          <p className="mt-1 text-sm text-slate-400 dark:text-slate-400">
            Masuk untuk memulai patroli Anda
          </p>
        </div>

        <div className="relative z-10 mt-8">
          <form onSubmit={handleSubmit} className="space-y-7">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-sm font-semibold text-slate-900 dark:text-white"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@perusahaan.com"
              className="w-full border-0 border-b-2 border-slate-200 bg-transparent px-0.5 py-2.5 text-base text-slate-900 outline-none transition-colors duration-200 placeholder:text-slate-400 focus:border-brand-blue dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-semibold text-slate-900 dark:text-white"
            >
              Kata Sandi
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan kata sandi"
              className="w-full border-0 border-b-2 border-slate-200 bg-transparent px-0.5 py-2.5 text-base text-slate-900 outline-none transition-colors duration-200 placeholder:text-slate-400 focus:border-brand-blue dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 rounded border-slate-300 accent-brand-blue"
            />
            Ingat saya
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="space-y-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-[14px] font-semibold text-white shadow-md shadow-blue-500/30 transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </div>
        </form>
        </div>
      </main>

      <footer className="shrink-0 pb-6 text-center text-[11px] text-slate-400">
        &copy; 2026 99Guard &middot; e-Patroli Security System
      </footer>
    </div>
  )
}