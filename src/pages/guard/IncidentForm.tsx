import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { compressImage, getPosition, uploadPhoto, blobToBase64, openCamera, stopCamera, captureVideoFrame } from '@/lib/photo'
import { queueIncident } from '@/lib/offline'
import { logClient } from '@/lib/debugLog'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Camera, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { IncidentCategory } from '@/lib/types'

const categories: { value: IncidentCategory; label: string; emoji: string }[] = [
  { value: 'kebakaran', label: 'Kebakaran', emoji: '🔥' },
  { value: 'pencurian', label: 'Pencurian', emoji: '🕵️' },
  { value: 'vandalisme', label: 'Vandalisme', emoji: '🧱' },
  { value: 'kesehatan', label: 'Kesehatan', emoji: '🚑' },
  { value: 'lainnya', label: 'Lainnya', emoji: '📋' },
]

const DRAFT_KEY = 'incident-draft-v1'

function dataURLToFile(dataUrl: string, name: string): File {
  const mime = dataUrl.match(/^data:(.*?);/)?.[1] ?? 'image/jpeg'
  const bin = atob(dataUrl.split(',')[1])
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], name, { type: mime })
}

export default function IncidentForm() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const videoPhotoRef = useRef<HTMLVideoElement>(null)
  const photoStreamRef = useRef<MediaStream | null>(null)
  const [category, setCategory] = useState<IncidentCategory>('kebakaran')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<File | Blob | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    return () => stopCamera(photoStreamRef.current)
  }, [])

  async function startPhotoCamera() {
    setCapturing(true)
    try {
      const stream = await openCamera(videoPhotoRef.current!)
      photoStreamRef.current = stream
      setCameraOn(true)
      logClient('incident', 'photo', 'kamera dibuka')
    } catch (e) {
      logClient('incident', 'photo', 'getUserMedia gagal — buka kamera sistem', { err: String(e) })
      fileRef.current?.click()
    } finally {
      setCapturing(false)
    }
  }

  function stopPhotoCamera() {
    stopCamera(photoStreamRef.current)
    photoStreamRef.current = null
    setCameraOn(false)
    if (videoPhotoRef.current) videoPhotoRef.current.srcObject = null
  }

  async function capturePhoto() {
    const video = videoPhotoRef.current
    if (!video || !photoStreamRef.current) return
    setCapturing(true)
    try {
      const blob = await captureVideoFrame(video)
      if (!blob) throw new Error('frame kosong')
      setPhoto(blob)
      setPhotoPreview(URL.createObjectURL(blob))
      stopPhotoCamera()
      logClient('incident', 'photo', 'dipilih (kamera)', { size: blob.size })
    } catch (e) {
      console.error('capture', e)
      logClient('incident', 'photo', 'capture gagal', { err: String(e) })
      toast.error('Gagal mengambil foto. Coba lagi.')
    } finally {
      setCapturing(false)
    }
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.category) setCategory(draft.category)
      if (draft.description) setDescription(draft.description)
      if (draft.photo) {
        setPhoto(dataURLToFile(draft.photo, 'draft.jpg'))
        setPhotoPreview(draft.photo)
      }
    } catch {
      sessionStorage.removeItem(DRAFT_KEY)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        let dataUrl = ''
        if (photo) {
          const blob = await compressImage(photo)
          dataUrl = await blobToBase64(blob)
        }
        sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ category, description: description.trim(), photo: dataUrl }),
        )
      } catch {
        // draft tidak kritis
      }
    }, 300)
    return () => clearTimeout(t)
  }, [category, description, photo])

  function clearDraft() {
    sessionStorage.removeItem(DRAFT_KEY)
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    logClient('incident', 'photo', 'dipilih (galeri)', { size: file.size })
  }

  async function handleSubmit() {
    if (!profile) return
    setSubmitting(true)
    logClient('incident', 'submit', 'mulai', { category, photoSize: photo?.size ?? 0, online: navigator.onLine })
    try {
      const blob = photo ? await compressImage(photo) : null
      const pos = await getPosition()

      if (!navigator.onLine) {
        await queueIncident({
          guard_id: profile.id,
          site_id: profile.site_id,
          category,
          description: description.trim() || null,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
          photo_base64: blob ? await blobToBase64(blob) : '',
        })
        clearDraft()
        toast.success('Tersimpan offline — akan sinkron otomatis')
        navigate('/patrol', { replace: true })
        return
      }

      const { data, error } = await supabase
        .from('incidents')
        .insert({
          guard_id: profile.id,
          site_id: profile.site_id,
          category,
          description: description.trim() || null,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
        })
        .select('id')
        .single()
      if (error) throw error

      if (blob) {
        const photoUrl = await uploadPhoto(blob, 'incidents')
        if (photoUrl) {
          await supabase.from('incident_photos').insert({ incident_id: data.id, photo_url: photoUrl })
        } else {
          console.error('upload foto insiden gagal')
          logClient('incident', 'submit', 'upload foto gagal', { incidentId: data.id })
          toast.error('Insiden tersimpan, tapi foto gagal diunggah')
          clearDraft()
          navigate('/patrol', { replace: true })
          return
        }
      }

      clearDraft()
      logClient('incident', 'submit', 'berhasil')
      toast.success('Insiden berhasil dilaporkan')
      navigate('/patrol', { replace: true })
    } catch (e) {
      console.error('incident', e)
      logClient('incident', 'submit', 'error', { err: String(e) })
      toast.error('Gagal melaporkan. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">Lapor Insiden</h1>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Kategori</p>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-xs font-semibold transition',
                category === c.value
                  ? 'border-brand-blue bg-brand-blue-light text-brand-blue'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              <span className="text-xl">{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Deskripsi Kejadian</p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Jelaskan kejadian secara singkat..."
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-blue"
        />
      </div>

      {photoPreview ? (
        <div className="relative overflow-hidden rounded-2xl">
          <img src={photoPreview} alt="Foto insiden" className="aspect-video w-full object-cover" />
          <button
            onClick={() => {
              setPhoto(null)
              setPhotoPreview(null)
              startPhotoCamera()
            }}
            className="absolute bottom-3 right-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow"
          >
            Ganti Foto
          </button>
        </div>
      ) : (
        <>
          <div className={cn('fixed inset-0 z-50 flex flex-col bg-black', cameraOn ? '' : 'hidden')}>
            <video ref={videoPhotoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 p-6 pb-8">
              <button
                onClick={stopPhotoCamera}
                className="rounded-full bg-white/20 px-6 py-4 text-sm font-semibold text-white"
              >
                Batal
              </button>
              <button
                onClick={capturePhoto}
                disabled={capturing}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-4 text-base font-bold text-brand-blue disabled:opacity-60"
              >
                {capturing ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
                {capturing ? 'Mengambil...' : 'Ambil Foto'}
              </button>
            </div>
          </div>
          <button
            onClick={startPhotoCamera}
            disabled={capturing}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-400/70 bg-white py-8 text-slate-500 transition hover:border-brand-blue/50 hover:text-brand-blue disabled:opacity-60',
              cameraOn ? 'hidden' : '',
            )}
          >
            {capturing ? <Loader2 className="size-7 animate-spin" /> : <Camera className="size-7" />}
            <span className="text-sm font-semibold">Ambil Foto (opsional)</span>
            <span className="text-xs">Diambil langsung dari kamera saat ini juga</span>
          </button>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhoto}
      />

      <Button
        onClick={handleSubmit}
        disabled={submitting}
        className="h-12 w-full rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {submitting ? 'Mengirim...' : 'Kirim Laporan'}
      </Button>
    </div>
  )
}