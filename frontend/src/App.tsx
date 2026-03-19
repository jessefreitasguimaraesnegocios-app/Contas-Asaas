import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import {
  maskCpfCnpj,
  maskPhone,
  maskMobile,
  maskCep,
  maskDateBr,
  fetchByCep,
  onlyDigits,
  brDateToIso,
} from './lib/masks';

type App = { id: string; code: string; name: string };
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'asaas' | 'create' | 'apps'>('list');
  const [apps, setApps] = useState<App[]>([]);
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
  const [asaasLoading, setAsaasLoading] = useState(false);
  const [asaasEnvironment, setAsaasEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [asaasOffset, setAsaasOffset] = useState(0);
  const [asaasHasMore, setAsaasHasMore] = useState(false);
  const [asaasSubaccounts, setAsaasSubaccounts] = useState<any[]>([]);
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

  async function loadApps() {
    const { data } = await supabase.from('apps').select('id, code, name').order('code');
    setApps((data as App[]) || []);
  }

  async function loadSubaccounts() {
    const { data } = await supabase
      .from('asaas_subaccounts')
      .select(
        'id, app_id, environment, asaas_subaccount_id, asaas_wallet_id, api_key, email, name, cpf_cnpj, status, split_percent, monthly_fee_cents, created_at, apps(code, name)'
      )
      .order('created_at', { ascending: false });
    setSubaccounts(((data ?? []) as unknown) as Subaccount[]);
  }

  async function loadAsaasSubaccounts(opts?: { reset?: boolean; environment?: 'sandbox' | 'production' }) {
    const reset = opts?.reset ?? false;
    const env = opts?.environment ?? asaasEnvironment;
    const nextOffset = reset ? 0 : asaasOffset;
    setAsaasLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-asaas-subaccounts', {
        body: { environment: env, offset: nextOffset, limit: 50 },
        headers: { 'x-client-info': 'plataforma-subcontas' },
      });
      if (error) throw error;
      const result = (data as any)?.result;
      const list = Array.isArray(result?.data) ? result.data : [];
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
      return;
    }
    (async () => {
      setLoading(true);
      await loadApps();
      await loadSubaccounts();
      setLoading(false);
    })();
  }, [session]);

  // Garante que ao entrar na aba "Subcontas" a lista esteja sempre atualizada
  useEffect(() => {
    if (!session) return;
    if (tab !== 'list') return;
    // Carrega sem bloquear a tela inteira; evita estado "criou e não apareceu".
    void loadSubaccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, session]);

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

      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-subaccount', {
        body,
        headers: {
          'x-client-info': 'plataforma-subcontas',
        },
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
      await loadSubaccounts();
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

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function formatMoneyCents(value: string | number | null | undefined) {
    const cents =
      value == null
        ? 0
        : typeof value === 'string'
          ? parseInt(value, 10) || 0
          : Number(value) || 0;
    return brl.format(cents / 100);
  }
  function formatSplitPercent(value: string | number | null | undefined) {
    const p = value == null ? 0 : typeof value === 'string' ? parseFloat(value) || 0 : Number(value) || 0;
    return `${p}%`;
  }

  async function handleDeleteSubaccount(id: string) {
    const ok = confirm(
      'Excluir subconta?\n\n- Primeiro tenta excluir na Asaas (quando permitido)\n- Depois remove o registro do Supabase\n\nIsso pode ser irreversível na Asaas.'
    );
    if (!ok) return;

    setMessage(null);
    try {
      const { error } = await supabase.functions.invoke('delete-subaccount', {
        body: { id, mode: 'asaas_and_db', removeReason: 'Liberar dados' },
        headers: { 'x-client-info': 'plataforma-subcontas' },
      });
      if (error) {
        const fallback = confirm(
          `Falhou excluir na Asaas.\n\n${error.message}\n\nQuer remover SOMENTE do Supabase (db_only)?`
        );
        if (!fallback) throw error;
        const { error: dbOnlyErr } = await supabase.functions.invoke('delete-subaccount', {
          body: { id, mode: 'db_only' },
          headers: { 'x-client-info': 'plataforma-subcontas' },
        });
        if (dbOnlyErr) throw dbOnlyErr;
      }
      setMessage({ type: 'ok', text: 'Subconta excluída.' });
      await loadSubaccounts();
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-surface-500">Carregando…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
        <div className="card p-6 w-full max-w-md">
          <h1 className="text-xl font-bold text-surface-900 mb-2">Plataforma Subcontas Asaas</h1>
          <p className="text-surface-600 text-sm mb-6">Entre para criar e gerenciar subcontas.</p>
          {message && (
            <div
              className={`mb-4 px-4 py-3 rounded-lg text-sm ${message.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
            >
              {message.text}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input
                type="email"
                className="input"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">Senha</label>
              <input
                type="password"
                className="input"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={signUpMode ? 'new-password' : 'current-password'}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loginLoading}>
              {loginLoading ? 'Aguarde…' : signUpMode ? 'Criar conta' : 'Entrar'}
            </button>
            <button
              type="button"
              className="text-sm text-brand-600 hover:underline"
              onClick={() => { setSignUpMode(!signUpMode); setMessage(null); }}
            >
              {signUpMode ? 'Já tenho conta, entrar' : 'Criar conta'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-surface-500">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="bg-surface-900 text-white px-4 md:px-6 py-4 shadow">
        <div className="max-w-6xl mx-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-xl font-bold font-sans leading-tight">Plataforma Subcontas Asaas</h1>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="flex items-center justify-between gap-3 md:justify-end">
              <span className="text-surface-300 text-sm truncate max-w-[60vw] md:max-w-none">
                {session.user?.email}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-2 rounded-lg border border-surface-600 text-sm hover:bg-surface-800"
              >
                Sair
              </button>
            </div>

            <nav className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 md:overflow-visible md:pb-0 md:mx-0 md:px-0">
              <button
                type="button"
                onClick={() => setTab('list')}
                className={`shrink-0 px-3 py-2 rounded-lg transition text-sm ${tab === 'list' ? 'bg-brand-500 text-white' : 'hover:bg-surface-800'}`}
              >
                Subcontas
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('asaas');
                  setMessage(null);
                  setAsaasSubaccounts([]);
                  setAsaasOffset(0);
                void loadAsaasSubaccounts({ reset: true, environment: asaasEnvironment });
                }}
                className={`shrink-0 px-3 py-2 rounded-lg transition text-sm ${tab === 'asaas' ? 'bg-brand-500 text-white' : 'hover:bg-surface-800'}`}
              >
                Asaas (todas)
              </button>
              <button
                type="button"
                onClick={() => setTab('create')}
                className={`shrink-0 px-3 py-2 rounded-lg transition text-sm ${tab === 'create' ? 'bg-brand-500 text-white' : 'hover:bg-surface-800'}`}
              >
                Nova subconta
              </button>
              <button
                type="button"
                onClick={() => setTab('apps')}
                className={`shrink-0 px-3 py-2 rounded-lg transition text-sm ${tab === 'apps' ? 'bg-brand-500 text-white' : 'hover:bg-surface-800'}`}
              >
                Apps
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {message && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg ${message.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
          >
            {message.text}
          </div>
        )}

        {tab === 'apps' && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Apps / Plataformas</h2>
            <p className="text-surface-600 text-sm mb-4">
              Código único para vincular subcontas (ex: BARBEARIA, SORVETERIA, CLUB). Use o mesmo código no seu sistema.
            </p>
            <ul className="space-y-2">
              {apps.map((a) => (
                <li key={a.id} className="flex items-center gap-4 py-2 border-b border-surface-100 last:border-0">
                  <span className="font-mono font-medium text-brand-600">{a.code}</span>
                  <span>{a.name}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-surface-500 mt-4">
              Para adicionar novos apps, insira na tabela <code className="bg-surface-100 px-1 rounded">public.apps</code> no Supabase (code, name).
            </p>
          </div>
        )}

        {tab === 'create' && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-6">Criar nova subconta</h2>
            <form
              onSubmit={handleCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
                  e.preventDefault();
                }
              }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div>
                <label className="label">App *</label>
                <select
                  className="input"
                  value={form.app_id}
                  onChange={(e) => setForm({ ...form, app_id: e.target.value })}
                  required
                >
                  <option value="">Selecione</option>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Ambiente *</label>
                <select
                  className="input"
                  value={form.environment}
                  onChange={(e) => setForm({ ...form, environment: e.target.value })}
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Produção</option>
                </select>
              </div>
              <div>
                <label className="label">Nome *</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="label">E-mail *</label>
                <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div>
                <label className="label">E-mail de login (se diferente)</label>
                <input type="email" className="input" value={form.loginEmail} onChange={(e) => setForm({ ...form, loginEmail: e.target.value })} placeholder={form.email || 'igual ao e-mail'} />
              </div>
              <div>
                <label className="label">CPF/CNPJ *</label>
                <input
                  className="input"
                  value={form.cpfCnpj}
                  onChange={(e) => setForm({ ...form, cpfCnpj: maskCpfCnpj(e.target.value) })}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  maxLength={18}
                  required
                />
              </div>
              <div>
                <label className="label">Data nascimento *</label>
                <input
                  type="text"
                  className="input"
                  value={form.birthDate}
                  inputMode="numeric"
                  placeholder="DD/MM/AAAA"
                  maxLength={10}
                  onChange={(e) => setForm({ ...form, birthDate: maskDateBr(e.target.value) })}
                  required
                />
              </div>
              <div>
                <label className="label">Tipo empresa</label>
                <select className="input" value={form.companyType} onChange={(e) => setForm({ ...form, companyType: e.target.value })}>
                  <option value="MEI">MEI</option>
                  <option value="LIMITED">LTDA</option>
                  <option value="INDIVIDUAL">Individual</option>
                </select>
              </div>
              <div>
                <label className="label">Telefone</label>
                <input
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                  placeholder="(00) 0000-0000"
                  maxLength={15}
                />
              </div>
              <div>
                <label className="label">Celular</label>
                <input
                  className="input"
                  value={form.mobilePhone}
                  onChange={(e) => setForm({ ...form, mobilePhone: maskMobile(e.target.value) })}
                  placeholder="(00) 00000-0000"
                  maxLength={16}
                />
              </div>
              <div>
                <label className="label">CEP *</label>
                <input
                  className="input"
                  value={form.postalCode}
                  onChange={(e) => {
                    setMessage(null);
                    setForm({ ...form, postalCode: maskCep(e.target.value) });
                  }}
                  onFocus={() => setMessage(null)}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                  maxLength={9}
                  required
                />
                {loadingCep && <span className="text-xs text-surface-500 ml-2">Buscando…</span>}
              </div>
              <div className="md:col-span-2">
                <label className="label">Endereço *</label>
                <input
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Preenchido pelo CEP ou digite"
                  required
                />
              </div>
              <div>
                <label className="label">Número *</label>
                <input
                  className="input"
                  value={form.addressNumber}
                  onChange={(e) => setForm({ ...form, addressNumber: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Complemento</label>
                <input
                  className="input"
                  value={form.complement}
                  onChange={(e) => setForm({ ...form, complement: e.target.value })}
                  placeholder="Apto, sala, etc."
                />
              </div>
              <div>
                <label className="label">Bairro *</label>
                <input
                  className="input"
                  value={form.province}
                  onChange={(e) => setForm({ ...form, province: e.target.value })}
                  placeholder="Preenchido pelo CEP ou digite"
                  required
                />
              </div>
              <div>
                <label className="label">Renda/Faturamento mensal</label>
                <input type="number" className="input" value={form.incomeValue} onChange={(e) => setForm({ ...form, incomeValue: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Split (% que você ganha)</label>
                <input
                  type="number"
                  className="input"
                  value={form.splitPercent}
                  min={0}
                  max={100}
                  step={0.1}
                  onChange={(e) => setForm({ ...form, splitPercent: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Mensalidade (R$)</label>
                <input
                  type="number"
                  className="input"
                  value={form.monthlyFee}
                  min={0}
                  step={0.01}
                  onChange={(e) => setForm({ ...form, monthlyFee: Number(e.target.value) })}
                />
              </div>
              <div className="md:col-span-2 flex justify-end pt-4">
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Criando…' : 'Criar subconta'}
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === 'list' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-200">
              <h2 className="text-lg font-semibold">Subcontas criadas</h2>
              <p className="text-sm text-surface-500">Dados salvos no Supabase (id, chave API, wallet, etc.)</p>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-surface-100">
              {subaccounts.length === 0 ? (
                <div className="px-6 py-8 text-center text-surface-500 text-sm">
                  Nenhuma subconta ainda. Crie uma em &quot;Nova subconta&quot;.
                </div>
              ) : (
                subaccounts.map((s) => (
                  <div key={s.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-brand-600 text-sm">{s.apps?.code ?? '-'}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${s.environment === 'production' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}
                          >
                            {s.environment}
                          </span>
                        </div>
                        <div className="mt-2 text-sm font-medium truncate">{s.name || '-'}</div>
                        <div className="text-xs text-surface-500 truncate">{s.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubaccount(s.id)}
                        className="shrink-0 text-xs text-red-700 hover:underline"
                      >
                        Excluir
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-surface-500">ID Subconta</div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(s.asaas_subaccount_id)}
                          className="font-mono text-brand-600 hover:underline"
                          title="Copiar"
                        >
                          {s.asaas_subaccount_id.slice(0, 8)}…
                        </button>
                      </div>
                      <div>
                        <div className="text-surface-500">Chave API</div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(s.api_key)}
                          className="font-mono text-brand-600 hover:underline"
                          title="Copiar chave"
                        >
                          {maskKey(s.api_key)}
                        </button>
                      </div>
                      <div>
                        <div className="text-surface-500">Split</div>
                        <div className="text-surface-700">{formatSplitPercent(s.split_percent)}</div>
                      </div>
                      <div>
                        <div className="text-surface-500">Mensalidade</div>
                        <div className="text-surface-700">{formatMoneyCents(s.monthly_fee_cents)}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-surface-500">Criado em</div>
                        <div className="text-surface-700">{new Date(s.created_at).toLocaleDateString('pt-BR')}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    <th className="text-left px-4 py-3 font-medium">App</th>
                    <th className="text-left px-4 py-3 font-medium">Ambiente</th>
                    <th className="text-left px-4 py-3 font-medium">Nome / E-mail</th>
                    <th className="text-left px-4 py-3 font-medium">ID Subconta</th>
                    <th className="text-left px-4 py-3 font-medium">Chave API</th>
                    <th className="text-left px-4 py-3 font-medium">Split</th>
                    <th className="text-left px-4 py-3 font-medium">Mensalidade</th>
                    <th className="text-left px-4 py-3 font-medium">Ações</th>
                    <th className="text-left px-4 py-3 font-medium">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {subaccounts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-surface-500">
                        Nenhuma subconta ainda. Crie uma em &quot;Nova subconta&quot;.
                      </td>
                    </tr>
                  ) : (
                    subaccounts.map((s) => (
                      <tr key={s.id} className="border-b border-surface-100 hover:bg-surface-50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-brand-600">{s.apps?.code ?? '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${s.environment === 'production' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                            {s.environment}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div>{s.name || '-'}</div>
                          <div className="text-surface-500">{s.email}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(s.asaas_subaccount_id)}
                            className="text-brand-600 hover:underline"
                            title="Copiar"
                          >
                            {s.asaas_subaccount_id.slice(0, 8)}…
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(s.api_key)}
                            className="text-brand-600 hover:underline"
                            title="Copiar chave"
                          >
                            {maskKey(s.api_key)}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-surface-700 text-xs">{formatSplitPercent(s.split_percent)}</td>
                        <td className="px-4 py-3 text-surface-700 text-xs">{formatMoneyCents(s.monthly_fee_cents)}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleDeleteSubaccount(s.id)}
                            className="text-xs text-red-700 hover:underline"
                          >
                            Excluir
                          </button>
                        </td>
                        <td className="px-4 py-3 text-surface-500">
                          {new Date(s.created_at).toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'asaas' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Subcontas no Asaas (todas)</h2>
                <p className="text-sm text-surface-500">Lista direta do Asaas via API (não depende do Supabase).</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-surface-600">Ambiente</label>
                <select
                  className="input !py-2"
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

            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-surface-100">
              {asaasSubaccounts.length === 0 && !asaasLoading ? (
                <div className="px-6 py-8 text-center text-surface-500 text-sm">Nenhuma subconta retornada.</div>
              ) : (
                asaasSubaccounts.map((a) => (
                  <div key={a.id} className="px-6 py-4">
                    <div className="text-sm font-medium truncate">{a.name ?? '-'}</div>
                    <div className="text-xs text-surface-500 truncate">{a.email ?? '-'}</div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-surface-500">CPF/CNPJ</div>
                        <div className="font-mono text-surface-700 break-all">{a.cpfCnpj ?? '-'}</div>
                      </div>
                      <div>
                        <div className="text-surface-500">Wallet</div>
                        <div className="font-mono text-surface-700 break-all">{a.walletId ?? '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-surface-500">ID</div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(a.id)}
                          className="font-mono text-brand-600 hover:underline break-all"
                          title="Copiar"
                        >
                          {String(a.id)}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    <th className="text-left px-4 py-3 font-medium">Nome</th>
                    <th className="text-left px-4 py-3 font-medium">E-mail</th>
                    <th className="text-left px-4 py-3 font-medium">CPF/CNPJ</th>
                    <th className="text-left px-4 py-3 font-medium">Wallet</th>
                    <th className="text-left px-4 py-3 font-medium">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {asaasSubaccounts.length === 0 && !asaasLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-surface-500">
                        Nenhuma subconta retornada.
                      </td>
                    </tr>
                  ) : (
                    asaasSubaccounts.map((a) => (
                      <tr key={a.id} className="border-b border-surface-100 hover:bg-surface-50">
                        <td className="px-4 py-3">{a.name ?? '-'}</td>
                        <td className="px-4 py-3 text-surface-600">{a.email ?? '-'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{a.cpfCnpj ?? '-'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{a.walletId ?? '-'}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(a.id)}
                            className="text-brand-600 hover:underline"
                            title="Copiar"
                          >
                            {String(a.id).slice(0, 8)}…
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 flex items-center justify-between">
              <div className="text-sm text-surface-500">
                {asaasLoading ? 'Carregando…' : asaasHasMore ? 'Há mais resultados.' : 'Fim da lista.'}
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={!asaasHasMore || asaasLoading}
                onClick={() => void loadAsaasSubaccounts({ reset: false })}
              >
                {asaasLoading ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
