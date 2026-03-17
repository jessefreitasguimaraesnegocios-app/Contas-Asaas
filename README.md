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
   ```bash
   supabase secrets set ASAAS_MAIN_TOKEN_SANDBOX="$aact_hmlg_..."
   supabase secrets set ASAAS_MAIN_TOKEN_PRODUCTION="$aact_prod_..."
   ```
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

## Uso

- **Apps**: na aba "Apps" são listados os apps (BARBEARIA, SORVETERIA, CLUB). Novos apps podem ser inseridos direto na tabela `public.apps` (code, name).
- **Nova subconta**: escolha o app, ambiente (sandbox/produção), preencha os dados e clique em "Criar subconta". A função cria a subconta na Asaas, gera a chave de API e salva tudo no Supabase.
- **Subcontas**: na aba "Subcontas" aparecem todas as subcontas com ID, e-mail e chave (mascarada). Clique no ID ou na chave para copiar.

## Dados salvos (asaas_subaccounts)

- `asaas_subaccount_id`, `asaas_wallet_id`, `api_key`
- `email`, `login_email`, `name`, `cpf_cnpj`, `status`
- `address`, `postal_code`, etc.
- `raw_creation_response`, `raw_key_response` (JSON completo da API)

Vincule no seu app (barbearia, sorveteria, etc.) pelo `app_id` ou pelo `code` do app (consulte a tabela `apps`).
