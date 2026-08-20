import { QrCode, ScanLine, Building2, Clock3, ChevronsRight, ChevronsLeft } from 'lucide-react'
import ConnectedDots from '@/components/ConnectedDots'

interface CheckpointPosterProps {
  name: string
  qrCode: string
  site: string
  description: string | null
  qrDataUrl: string
}

export default function CheckpointPoster({
  name,
  qrCode,
  site,
  description,
  qrDataUrl,
}: CheckpointPosterProps) {
  const printedAt = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="poster-sheet relative flex w-[210mm] flex-col overflow-hidden bg-white font-sans text-slate-800">
      <ConnectedDots
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        color="rgba(15,98,254,0.14)"
        linkColor="rgba(15,98,254,0.09)"
        density={0.00009}
        speed={0}
      />
      <div className="relative z-10 rounded-b-[26px] bg-gradient-to-r from-brand-blue to-brand-blue-dark px-10 py-6 text-white shadow-lg shadow-blue-900/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-extrabold tracking-tight">99Guard</p>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
              e-Patroli Digital
            </p>
          </div>
          <div className="rounded-full border border-white/40 bg-white/10 px-5 py-2 text-base font-bold uppercase tracking-widest">
            Titik Patroli
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center gap-5 px-14 py-8">
        <img
          src="/logo.png"
          alt="99Guard"
          className="size-28 rounded-full"
        />

        <div className="text-center">
          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900">{name}</h1>
          {description && (
            <p className="mx-auto mt-2 max-w-lg text-base leading-relaxed text-slate-500">
              {description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-full bg-brand-blue px-7 py-2.5 text-white">
          <ScanLine className="size-5" />
          <span className="text-base font-extrabold uppercase tracking-widest">Scan Disini</span>
        </div>

        <div className="flex items-center gap-4">
          <ChevronsRight className="size-16 text-brand-blue" />
          <div className="rounded-[28px] bg-white p-5 shadow-[0_16px_48px_-16px_rgba(15,98,254,0.45)] ring-1 ring-slate-200">
            {qrDataUrl && (
              <img src={qrDataUrl} alt={`QR ${qrCode}`} className="h-[280px] w-[280px]" />
            )}
          </div>
          <ChevronsLeft className="size-16 text-brand-blue" />
        </div>

        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-5 py-2">
          <QrCode className="size-5 text-brand-blue" />
          <span className="font-mono text-base font-bold tracking-wider text-slate-600">
            {qrCode}
          </span>
        </div>

        <div className="flex w-full max-w-md items-center justify-center gap-3 rounded-2xl bg-slate-50 px-6 py-4">
          <Building2 className="size-5 shrink-0 text-brand-blue" />
          <div className="min-w-0 text-center">
            <p className="text-lg font-bold uppercase tracking-widest text-slate-400">Site</p>
            <p className="truncate text-base font-bold text-slate-800">{site}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-full bg-brand-blue-light px-6 py-3">
          <ScanLine className="size-5 text-brand-blue" />
          <p className="text-[15px] font-semibold text-brand-blue">
            Arahkan kamera aplikasi 99Guard ke QR ini untuk check-in
          </p>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between gap-4 bg-brand-blue-light/60 px-10 py-4 text-xs text-slate-500">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="99Guard" className="size-8 rounded-full object-cover" />
          <span className="font-semibold text-slate-700">99Guard Security</span>
        </div>
        <span className="hidden text-slate-400 sm:block">Sistem e-Patroli Satpam Digital</span>
        <span className="flex items-center gap-1.5">
          <Clock3 className="size-3.5" /> Dicetak {printedAt}
        </span>
      </div>
    </div>
  )
}