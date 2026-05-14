import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import {
  maskCpfCnpj,
  maskPhone,
  maskMobile,
  maskCep,
  maskDateBr,
  generateCpfMasked,
  generateCnpjMasked,
  fetchByCep,
  onlyDigits,
  brDateToIso,
} from './lib/masks';

type App = { id: string; code: string; name: string };

/** Item retornado pelo GET /v3/accounts do Asaas (listagem). */
type AsaasAccountRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  cpfCnpj?: string | null;
  walletId?: string | null;
  loginEmail?: string | null;
  personType?: string | null;
  companyType?: string | null;
};

type Subaccount = {
  id: string;
  app_id: string;
  environment: string;
  asaas_subaccount_id: string;
  asaas_wallet_id: string | null;
  api_key: string;
  email: string;
  name: string | null;
  cpf_cnpj: string | null;
  status: string | null;
  created_at: string;
  apps?: { code: string; name: string } | null;
};

type Tab = 'list' | 'asaas' | 'create' | 'apps';

type TabItemDef = { id: Tab; label: string; blurb: string };

const TAB_ITEMS: TabItemDef[] = [
  { id: 'list', label: 'Dashboard', blurb: 'Métricas e subcontas' },
  { id: 'create', label: 'Nova Subconta', blurb: 'Cadastro no Asaas' },
  { id: 'asaas', label: 'Asaas (todas)', blurb: 'Lista via API' },
  { id: 'apps', label: 'Apps', blurb: 'Plataformas' },
];

function SidebarNavIcon({ id, className }: { id: Tab; className: string }) {
  const c = `h-[1.125rem] w-[1.125rem] shrink-0 transition-colors ${className}`;
  switch (id) {
    case 'list':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
        </svg>
      );
    case 'create':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      );
    case 'asaas':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c1.036 0 1.875.84 1.875 1.875V17.25m-9-1.875h.008v.008H12V15.375z" />
        </svg>
      );
    case 'apps':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V6.75zM6.75 4.5h10.5A2.25 2.25 0 0119.5 6.75v10.5a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25V6.75A2.25 2.25 0 016.75 4.5z" />
        </svg>
      );
    default:
      return null;
  }
}

function DashboardStatCard({
  label,
  value,
  gradientClass,
  icon,
}: {
  label: string;
  value: ReactNode;
  gradientClass: string;
  icon: ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-200/50 transition duration-300 hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-lg hover:shadow-brand-500/10">
      <div
        className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br opacity-[0.07] transition-opacity group-hover:opacity-[0.12] ${gradientClass}`}
        aria-hidden
      />
      <div className="relative flex items-start gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${gradientClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  /** Evita recarregar o dashboard no mesmo momento do bootstrap (corrida de requests). */
  const prevTabRef = useRef<Tab | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('list');
  const [apps, setApps] = useState<App[]>([]);
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
  const [asaasLoading, setAsaasLoading] = useState(false);
  const [asaasEnvironment, setAsaasEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [asaasOffset, setAsaasOffset] = useState(0);
  const [asaasHasMore, setAsaasHasMore] = useState(false);
  const [asaasSubaccounts, setAsaasSubaccounts] = useState<AsaasAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [signUpMode, setSignUpMode] = useState(false);

  const [form, setForm] = useState({
    app_id: '',
    environment: 'sandbox',
    name: '',
    email: '',
    loginEmail: '',
    cpfCnpj: '',
    birthDate: '',
    companyType: 'MEI',
    phone: '',
    mobilePhone: '',
    address: '',
    addressNumber: '',
    complement: '',
    province: '',
    postalCode: '',
    incomeValue: 25000,
  });

  /** Token explícito evita corrida em que o fetch interno usa a anon key como Bearer (401 no gateway). */
  async function edgeFunctionHeaders(): Promise<Record<string, string>> {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s?.access_token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    return {
      Authorization: `Bearer ${s.access_token}`,
      'x-client-info': 'plataforma-subcontas',
    };
  }

  async function loadSubaccounts(appSource?: App[]) {
    const { data, error } = await supabase
      .from('asaas_subaccounts')
      .select(
        'id, app_id, environment, asaas_subaccount_id, asaas_wallet_id, api_key, email, name, cpf_cnpj, status, created_at, apps(code, name)'
      )
      .order('created_at', { ascending: false });
    if (!error) {
      setSubaccounts(((data ?? []) as unknown) as Subaccount[]);
      return;
    }

    // Fallback: if relational select fails, load base fields anyway.
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('asaas_subaccounts')
      .select('id, app_id, environment, asaas_subaccount_id, asaas_wallet_id, api_key, email, name, cpf_cnpj, status, created_at')
      .order('created_at', { ascending: false });

    if (fallbackError) {
      setSubaccounts([]);
      setMessage({
        type: 'err',
        text: `Erro ao carregar subcontas: ${fallbackError.message || error.message}`,
      });
      return;
    }

    // If relation was unavailable, map app_id to local app list.
    const appMap = new Map((appSource ?? apps).map((item) => [item.id, item]));
    const normalized = ((fallbackData ?? []) as unknown as Subaccount[]).map((item) => ({
      ...item,
      apps: appMap.get(item.app_id) ?? null,
    }));
    setSubaccounts(normalized);
    setMessage({
      type: 'err',
      text: 'Subcontas carregadas sem relacionamento de apps. Verifique policies/foreign key.',
    });
  }

  async function loadAsaasSubaccounts(opts?: { reset?: boolean; environment?: 'sandbox' | 'production' }) {
    const reset = opts?.reset ?? false;
    const env = opts?.environment ?? asaasEnvironment;
    const nextOffset = reset ? 0 : asaasOffset;
    setAsaasLoading(true);
    try {
      const headers = await edgeFunctionHeaders();
      const { data, error } = await supabase.functions.invoke('list-asaas-subaccounts', {
        body: { environment: env, offset: nextOffset, limit: 50 },
        headers,
      });
      if (error) throw error;
      const result = (data as any)?.result;
      const list = (Array.isArray(result?.data) ? result.data : []) as AsaasAccountRow[];
      const hasMore = Boolean(result?.hasMore);
      setAsaasHasMore(hasMore);
      setAsaasOffset(nextOffset + (result?.limit ?? list.length ?? 0));
      setAsaasSubaccounts((prev) => (reset ? list : [...prev, ...list]));
    } catch (err) {
      const anyErr = err as any;
      const baseMsg = err instanceof Error ? err.message : 'Erro ao listar subcontas do Asaas.';
      const status = anyErr?.status ? ` (status ${anyErr.status})` : '';
      const ctx = anyErr?.context;
      const ctxBody =
        ctx?.body && typeof ctx.body === 'string'
          ? ctx.body
          : ctx?.body
            ? JSON.stringify(ctx.body)
            : '';
      const details = ctxBody ? `\n\nDetalhes: ${ctxBody}` : '';
      setMessage({ type: 'err', text: `${baseMsg}${status}${details}` });
    } finally {
      setAsaasLoading(false);
    }
  }

  function goTab(next: Tab) {
    setTab(next);
    if (next === 'asaas') {
      setAsaasSubaccounts([]);
      setAsaasOffset(0);
      void loadAsaasSubaccounts({ reset: true, environment: asaasEnvironment });
    }
  }

  /** Garante MANICURE / Sistema de Manicure em `public.apps` (idempotente; cobre DB sem migration aplicada). */
  async function ensureManicureAppInDb(currentList: App[]): Promise<App[]> {
    if (currentList.some((a) => a.code === 'MANICURE')) return currentList;
    const { error: insErr } = await supabase.from('apps').insert({ code: 'MANICURE', name: 'Sistema de Manicure' });
    if (insErr && insErr.code !== '23505') {
      console.warn('[apps] insert MANICURE:', insErr.message);
    }
    const { data: refreshed, error: refErr } = await supabase.from('apps').select('id, code, name').order('code');
    if (refErr || !refreshed?.length) return currentList;
    return refreshed as App[];
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setLoading(false);
      prevTabRef.current = null;
      return;
    }
    (async () => {
      setLoading(true);
      setMessage(null);
      const { data: appsData, error: appsError } = await supabase.from('apps').select('id, code, name').order('code');
      if (appsError) {
        setMessage({ type: 'err', text: `Erro ao carregar apps: ${appsError.message}` });
      }
      let appsList = (appsData as App[]) || [];
      appsList = await ensureManicureAppInDb(appsList);
      setApps(appsList);
      await loadSubaccounts(appsList);
      setLoading(false);
    })();
  }, [session]);

  // Recarrega o dashboard só ao voltar para a aba a partir de outra (evita corrida com o bootstrap).
  useEffect(() => {
    if (!session) return;
    if (tab !== 'list') {
      prevTabRef.current = tab;
      return;
    }
    if (prevTabRef.current != null && prevTabRef.current !== 'list') {
      setMessage(null);
      void loadSubaccounts(apps);
    }
    prevTabRef.current = tab;
  }, [tab, session, apps]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.app_id) {
      setMessage({ type: 'err', text: 'Selecione um app.' });
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      const body = {
        app_id: form.app_id,
        environment: form.environment,
        name: form.name,
        email: form.email,
        loginEmail: form.loginEmail || form.email,
        cpfCnpj: form.cpfCnpj,
        birthDate: brDateToIso(form.birthDate) ?? form.birthDate,
        companyType: form.companyType,
        phone: form.phone ? onlyDigits(form.phone) || null : null,
        mobilePhone: form.mobilePhone ? onlyDigits(form.mobilePhone) || null : null,
        address: form.address,
        addressNumber: form.addressNumber,
        complement: form.complement || null,
        province: form.province,
        postalCode: form.postalCode,
        incomeValue: form.incomeValue,
      };

      const fnHeaders = await edgeFunctionHeaders();
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-subaccount', {
        body,
        headers: fnHeaders,
      });

      if (fnError) {
        const statusHint = (fnError as any)?.status ? ` (status ${(fnError as any).status})` : '';
        const msg = fnError.message || `Erro ao criar subconta${statusHint}`;
        if (msg.includes('403')) {
          throw new Error(
            msg ||
              '403: chave do projeto não aceita. No Vercel, confira VITE_SUPABASE_ANON_KEY (anon public), depois faça Redeploy com "Clear build cache".'
          );
        }
        throw new Error(msg);
      }

      const data = fnData as any;
      if (data?.error) throw new Error(data.error || data.details?.description || 'Erro ao criar subconta');
      setMessage({ type: 'ok', text: 'Subconta criada e salva com sucesso.' });
      setForm({ ...form, name: '', email: '', loginEmail: '', cpfCnpj: '', birthDate: '' });
      await loadSubaccounts(apps);
      setTab('list');
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao criar.' });
    } finally {
      setCreating(false);
    }
  }

  function maskKey(key: string) {
    if (!key || key.length < 12) return '••••••••';
    return key.slice(0, 12) + '…' + key.slice(-6);
  }

  async function handleDeleteSubaccount(id: string, label?: string) {
    const ok = confirm(
      `Confirma a exclusao desta subconta${label ? ` (${label})` : ''}?\n\n- Primeiro tenta excluir na Asaas (quando permitido)\n- Depois remove o registro do Supabase\n\nIsso pode ser irreversivel na Asaas.`
    );
    if (!ok) return;

    setMessage(null);
    try {
      const delHeaders = await edgeFunctionHeaders();
      const { error } = await supabase.functions.invoke('delete-subaccount', {
        body: { id, mode: 'asaas_and_db', removeReason: 'Liberar dados' },
        headers: delHeaders,
      });
      if (error) {
        const fallback = confirm(
          `Falhou excluir na Asaas.\n\n${error.message}\n\nQuer remover SOMENTE do Supabase (db_only)?`
        );
        if (!fallback) throw error;
        const dbHeaders = await edgeFunctionHeaders();
        const { error: dbOnlyErr } = await supabase.functions.invoke('delete-subaccount', {
          body: { id, mode: 'db_only' },
          headers: dbHeaders,
        });
        if (dbOnlyErr) throw dbOnlyErr;
      }
      setMessage({ type: 'ok', text: 'Subconta excluída.' });
      await loadSubaccounts(apps);
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao excluir.' });
    }
  }

  async function handleCepBlur() {
    const digits = onlyDigits(form.postalCode);
    if (digits.length !== 8) return;
    setLoadingCep(true);
    try {
      const data = await fetchByCep(form.postalCode);
      if (data) {
        setForm((f) => ({
          ...f,
          address: data.logradouro || f.address,
          province: data.bairro || f.province,
        }));
      }
    } finally {
      setLoadingCep(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setMessage({ type: 'ok', text: 'Copiado!' });
    setTimeout(() => setMessage(null), 1500);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setMessage({ type: 'err', text: 'E-mail e senha são obrigatórios.' });
      return;
    }
    setLoginLoading(true);
    setMessage(null);
    try {
      if (signUpMode) {
        const { error } = await supabase.auth.signUp({ email: loginEmail.trim(), password: loginPassword });
        if (error) throw error;
        setMessage({ type: 'ok', text: 'Conta criada. Confirme o e-mail se necessário, ou faça login.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
        if (error) throw error;
      }
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao entrar.' });
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const metrics = useMemo(() => {
    return {
      total: subaccounts.length,
      appsAtivos: new Set(subaccounts.map((s) => s.app_id)).size,
      sandbox: subaccounts.filter((s) => s.environment === 'sandbox').length,
      production: subaccounts.filter((s) => s.environment === 'production').length,
    };
  }, [subaccounts]);

  /** A listagem do Asaas não devolve apiKey; cruzamos com o que foi salvo no Supabase ao criar pelo painel. */
  const subaccountSecretsByAsaasId = useMemo(() => {
    const m = new Map<string, { api_key: string; wallet_id: string | null }>();
    for (const s of subaccounts) {
      if (s.environment !== asaasEnvironment) continue;
      m.set(s.asaas_subaccount_id, { api_key: s.api_key, wallet_id: s.asaas_wallet_id });
    }
    return m;
  }, [subaccounts, asaasEnvironment]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#0b1020] via-slate-950 to-slate-950 text-slate-300">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" aria-hidden />
        <p className="text-sm font-medium tracking-wide text-slate-400">Carregando…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-brand-900 p-4 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/95 p-8 shadow-2xl">
          <h1 className="text-2xl font-semibold text-slate-900">Plataforma Subcontas</h1>
          <p className="mt-1 text-sm text-slate-600">Entre para criar e gerenciar subcontas.</p>
          {message && (
            <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${message.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {message.text}
            </div>
          )}
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input type="email" className="input" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <label className="label">Senha</label>
              <input type="password" className="input" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} autoComplete={signUpMode ? 'new-password' : 'current-password'} />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loginLoading}>
              {loginLoading ? 'Aguarde...' : signUpMode ? 'Criar conta' : 'Entrar'}
            </button>
            <button type="button" className="text-sm text-brand-700 hover:underline" onClick={() => { setSignUpMode(!signUpMode); setMessage(null); }}>
              {signUpMode ? 'Já tenho conta, entrar' : 'Criar conta'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-brand-50/40">
      <div className="mx-auto flex max-w-[1440px]">
        <aside className="relative hidden min-h-screen w-[280px] shrink-0 lg:block">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_0%_-10%,rgba(56,189,248,0.22),transparent_50%)]"
            aria-hidden
          />
          <div className="relative flex min-h-screen flex-col border-r border-white/[0.07] bg-gradient-to-b from-[#0b1020] via-slate-950 to-[#060a12] px-4 py-8 text-slate-200 shadow-[4px_0_24px_-8px_rgba(0,0,0,0.45)]">
            <div className="mb-10 flex items-center gap-3.5 px-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-brand-500 to-brand-700 text-lg font-bold tracking-tight text-white shadow-lg shadow-brand-950/50 ring-1 ring-white/20">
                A
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-300/90">Painel</p>
                <p className="truncate font-semibold tracking-tight text-white text-lg leading-tight">Subcontas</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">Asaas · multi-app</p>
              </div>
            </div>
            <nav className="flex flex-1 flex-col gap-1.5" aria-label="Navegação principal">
              {TAB_ITEMS.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goTab(item.id)}
                    className={[
                      'group relative w-full overflow-hidden rounded-2xl px-3 py-3 text-left outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-brand-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
                      active
                        ? 'bg-gradient-to-r from-brand-600 via-brand-500 to-sky-500 text-white shadow-lg shadow-brand-950/40 ring-1 ring-white/15'
                        : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100 hover:shadow-md hover:shadow-black/20',
                    ].join(' ')}
                  >
                    {active ? (
                      <span
                        className="pointer-events-none absolute inset-y-3 left-0 w-0.5 rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,0.75)]"
                        aria-hidden
                      />
                    ) : null}
                    <span className="relative flex items-start gap-3.5 pl-1">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] group-hover:bg-white/[0.08]">
                        <SidebarNavIcon
                          id={item.id}
                          className={active ? 'text-white' : 'text-slate-500 group-hover:text-brand-300'}
                        />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                        <span className="text-sm font-semibold leading-tight tracking-tight">{item.label}</span>
                        <span className={active ? 'text-xs text-white/70' : 'text-xs text-slate-500 group-hover:text-slate-400'}>
                          {item.blurb}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className="mt-auto border-t border-white/[0.06] pt-6">
              <p className="px-2 text-[11px] leading-relaxed text-slate-500">Sandbox e produção · gestão centralizada</p>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/85 px-4 py-4 shadow-sm shadow-slate-200/50 backdrop-blur-md md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Bem-vindo, Admin</h1>
                <p className="mt-1 text-sm text-slate-500">Gerencie subcontas, apps e integração Asaas.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="hidden max-w-[200px] truncate rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2 text-xs text-slate-600 md:inline">
                  {session.user?.email}
                </span>
                <button type="button" className="btn-secondary shadow-sm" onClick={() => goTab('create')}>
                  Nova Subconta
                </button>
                <button type="button" className="btn-primary shadow-md shadow-brand-600/20" onClick={handleLogout}>
                  Sair
                </button>
              </div>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 pt-0.5 lg:hidden [-webkit-overflow-scrolling:touch]">
              {TAB_ITEMS.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goTab(item.id)}
                    className={[
                      'group inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold tracking-tight shadow-sm transition-all duration-300',
                      active
                        ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-600/25 ring-1 ring-white/20'
                        : 'border border-slate-200/90 bg-white/95 text-slate-600 hover:border-brand-200 hover:bg-brand-50/50 hover:text-brand-800',
                    ].join(' ')}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.04] ring-1 ring-black/[0.06]">
                      <SidebarNavIcon
                        id={item.id}
                        className={active ? 'text-white' : 'text-slate-500 group-hover:text-brand-600'}
                      />
                    </span>
                    <span className="max-w-[9.5rem] truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </header>

          <main className="relative mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-5 md:px-6 md:py-8 lg:px-8">
            {message && (
              <div
                className={`mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm shadow-sm ${
                  message.type === 'ok'
                    ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-900'
                    : 'border-red-200/80 bg-red-50/90 text-red-900'
                }`}
              >
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/80 text-xs font-bold shadow-sm">
                  {message.type === 'ok' ? '✓' : '!'}
                </span>
                <span className="min-w-0 leading-relaxed">{message.text}</span>
              </div>
            )}

            {tab === 'list' && (
              <div className="space-y-8">
                <header className="flex flex-col gap-1 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Dashboard</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Visão geral</h1>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                      Indicadores do cadastro e acesso rápido às subcontas vinculadas aos seus apps.
                    </p>
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/80 px-4 py-2.5 text-right shadow-sm backdrop-blur-sm sm:mt-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Registros</p>
                    <p className="text-lg font-bold tabular-nums text-slate-900">{metrics.total}</p>
                  </div>
                </header>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <DashboardStatCard
                    label="Subcontas totais"
                    value={metrics.total}
                    gradientClass="from-slate-600 to-slate-800"
                    icon={
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                      </svg>
                    }
                  />
                  <DashboardStatCard
                    label="Apps ativos"
                    value={metrics.appsAtivos}
                    gradientClass="from-sky-500 to-brand-600"
                    icon={
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V6.75zM6.75 4.5h10.5A2.25 2.25 0 0119.5 6.75v10.5a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25V6.75A2.25 2.25 0 016.75 4.5z" />
                      </svg>
                    }
                  />
                  <DashboardStatCard
                    label="Sandbox"
                    value={metrics.sandbox}
                    gradientClass="from-violet-500 to-purple-600"
                    icon={
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a2.25 2.25 0 002.25 2.25H21a.75.75 0 00.75-.75v-4.5m-15 3.75h15m-16.5-3.75V6.75a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6.75v4.5M3.75 21h16.5a1.5 1.5 0 001.5-1.5v-3a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v3a1.5 1.5 0 001.5 1.5z" />
                      </svg>
                    }
                  />
                  <DashboardStatCard
                    label="Produção"
                    value={metrics.production}
                    gradientClass="from-amber-500 to-orange-600"
                    icon={
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                      </svg>
                    }
                  />
                </section>

                <section className="relative overflow-hidden rounded-2xl border border-slate-200/40 bg-white shadow-[0_22px_60px_-16px_rgba(15,23,42,0.12),0_0_0_1px_rgba(255,255,255,0.6)_inset]">
                  <div
                    className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-gradient-to-br from-brand-400/20 via-sky-300/10 to-transparent blur-2xl"
                    aria-hidden
                  />
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" aria-hidden />

                  <div className="relative border-b border-slate-200/50 bg-gradient-to-br from-slate-50/95 via-white to-slate-100/40 px-6 py-6 sm:px-8 sm:py-7">
                    <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-brand-500 via-sky-400 to-brand-600" aria-hidden />
                    <div className="flex flex-col gap-5 pt-1 sm:flex-row sm:items-end sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-brand-600">Base cadastral</p>
                        <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Subcontas recentes</h2>
                        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
                          Visão consolidada das contas vinculadas aos apps. Toque nos trechos mascarados para copiar IDs e chaves.
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-4 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" aria-hidden />
                          <span className="tabular-nums text-slate-900">{metrics.total}</span>
                          <span className="text-slate-400">{metrics.total === 1 ? 'registro' : 'registros'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="relative bg-gradient-to-b from-slate-50/90 to-slate-50/30 p-2 sm:p-3">
                    <div className="overflow-hidden rounded-xl border border-slate-200/50 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[920px] border-collapse text-sm">
                          <thead>
                            <tr className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                              <th className="whitespace-nowrap px-5 py-4 pl-7 font-medium">Cliente</th>
                              <th className="whitespace-nowrap px-4 py-4 font-medium">App</th>
                              <th className="whitespace-nowrap px-4 py-4 font-medium">Ambiente</th>
                              <th className="whitespace-nowrap px-4 py-4 font-medium">ID Asaas</th>
                              <th className="whitespace-nowrap px-4 py-4 font-medium">Wallet</th>
                              <th className="whitespace-nowrap px-4 py-4 font-medium">Chave API</th>
                              <th className="whitespace-nowrap px-5 py-4 pr-7 text-right font-medium">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subaccounts.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-8 py-20 text-center">
                                  <div className="mx-auto max-w-sm rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-8">
                                    <p className="text-sm font-semibold text-slate-700">Nenhuma subconta ainda</p>
                                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                      Comece pelo menu <span className="font-medium text-slate-700">Nova Subconta</span> para criar a primeira integração Asaas.
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              subaccounts.map((s, idx) => {
                                const initials = (s.name || s.email || '?')
                                  .split(/\s+/)
                                  .map((w) => w[0])
                                  .filter(Boolean)
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase();
                                return (
                                  <tr
                                    key={s.id}
                                    className={`border-b border-slate-100/90 transition-colors duration-200 hover:bg-brand-50/55 ${
                                      idx % 2 === 1 ? 'bg-slate-50/35' : 'bg-white'
                                    }`}
                                  >
                                    <td className="px-5 py-4 pl-7 align-middle">
                                      <div className="flex items-center gap-3.5">
                                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-bold tracking-wide text-white shadow-lg shadow-slate-900/25 ring-2 ring-white">
                                          {initials}
                                        </span>
                                        <div className="min-w-0">
                                          <div className="truncate font-semibold text-slate-900">{s.name || '—'}</div>
                                          <div className="truncate text-xs text-slate-500">{s.email}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-4 py-4 align-middle font-mono text-xs font-bold tracking-wide text-brand-700">
                                      {s.apps?.code ?? '—'}
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                      <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${
                                          s.environment === 'production'
                                            ? 'bg-amber-500/15 text-amber-900 ring-1 ring-amber-500/25'
                                            : 'bg-slate-500/10 text-slate-700 ring-1 ring-slate-400/20'
                                        }`}
                                      >
                                        {s.environment}
                                      </span>
                                    </td>
                                    <td className="px-4 py-4 align-middle font-mono text-[11px]">
                                      <button
                                        type="button"
                                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/90 px-2.5 py-1.5 text-left font-medium text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-900"
                                        onClick={() => copyToClipboard(s.asaas_subaccount_id)}
                                        title="Copiar ID Asaas"
                                      >
                                        <span className="truncate">{s.asaas_subaccount_id.slice(0, 10)}…</span>
                                        <svg className="h-3.5 w-3.5 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.08 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                        </svg>
                                      </button>
                                    </td>
                                    <td className="max-w-[150px] px-4 py-4 align-middle font-mono text-[11px]">
                                      {s.asaas_wallet_id ? (
                                        <button
                                          type="button"
                                          className="inline-flex w-full max-w-full items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/90 px-2.5 py-1.5 text-left font-medium text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-900"
                                          title="Copiar wallet"
                                          onClick={() => copyToClipboard(s.asaas_wallet_id!)}
                                        >
                                          <span className="truncate">{s.asaas_wallet_id.slice(0, 10)}…</span>
                                          <svg className="h-3.5 w-3.5 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.08 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                          </svg>
                                        </button>
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-4 align-middle font-mono text-[11px]">
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/90 px-2.5 py-1.5 font-medium text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-900"
                                        title="Copiar chave API"
                                        onClick={() => copyToClipboard(s.api_key)}
                                      >
                                        <span>{maskKey(s.api_key)}</span>
                                        <svg className="h-3.5 w-3.5 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.08 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                        </svg>
                                      </button>
                                    </td>
                                    <td className="px-5 py-4 pr-7 text-right align-middle">
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1.5 rounded-full border border-red-200/90 bg-gradient-to-b from-red-50 to-red-100/80 px-3 py-1.5 text-xs font-semibold text-red-800 shadow-sm transition hover:border-red-300 hover:from-red-100 hover:to-red-50"
                                        onClick={() => handleDeleteSubaccount(s.id, s.name || s.email)}
                                      >
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                        </svg>
                                        Excluir
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {tab === 'apps' && (
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Apps / Plataformas</h2>
                <p className="mt-1 text-sm text-slate-600">Código único para vincular subcontas ao seu sistema.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {apps.map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-col rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
                    >
                      <span className="inline-flex w-fit rounded-lg bg-brand-600/10 px-2.5 py-1 font-mono text-xs font-semibold text-brand-800">{a.code}</span>
                      <p className="mt-3 text-sm font-medium leading-snug text-slate-900">{a.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'create' && (
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Criar nova subconta</h2>
                <form onSubmit={handleCreate} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div><label className="label">App *</label><select className="input" value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} required><option value="">Selecione</option>{apps.map((a) => (<option key={a.id} value={a.id}>{a.code} - {a.name}</option>))}</select></div>
                  <div><label className="label">Ambiente *</label><select className="input" value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}><option value="sandbox">Sandbox</option><option value="production">Produção</option></select></div>
                  <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                  <div><label className="label">E-mail *</label><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
                  <div><label className="label">E-mail de login</label><input type="email" className="input" value={form.loginEmail} onChange={(e) => setForm({ ...form, loginEmail: e.target.value })} /></div>
                  <div>
                    <div className="mb-2 flex gap-2">
                      <button type="button" className="btn-secondary !py-1.5 text-sm" onClick={() => setForm((f) => ({ ...f, cpfCnpj: generateCpfMasked() }))}>Gerar CPF</button>
                      <button type="button" className="btn-secondary !py-1.5 text-sm" onClick={() => setForm((f) => ({ ...f, cpfCnpj: generateCnpjMasked() }))}>Gerar CNPJ</button>
                    </div>
                    <label className="label">CPF/CNPJ *</label>
                    <input className="input" value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: maskCpfCnpj(e.target.value) })} maxLength={18} required />
                  </div>
                  <div><label className="label">Data nascimento *</label><input type="text" className="input" value={form.birthDate} maxLength={10} onChange={(e) => setForm({ ...form, birthDate: maskDateBr(e.target.value) })} required /></div>
                  <div><label className="label">Tipo empresa</label><select className="input" value={form.companyType} onChange={(e) => setForm({ ...form, companyType: e.target.value })}><option value="MEI">MEI</option><option value="LIMITED">LTDA</option><option value="INDIVIDUAL">Individual</option></select></div>
                  <div><label className="label">Telefone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} maxLength={15} /></div>
                  <div><label className="label">Celular</label><input className="input" value={form.mobilePhone} onChange={(e) => setForm({ ...form, mobilePhone: maskMobile(e.target.value) })} maxLength={16} /></div>
                  <div><label className="label">CEP *</label><input className="input" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: maskCep(e.target.value) })} onBlur={handleCepBlur} maxLength={9} required />{loadingCep && <span className="ml-2 text-xs text-slate-500">Buscando...</span>}</div>
                  <div><label className="label">Bairro *</label><input className="input" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} required /></div>
                  <div className="md:col-span-2"><label className="label">Endereço *</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required /></div>
                  <div><label className="label">Número *</label><input className="input" value={form.addressNumber} onChange={(e) => setForm({ ...form, addressNumber: e.target.value })} required /></div>
                  <div><label className="label">Complemento</label><input className="input" value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} /></div>
                  <div><label className="label">Renda mensal</label><input type="number" className="input" value={form.incomeValue} onChange={(e) => setForm({ ...form, incomeValue: Number(e.target.value) })} /></div>
                  <div className="flex items-end justify-end md:col-span-2"><button type="submit" className="btn-primary" disabled={creating}>{creating ? 'Criando...' : 'Criar subconta'}</button></div>
                </form>
              </div>
            )}

            {tab === 'asaas' && (
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Subcontas no Asaas</h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-600">
                      Lista em tempo real da API Asaas. A <span className="font-medium text-slate-800">chave API</span> aparece nos cards somente quando a subconta foi criada por este painel — o endpoint de listagem do Asaas não devolve a chave.
                    </p>
                  </div>
                  <div className="flex flex-col items-stretch gap-1 sm:items-end">
                    <span className="text-xs font-medium text-slate-500">Ambiente</span>
                    <select
                      className="input !py-2 min-w-[160px]"
                      value={asaasEnvironment}
                      onChange={(e) => {
                        const env = e.target.value as 'sandbox' | 'production';
                        setAsaasEnvironment(env);
                        setAsaasSubaccounts([]);
                        setAsaasOffset(0);
                        setAsaasHasMore(false);
                        void loadAsaasSubaccounts({ reset: true, environment: env });
                      }}
                    >
                      <option value="sandbox">Sandbox</option>
                      <option value="production">Produção</option>
                    </select>
                  </div>
                </div>

                <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-2.5 text-xs text-slate-600 md:px-6">
                  <span className="font-semibold text-slate-800">{asaasSubaccounts.length}</span> conta(s) exibida(s)
                  {asaasHasMore ? ' · há mais ao carregar' : ''} ·{' '}
                  <span className="text-slate-500">{asaasEnvironment === 'production' ? 'Produção' : 'Sandbox'}</span>
                </div>

                <div className="p-4 md:p-6">
                  {asaasLoading && asaasSubaccounts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
                      <div
                        className="h-9 w-9 animate-spin rounded-full border-2 border-brand-600 border-t-transparent"
                        aria-hidden
                      />
                      <p className="text-sm">Carregando contas…</p>
                    </div>
                  ) : asaasSubaccounts.length === 0 ? (
                    <p className="py-16 text-center text-sm text-slate-500">Nenhuma subconta retornada para este ambiente.</p>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {asaasSubaccounts.map((a) => {
                        const db = subaccountSecretsByAsaasId.get(a.id);
                        const wallet = a.walletId ?? db?.wallet_id ?? null;
                        const apiKey = db?.api_key ?? null;
                        return (
                          <article
                            key={a.id}
                            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="truncate text-base font-semibold text-slate-900">{a.name ?? 'Sem nome'}</h3>
                                <p className="mt-0.5 truncate text-sm text-slate-600">{a.email ?? '—'}</p>
                              </div>
                              {(a.companyType || a.personType) && (
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                  {a.companyType ?? a.personType}
                                </span>
                              )}
                            </div>
                            <dl className="mt-4 grid gap-2 text-xs">
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <dt className="font-semibold uppercase tracking-wide text-slate-500">CPF/CNPJ</dt>
                                <dd className="mt-1 font-mono text-slate-800">{a.cpfCnpj ?? '—'}</dd>
                              </div>
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <dt className="font-semibold uppercase tracking-wide text-slate-500">Wallet</dt>
                                <dd className="mt-1 flex items-center justify-between gap-2">
                                  <span className="min-w-0 flex-1 truncate font-mono text-slate-800" title={wallet ?? undefined}>
                                    {wallet ?? '—'}
                                  </span>
                                  {wallet ? (
                                    <button
                                      type="button"
                                      className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-brand-700 ring-1 ring-slate-200 hover:bg-brand-50"
                                      onClick={() => copyToClipboard(wallet)}
                                    >
                                      Copiar
                                    </button>
                                  ) : null}
                                </dd>
                              </div>
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <dt className="font-semibold uppercase tracking-wide text-slate-500">ID Asaas</dt>
                                <dd className="mt-1 flex items-center justify-between gap-2">
                                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-800">{a.id}</span>
                                  <button
                                    type="button"
                                    className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-brand-700 ring-1 ring-slate-200 hover:bg-brand-50"
                                    onClick={() => copyToClipboard(a.id)}
                                  >
                                    Copiar
                                  </button>
                                </dd>
                              </div>
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <dt className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold uppercase tracking-wide text-slate-500">Chave API</span>
                                  {apiKey ? (
                                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Salva no painel</span>
                                  ) : (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Fora do painel</span>
                                  )}
                                </dt>
                                <dd className="mt-1 flex items-start justify-between gap-2">
                                  {apiKey ? (
                                    <>
                                      <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-slate-800">{maskKey(apiKey)}</span>
                                      <button
                                        type="button"
                                        className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-brand-700 ring-1 ring-slate-200 hover:bg-brand-50"
                                        onClick={() => copyToClipboard(apiKey)}
                                      >
                                        Copiar
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[11px] leading-relaxed text-slate-500">
                                      Só aparece aqui se você criou a subconta neste painel. Contas criadas só no Asaas não têm chave nesta base.
                                    </span>
                                  )}
                                </dd>
                              </div>
                            </dl>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
                  <p className="text-sm text-slate-500">
                    {asaasLoading ? 'Carregando…' : asaasHasMore ? 'Há mais resultados na API.' : 'Fim da lista para este ambiente.'}
                  </p>
                  <button type="button" className="btn-primary" disabled={!asaasHasMore || asaasLoading} onClick={() => void loadAsaasSubaccounts({ reset: false })}>
                    {asaasLoading ? 'Carregando…' : 'Carregar mais'}
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
