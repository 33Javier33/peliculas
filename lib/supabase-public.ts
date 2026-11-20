import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Proyecto Supabase de socios-comicion-propina. La clave anónima es pública (va en el JS):
// solo puede tocar las tablas de películas y los canales Realtime de nombre secreto.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://teemahksasdougehrcly.supabase.co'
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlZW1haGtzYXNkb3VnZWhyY2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTkwNjIsImV4cCI6MjA5Njg3NTA2Mn0.EIQ7gRcwf3zYgvGESKw3s5lnZMABN_EuNWsrJK3L1zk'

let client: SupabaseClient | null = null
export const supabasePublic = () => (client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }))
