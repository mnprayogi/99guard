import { supabase } from '@/lib/supabase'

export async function logClient(page: string, step: string, message?: string, meta?: unknown) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('client_logs').insert({
      user_id: user.id,
      page,
      step,
      message: message ?? '',
      meta: meta ?? null,
    })
    if (error) {
      await supabase.functions.invoke('log-client', {
        body: { page, step, message: message ?? '', meta: { uid: user.id, ...(meta as Record<string, unknown> | undefined) } },
      })
    }
  } catch {
    // observability — jangan ganggu alur utama
  }
}