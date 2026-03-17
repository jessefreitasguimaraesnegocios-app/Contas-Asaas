import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY devem estar definidos no .env');
}

export const supabase = createClient(url || '', anonKey || '');

export function getEdgeFunctionUrl(name: string): string {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) return '';
  return `${url.replace(/\.supabase\.co$/, '')}.supabase.co/functions/v1/${name}`;
}
