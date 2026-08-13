import { QrCode, ShieldCheck, ScanLine, MapPin, Building2, Clock3 } from 'lucide-react'

interface CheckpointPosterProps {
  name: string
  qrCode: string
  site: string
  description: string | null
  lat: number | null
  lng: number | null
  qrDataUrl: string
}

export default function CheckpointPoster({
  name,
  qrCode,
  site,
  description,
  lat,
  lng,
  qrDataUrl,
}: CheckpointPosterProps) {
  const printedAt = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="poster-sheet flex w-[210mm] flex-col overflow-hidden bg-white font-sans text-slate-800">
      <div className="flex items-center justify-between bg-gradient-to-r from-brand-blue to-brand-blue-dark px-10 py-6 text-white">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-white/15">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <p className="text-xl font-extrabold tracking-tight">99Guard</p>
            <p className="text-[11px] font-medium uppercase tracking-widest text-white/70">
              e-Patroli Digital
            </p>
          </div>
        </div>
        <div className="rounded-full border border-white/30 px-5 py-2 text-sm font-bold uppercase tracking-widest">
          Titik Patroli
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-10 py-10">
        <div className="rounded-3xl border-8 border-brand-blue-light bg-white p-5 shadow-[0_12px_40px_-12px_rgba(15,98,254,0.45)]">
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt={`QR ${qrCode}`}
              className="h-[300px] w-[300px]"
            />
          )}
        </div>

        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5">
          <QrCode className="size-4 text-brand-blue" />
          <span className="font-mono text-sm font-bold tracking-wider text-slate-600">{qrCode}</span>
        </div>

        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">{name}</h1>
          {description && (
            <p className="mt-2 max-w-md text-sm text-slate-500">{description}</p>
          )}
        </div>

        <div className="grid w-full max-w-lg grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 p-3.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Building2 className="size-3.5" /> Site
            </div>
            <p className="mt-1 text-sm font-bold text-slate-800">{site}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-3.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <MapPin className="size-3.5" /> Koordinat
            </div>
            <p className="mt-1 font-mono text-sm font-bold text-slate-800">
              {lat && lng ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'Tidak tersedia'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-brand-blue-light px-6 py-3">
          <ScanLine className="size-5 text-brand-blue" />
          <p className="text-sm font-semibold text-brand-blue">
            Arahkan kamera aplikasi 99Guard ke QR ini untuk check-in titik patroli
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-10 py-4 text-[11px] text-slate-400">
        <span className="font-semibold">99Guard Security &middot; e-Patroli Digital</span>
        <span className="flex items-center gap-1.5">
          <Clock3 className="size-3.5" /> Dicetak {printedAt}
        </span>
      </div>
    </div>
  )
}
