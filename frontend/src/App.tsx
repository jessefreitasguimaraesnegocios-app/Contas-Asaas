import { useEffect, useMemo, useRef, useState } from 'react';
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
  split_percent: number | string | null;
  monthly_fee_cents: number | string | null;
  created_at: string;
  apps?: { code: string; name: string } | null;
};

type Tab = 'list' | 'asaas' | 'create' | 'apps';

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
    splitPercent: 10,
    monthlyFee: 50,
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
        'id, app_id, environment, asaas_subaccount_id, asaas_wallet_id, api_key, email, name, cpf_cnpj, status, split_percent, monthly_fee_cents, created_at, apps(code, name)'
      )
      .order('created_at', { ascending: false });
    if (!error) {
      setSubaccounts(((data ?? []) as unknown) as Subaccount[]);
      return;
    }

    // Fallback: if relational select fails, load base fields anyway.
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('asaas_subaccounts')
      .select('id, app_id, environment, asaas_subaccount_id, asaas_wallet_id, api_key, email, name, cpf_cnpj, status, split_percent, monthly_fee_cents, created_at')
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
        splitPercent: form.splitPercent,
        monthlyFeeCents: Math.round(Number(form.monthlyFee) * 100),
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

  function formatMoneyCents(value: string | number | null | undefined) {
    const cents =
      value == null
        ? 0
        : typeof value === 'string'
          ? parseInt(value, 10) || 0
          : Number(value) || 0;
    return brl.format(cents / 100);
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

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const metrics = useMemo(() => {
    const totalReceita = subaccounts.reduce((acc, item) => {
      const cents =
        item.monthly_fee_cents == null
          ? 0
          : typeof item.monthly_fee_cents === 'string'
            ? parseInt(item.monthly_fee_cents, 10) || 0
            : Number(item.monthly_fee_cents) || 0;
      return acc + cents;
    }, 0);
    return {
      total: subaccounts.length,
      appsAtivos: new Set(subaccounts.map((s) => s.app_id)).size,
      sandbox: subaccounts.filter((s) => s.environment === 'sandbox').length,
      production: subaccounts.filter((s) => s.environment === 'production').length,
      receitaMensal: brl.format(totalReceita / 100),
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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'list', label: 'Dashboard' },
    { id: 'create', label: 'Nova Subconta' },
    { id: 'asaas', label: 'Asaas (todas)' },
    { id: 'apps', label: 'Apps' },
  ];

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
        Carregando...
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
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex max-w-[1400px]">
        <aside className="hidden min-h-screen w-64 bg-slate-950 px-5 py-6 text-slate-200 lg:block">
          <div className="mb-8 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">A</div>
            <div>
              <div className="text-sm text-slate-400">Painel</div>
              <div className="font-semibold">AsaaS</div>
            </div>
          </div>
          <nav className="space-y-2">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  if (item.id === 'asaas') {
                    setAsaasSubaccounts([]);
                    setAsaasOffset(0);
                    void loadAsaasSubaccounts({ reset: true, environment: asaasEnvironment });
                  }
                }}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${tab === item.id ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="w-full">
          <header className="border-b border-slate-200 bg-white px-4 py-4 md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Bem-vindo, Admin</h1>
                <p className="text-sm text-slate-500">Gerencie suas subcontas e resultados.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600 md:inline">{session.user?.email}</span>
                <button type="button" className="btn-secondary" onClick={() => setTab('create')}>Nova Subconta</button>
                <button type="button" className="btn-primary" onClick={handleLogout}>Sair</button>
              </div>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    if (item.id === 'asaas') {
                      setAsaasSubaccounts([]);
                      setAsaasOffset(0);
                      void loadAsaasSubaccounts({ reset: true, environment: asaasEnvironment });
                    }
                  }}
                  className={`rounded-lg px-3 py-2 text-sm ${tab === item.id ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>

          <main className="p-4 md:p-8">
            {message && (
              <div className={`mb-4 rounded-xl px-4 py-3 ${message.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {message.text}
              </div>
            )}

            {tab === 'list' && (
              <div className="space-y-4">
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <p className="text-xs text-slate-500">Subcontas totais</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.total}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <p className="text-xs text-slate-500">Receita mensal</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.receitaMensal}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <p className="text-xs text-slate-500">Apps ativos</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.appsAtivos}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <p className="text-xs text-slate-500">Sandbox</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.sandbox}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <p className="text-xs text-slate-500">Produção</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.production}</p>
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="text-lg font-semibold text-slate-900">Subcontas recentes</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Cliente</th>
                          <th className="px-4 py-3 text-left font-medium">App</th>
                          <th className="px-4 py-3 text-left font-medium">Ambiente</th>
                          <th className="px-4 py-3 text-left font-medium">ID Asaas</th>
                          <th className="px-4 py-3 text-left font-medium">Wallet</th>
                          <th className="px-4 py-3 text-left font-medium">Chave API</th>
                          <th className="px-4 py-3 text-left font-medium">Mensalidade</th>
                          <th className="px-4 py-3 text-left font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subaccounts.length === 0 ? (
                          <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Nenhuma subconta ainda.</td></tr>
                        ) : (
                          subaccounts.map((s) => (
                            <tr key={s.id} className="border-t border-slate-100">
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900">{s.name || '-'}</div>
                                <div className="text-xs text-slate-500">{s.email}</div>
                              </td>
                              <td className="px-4 py-3 font-mono text-brand-700">{s.apps?.code ?? '-'}</td>
                              <td className="px-4 py-3">
                                <span className={`rounded-md px-2 py-1 text-xs ${s.environment === 'production' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{s.environment}</span>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">
                                <button type="button" className="text-brand-700 hover:underline" onClick={() => copyToClipboard(s.asaas_subaccount_id)}>{s.asaas_subaccount_id.slice(0, 8)}...</button>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs max-w-[140px]">
                                {s.asaas_wallet_id ? (
                                  <button type="button" className="block truncate text-left text-brand-700 hover:underline" title={s.asaas_wallet_id} onClick={() => copyToClipboard(s.asaas_wallet_id!)}>
                                    {s.asaas_wallet_id.slice(0, 10)}…
                                  </button>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">
                                <button type="button" className="text-brand-700 hover:underline" onClick={() => copyToClipboard(s.api_key)}>{maskKey(s.api_key)}</button>
                              </td>
                              <td className="px-4 py-3 text-slate-700">{formatMoneyCents(s.monthly_fee_cents)}</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  className="text-xs text-red-700 hover:underline"
                                  onClick={() => handleDeleteSubaccount(s.id, s.name || s.email)}
                                >
                                  Excluir
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
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
                  <div><label className="label">Split (%)</label><input type="number" className="input" value={form.splitPercent} min={0} max={100} step={0.1} onChange={(e) => setForm({ ...form, splitPercent: Number(e.target.value) })} /></div>
                  <div><label className="label">Mensalidade (R$)</label><input type="number" className="input" value={form.monthlyFee} min={0} step={0.01} onChange={(e) => setForm({ ...form, monthlyFee: Number(e.target.value) })} /></div>
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
