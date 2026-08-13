import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { compressImage, getPosition, uploadPhoto, blobToBase64 } from '@/lib/photo'
import { queueIncident } from '@/lib/offline'
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

export default function IncidentForm() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState<IncidentCategory>('kebakaran')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit() {
    if (!profile) return
    setSubmitting(true)
    try {
      const blob = photo ? await compressImage(photo) : null
      const pos = await getPosition()

      if (!navigator.onLine) {
        await queueIncident({
          guard_id: profile.id,
          category,
          description: description.trim() || null,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
          photo_base64: blob ? await blobToBase64(blob) : '',
        })
        toast.success('Tersimpan offline — akan sinkron otomatis')
        navigate('/patrol', { replace: true })
        return
      }

      const { data, error } = await supabase
        .from('incidents')
        .insert({
          guard_id: profile.id,
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
        }
      }

      toast.success('Insiden berhasil dilaporkan')
      navigate('/patrol', { replace: true })
    } catch {
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
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-3 right-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow"
          >
            Ganti Foto
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white py-8 text-slate-400 transition hover:border-brand-blue/50 hover:text-brand-blue"
        >
          <Camera className="size-7" />
          <span className="text-sm font-semibold">Lampirkan Foto (opsional)</span>
        </button>
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