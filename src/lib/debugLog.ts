import { supabase } from '@/lib/supabase'

export async function logClient(page: string, step: string, message?: string, meta?: unknown) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    await supabase.functions.invoke('log-client', {
      body: {
        page,
        step,
        message: message ?? '',
        meta: { uid: user?.id ?? null, ...(meta as Record<string, unknown> | undefined) },
      },
    })
  } catch {
    // observability — jangan ganggu alur utama
  }
}