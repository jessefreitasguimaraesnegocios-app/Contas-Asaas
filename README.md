# Plataforma Subcontas Asaas

Sistema para criar e gerenciar subcontas Asaas (sandbox e produção), vinculadas a vários apps (barbearia, sorveteria, club, etc.), com dados salvos no Supabase.

## Estrutura

- **supabase/migrations** — Schema do banco (apps + asaas_subaccounts)
- **supabase/functions/create-subaccount** — Edge Function que chama a API Asaas e grava no Supabase
- **frontend** — Interface React (Vite + Tailwind) para listar apps, criar subcontas e ver dados salvos

## Setup

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No SQL Editor, rode o conteúdo de `supabase/migrations/20260316000001_initial_schema.sql` para criar as tabelas `apps` e `asaas_subaccounts`.
3. (Opcional) Ajuste RLS nas tabelas conforme sua política de acesso.

### 2. Edge Function `create-subaccount`

1. Instale o [Supabase CLI](https://supabase.com/docs/guides/cli) e faça login.
2. Na pasta do projeto: `supabase link` (vincule ao projeto).
3. Configure os secrets da função (token da **conta principal** Asaas para cada ambiente):
   - O valor deve ser **exatamente** o mesmo do `access_token` do script que já funciona (ex.: `criar-subconta-sandbox.js`). Copie o valor completo, incluindo `$` no início se existir.
   - No Dashboard: Project Settings → Edge Functions → Secrets.
   - Ou via CLI:
   ```bash
   supabase secrets set ASAAS_MAIN_TOKEN_SANDBOX="COLE_AQUI_O_MESMO_VALOR_DO_SCRIPT"
   supabase secrets set ASAAS_MAIN_TOKEN_PRODUCTION="..."
   ```
   Opcional (split / carteira da conta matriz por ambiente — UUIDs do painel Asaas):
   ```bash
   supabase secrets set ASAAS_MAIN_WALLET_ID="UUID_CARTEIRA_PRODUCAO"
   supabase secrets set ASAAS_MAIN_WALLET_ID_SANDBOX="UUID_CARTEIRA_SANDBOX"
   ```
   No Dashboard: **Edge Functions → Secrets** — os nomes acima batem com o guia `docs/vincular-wallet-apikey-pagamentos-split.md`. O painel mostra **digest SHA-256** do valor; o que você cola é o token ou o UUID em texto.
4. Deploy da função:
   ```bash
   supabase functions deploy create-subaccount
   ```

   **Produção:** para criar chave de API da subconta em produção, a conta principal precisa ter em Integrações > Chaves de API > "Habilitar acesso" (Gerenciamento de chaves de API de subcontas) e em Mecanismos de segurança > Endereços IP autorizados (inclua o IP do servidor onde a Edge Function roda, se exigido).

### 3. Frontend

1. Entre na pasta `frontend` e crie o arquivo `.env`:
   ```
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-anon-key
   ```
2. Instale dependências e rode:
   ```bash
   npm install
   npm run dev
   ```
3. Acesse `http://localhost:5174`.

## Por que o script funciona e o app não?

O **script** (ex.: `criar-subconta-sandbox.js`) chama **direto** a API Asaas: `POST https://api-sandbox.asaas.com/v3/accounts` com o header `access_token`. Não passa pelo Supabase.

O **app** faz: **navegador** → **Supabase Edge Function** (gateway) → **create-subaccount** → **Asaas API**. Se der 401/403, o erro é do **gateway do Supabase** (JWT/apikey), não da Asaas. Confira:

1. **Vercel:** variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` definidas e **Redeploy** depois de salvar.
2. **Supabase → Edge Functions → create-subaccount → Details:** "Verify JWT with legacy secret" em **OFF** para evitar 401 por chave legacy.
3. **Supabase → Edge Functions → Secrets:** `ASAAS_MAIN_TOKEN_SANDBOX` com o **mesmo** valor do `access_token` do script (copie do script e cole no secret).

Quando a requisição chega na função, ela chama a Asaas **igual ao script** (mesmo URL, mesmo header `access_token`, mesmo body).

### Erro 403 ao criar subconta (Vercel)

O 403 vem do **gateway do Supabase** (a requisição nem chega na Edge Function). Faça na ordem:

1. **Supabase:** Project Settings → API → copie o **anon public** (chave longa em JWT).
2. **Vercel:** Project → Settings → Environment Variables. Apague `VITE_SUPABASE_ANON_KEY` e `VITE_SUPABASE_URL` e crie de novo:
   - `VITE_SUPABASE_URL` = `https://SEU_PROJETO.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = valor colado do passo 1 (sem espaços no início/fim).
   - Confira se a URL está igual ao projeto (ex.: `hytuyyvjaukdwmdxtd**mi**.supabase.co` — não troque **mi** por **ni**).
3. **Redeploy sem cache:** Deployments → ⋮ no último deploy → **Redeploy** → marque **Clear build cache** → Redeploy.
4. Teste de novo; se ainda der 403, abra o app em uma aba anônima para evitar cache do navegador.

## Uso

- **Apps**: na aba "Apps" são listados os apps (BARBEARIA, SORVETERIA, CLUB). Novos apps podem ser inseridos direto na tabela `public.apps` (code, name).
- **Nova subconta**: escolha o app, ambiente (sandbox/produção), preencha os dados e clique em "Criar subconta". A função cria a subconta na Asaas, gera a chave de API e salva tudo no Supabase.
- **Subcontas**: na aba "Subcontas" aparecem todas as subcontas com ID, e-mail e chave (mascarada). Clique no ID ou na chave para copiar.
- **Excluir subconta**: na aba "Subcontas", o botão "Excluir" tenta:
  - excluir na Asaas via `DELETE /v3/myAccount/` (só funciona para subcontas White Label e sem pendências; a chamada precisa usar a **chave API da própria subconta**)
  - e depois remover o registro do Supabase
  - se falhar excluir na Asaas, você pode escolher remover **somente** do Supabase (`db_only`) para “limpar a lista” do painel.

## Dados salvos (asaas_subaccounts)

- `asaas_subaccount_id`, `asaas_wallet_id`, `api_key`
- `email`, `login_email`, `name`, `cpf_cnpj`, `status`
- `address`, `postal_code`, etc.
- `raw_creation_response`, `raw_key_response` (JSON completo da API)

Vincule no seu app (barbearia, sorveteria, etc.) pelo `app_id` ou pelo `code` do app (consulte a tabela `apps`).
