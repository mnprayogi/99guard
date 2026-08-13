import imageCompression from 'browser-image-compression'
import { supabase } from '@/lib/supabase'

const options = {
  maxSizeMB: 0.15,
  maxWidthOrHeight: 800,
  useWebWorker: true,
  initialQuality: 0.7,
}

export async function compressImage(file: File | Blob): Promise<Blob> {
  return imageCompression(file as File, options)
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function getPosition(): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return null
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }),
    )
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch {
    return null
  }
}

export async function uploadPhoto(
  blob: Blob,
  folder: 'checkins' | 'incidents',
): Promise<string | null> {
  const ext = blob.type === 'image/png' ? 'png' : 'jpg'
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabaseStorageUpload(path, blob)
  if (error) return null
  return supabaseStoragePublicUrl(path)
}

function supabaseStorageUpload(path: string, blob: Blob) {
  return supabase.storage.from('photos').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
  })
}

function supabaseStoragePublicUrl(path: string) {
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl
}