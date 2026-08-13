import imageCompression from 'browser-image-compression'
import { supabase } from '@/lib/supabase'

const options = {
  maxSizeMB: 0.15,
  maxWidthOrHeight: 800,
  initialQuality: 0.7,
}

export async function compressImage(file: File | Blob): Promise<Blob> {
  try {
    return await imageCompression(file as File, { ...options, useWebWorker: true })
  } catch {
    try {
      return await imageCompression(file as File, { ...options, useWebWorker: false })
    } catch {
      return file
    }
  }
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
  if (error) {
    console.error('uploadPhoto', error)
    return null
  }
  return supabaseStoragePublicUrl(path)
}

export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  })
  video.srcObject = stream
  await video.play()
  return stream
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop())
}

export function captureVideoFrame(video: HTMLVideoElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    const grab = () => {
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
        setTimeout(grab, 120)
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    }
    grab()
  })
}

function supabaseStorageUpload(path: string, blob: Blob) {
  return supabase.storage.from('photos').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
  })
}

function supabaseStoragePublicUrl(path: string) {
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl
}