import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import {
  maskCpfCnpj,
  maskPhone,
  maskMobile,
  maskCep,
  fetchByCep,
  onlyDigits,
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
  created_at: string;
  apps?: { code: string; name: string } | null;
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'create' | 'apps'>('list');
  const [apps, setApps] = useState<App[]>([]);
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
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

  async function loadApps() {
    const { data } = await supabase.from('apps').select('id, code, name').order('code');
    setApps((data as App[]) || []);
  }

  async function loadSubaccounts() {
    const { data } = await supabase
      .from('asaas_subaccounts')
      .select('id, app_id, environment, asaas_subaccount_id, asaas_wallet_id, api_key, email, name, cpf_cnpj, status, created_at, apps(code, name)')
      .order('created_at', { ascending: false });
    setSubaccounts(((data ?? []) as unknown) as Subaccount[]);
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
        birthDate: form.birthDate,
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
      const { data, error } = await supabase.functions.invoke('create-subaccount', { body });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error || data.details?.description || 'Erro ao criar subconta');
      setMessage({ type: 'ok', text: 'Subconta criada e salva com sucesso.' });
      setForm({ ...form, name: '', email: '', loginEmail: '', cpfCnpj: '', birthDate: '' });
      await loadSubaccounts();
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
      <header className="bg-surface-900 text-white px-6 py-4 shadow">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold font-sans">Plataforma Subcontas Asaas</h1>
          <div className="flex items-center gap-4">
          <span className="text-surface-300 text-sm">{session.user?.email}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg border border-surface-600 text-sm hover:bg-surface-800"
          >
            Sair
          </button>
          <nav className="flex gap-4">
            <button
              type="button"
              onClick={() => setTab('list')}
              className={`px-3 py-1.5 rounded-lg transition ${tab === 'list' ? 'bg-brand-500 text-white' : 'hover:bg-surface-800'}`}
            >
              Subcontas
            </button>
            <button
              type="button"
              onClick={() => setTab('create')}
              className={`px-3 py-1.5 rounded-lg transition ${tab === 'create' ? 'bg-brand-500 text-white' : 'hover:bg-surface-800'}`}
            >
              Nova subconta
            </button>
            <button
              type="button"
              onClick={() => setTab('apps')}
              className={`px-3 py-1.5 rounded-lg transition ${tab === 'apps' ? 'bg-brand-500 text-white' : 'hover:bg-surface-800'}`}
            >
              Apps
            </button>
          </nav>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
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
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <input type="date" className="input" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} required />
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
                  onChange={(e) => setForm({ ...form, postalCode: maskCep(e.target.value) })}
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    <th className="text-left px-4 py-3 font-medium">App</th>
                    <th className="text-left px-4 py-3 font-medium">Ambiente</th>
                    <th className="text-left px-4 py-3 font-medium">Nome / E-mail</th>
                    <th className="text-left px-4 py-3 font-medium">ID Subconta</th>
                    <th className="text-left px-4 py-3 font-medium">Chave API</th>
                    <th className="text-left px-4 py-3 font-medium">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {subaccounts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-surface-500">
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
      </main>
    </div>
  );
}
