import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserQRCodeReader } from '@zxing/browser'
import { useAuth } from '@/context/AuthContext'
import { findCheckpointByQr, getGuardTodayRounds } from '@/lib/api'
import { compressImage, getPosition, uploadPhoto, blobToBase64 } from '@/lib/photo'
import { queuePatrolLog } from '@/lib/offline'
import { logClient } from '@/lib/debugLog'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Camera, CheckCircle2, Loader2, MapPin, QrCode, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Checkpoint } from '@/lib/types'

const DRAFT_KEY = 'scan-draft-v1'

function dataURLToFile(dataUrl: string, name: string): File {
  const mime = dataUrl.match(/^data:(.*?);/)?.[1] ?? 'image/jpeg'
  const bin = atob(dataUrl.split(',')[1])
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], name, { type: mime })
}

export default function ScanPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  const [scanning, setScanning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [photo, setPhoto] = useState<File | Blob | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.checkpoint) setCheckpoint(draft.checkpoint)
      if (draft.photo) {
        setPhoto(dataURLToFile(draft.photo, 'draft.jpg'))
        setPhotoPreview(draft.photo)
      }
    } catch {
      sessionStorage.removeItem(DRAFT_KEY)
    }
  }, [])

  async function saveDraft(cp: Checkpoint | null = checkpoint, ph: File | Blob | null = photo) {
    try {
      if (!cp) return
      let dataUrl = ''
      if (ph) {
        const blob = await compressImage(ph)
        dataUrl = await blobToBase64(blob)
      }
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ checkpoint: cp, photo: dataUrl }))
    } catch {
      // draft tidak kritis — abaikan jika gagal
    }
  }

  function clearDraft() {
    sessionStorage.removeItem(DRAFT_KEY)
  }

  const stopScan = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setScanning(false)
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    return () => stopScan()
  }, [stopScan])

  async function startScan() {
    setStarting(true)
    try {
      const reader = new BrowserQRCodeReader()
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result) => {
          if (result) {
            const code = result.getText().trim()
            stopScan()
            resolveCode(code)
          }
        },
      )
      controlsRef.current = controls
      setScanning(true)
    } catch {
      toast.error('Tidak dapat mengakses kamera. Gunakan masukan manual.')
      logClient('scan', 'startScan', 'kamera gagal dibuka')
    } finally {
      setStarting(false)
    }
  }

  async function resolveCode(code: string) {
    try {
      const cp = await findCheckpointByQr(code)
      if (!cp) {
        toast.error('QR tidak dikenal atau titik tidak aktif')
        logClient('scan', 'qr', 'tidak dikenal', { code })
        return
      }
      setCheckpoint(cp)
      logClient('scan', 'qr', 'titik ditemukan', { code, cpId: cp.id })
      saveDraft(cp)
    } catch {
      toast.error('Gagal memvalidasi QR')
      logClient('scan', 'qr', 'error validasi')
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    saveDraft(checkpoint, file)
    logClient('scan', 'photo', 'dipilih', { size: file.size })
  }

  async function handleSubmit() {
    if (!checkpoint) {
      toast.error('Pindai atau masukkan kode QR titik terlebih dahulu')
      return
    }
    if (!photo) {
      toast.error('Ambil foto lokasi terlebih dahulu')
      return
    }
    if (!profile) return
    setSubmitting(true)
    logClient('scan', 'submit', 'mulai', { cpId: checkpoint.id, photoSize: photo.size, online: navigator.onLine })
    try {
      let blob: Blob
      try {
        blob = await compressImage(photo)
      } catch (e) {
        console.error('compress', e)
        logClient('scan', 'submit', 'compress gagal', { err: String(e) })
        toast.error('Gagal memproses foto. Coba lagi.')
        return
      }
      const pos = await getPosition()

      const today = new Date().toISOString().slice(0, 10)
      const rounds = await getGuardTodayRounds(profile.id, today)
      const now = Date.now()
      const match = rounds.find((r) => {
        const [sh, sm] = r.start_time.split(':').map(Number)
        const [eh, em] = r.end_time.split(':').map(Number)
        const s = new Date().setHours(sh, sm, 0, 0)
        const e = new Date().setHours(eh, em, 0, 0)
        return now >= s && now <= e && r.round_checkpoints.some((p) => p.checkpoints.id === checkpoint.id)
      })

      if (!navigator.onLine) {
        const log = {
          guard_id: profile.id,
          checkpoint_id: checkpoint.id,
          round_id: match?.id ?? null,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
          photo_base64: await blobToBase64(blob),
        }
        await queuePatrolLog(log)
        clearDraft()
        logClient('scan', 'submit', 'antre offline')
        toast.success('Tersimpan offline — akan sinkron otomatis')
        navigate('/patrol', { replace: true })
        return
      }

      let photoUrl: string | null = null
      try {
        photoUrl = await uploadPhoto(blob, 'checkins')
      } catch (e) {
        console.error('upload', e)
        logClient('scan', 'submit', 'upload throw', { err: String(e) })
      }
      if (!photoUrl) {
        logClient('scan', 'submit', 'upload gagal/null')
        toast.error('Gagal mengunggah foto. Periksa koneksi internet.')
        return
      }

      const { error } = await supabase.from('patrol_logs').insert({
        guard_id: profile.id,
        checkpoint_id: checkpoint.id,
        round_id: match?.id ?? null,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        photo_url: photoUrl,
      })
      if (error) {
        console.error('insert', error)
        logClient('scan', 'submit', 'insert error', { err: error.message })
        toast.error(`Gagal menyimpan: ${error.message}`)
        return
      }
      logClient('scan', 'submit', 'berhasil', { photoUrl })
      toast.success('Check-in berhasil')
      clearDraft()
      navigate('/patrol', { replace: true })
    } catch (e) {
      console.error('checkin', e)
      logClient('scan', 'submit', 'error umum', { err: String(e) })
      toast.error('Gagal menyimpan. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Scan Titik Patroli</h1>
        {checkpoint && (
          <button
            onClick={() => {
              clearDraft()
              setCheckpoint(null)
              setPhoto(null)
              setPhotoPreview(null)
            }}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200"
          >
            <X className="size-3.5" /> Batal
          </button>
        )}
      </div>

      {!checkpoint ? (
        <>
          <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-slate-900">
            <video ref={videoRef} className={scanning ? 'h-full w-full object-cover' : 'hidden'} />
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                <QrCode className="size-10" />
                <p className="px-6 text-center text-sm">
                  Arahkan kamera ke QR code di titik patroli
                </p>
              </div>
            )}
            {scanning && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="size-52 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
              </div>
            )}
          </div>

          {scanning ? (
            <Button onClick={stopScan} variant="outline" className="h-12 w-full rounded-full">
              Hentikan Scan
            </Button>
          ) : (
            <Button
              onClick={startScan}
              disabled={starting}
              className="h-12 w-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark font-semibold text-white"
            >
              {starting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              {starting ? 'Menyiapkan kamera...' : 'Mulai Scan Kamera'}
            </Button>
          )}

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">atau</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="flex gap-2">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Kode QR manual (mis. CP-0001)"
              className="h-12 flex-1 rounded-full border border-slate-200 bg-white px-4 text-sm outline-none focus:border-brand-blue"
            />
            <Button
              onClick={() => manualCode.trim() && resolveCode(manualCode.trim())}
              className="h-12 rounded-full bg-brand-blue text-white"
            >
              Cari
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-3xl bg-gradient-to-br from-brand-blue to-brand-blue-dark p-5 text-white">
            <p className="text-xs font-medium text-blue-100">Titik Patroli</p>
            <h2 className="mt-1 text-lg font-bold">{checkpoint.name}</h2>
            <p className="mt-1 text-sm text-blue-100">
              {checkpoint.description || 'Titik patroli'}
            </p>
            <span className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              {checkpoint.qr_code}
            </span>
          </div>

          {photoPreview ? (
            <div className="relative overflow-hidden rounded-3xl">
              <img src={photoPreview} alt="Bukti lokasi" className="aspect-square w-full object-cover" />
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-3 right-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow"
              >
                Ambil Ulang
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-brand-blue/40 bg-brand-blue-light/50 text-brand-blue transition hover:bg-brand-blue-light"
              >
                <Camera className="size-8" />
                <span className="text-sm font-semibold">Foto Lokasi (wajib)</span>
                <span className="text-xs">Pastikan area sekitar titik terekam</span>
              </button>
              <p className="text-center text-xs text-slate-400">
                Setelah foto diambil, tekan <b>Simpan Check-in</b> di bawah
              </p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhoto}
          />

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-12 w-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {submitting ? 'Menyimpan...' : 'Simpan Check-in'}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <MapPin className="size-3.5" />
            Lokasi GPS akan dicatat otomatis
          </p>
        </div>
      )}
    </div>
  )
}