import { createClient } from "@supabase/supabase-js"
import { getAuthEnv } from "../env"

export function createStatelessClient() {
  const env = getAuthEnv()
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  )
}
