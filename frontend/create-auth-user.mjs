#!/usr/bin/env node
/**
 * Cria um usuário no Supabase Auth (email/senha).
 * Usa frontend/.env para VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
 * Uso: node scripts/create-auth-user.mjs [email] [senha]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '.env');

if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const email = process.argv[2] || 'jesse@gmail.com';
const password = process.argv[3] || '123456';

if (!url || !anonKey) {
  console.error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em frontend/.env');
  process.exit(1);
}

const supabase = createClient(url, anonKey);

const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: { emailRedirectTo: undefined },
});

if (error) {
  console.error('Erro:', error.message);
  process.exit(1);
}

console.log('Usuário criado:', data.user?.email || email);
if (data.user?.identities?.length === 0) {
  console.log('(E-mail já existe; use a senha para entrar.)');
}
