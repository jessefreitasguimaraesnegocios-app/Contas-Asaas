# Vincular `walletId` e `apiKey` em outro app — pagamentos e split

## Resposta curta

**Sim — em geral funciona**, desde que o outro app use os dados corretos e o mesmo **ambiente** (sandbox ou produção) que a subconta.

---

## O que você precisa guardar e reutilizar

| Dado | Uso típico |
|------|------------|
| **`api_key` da subconta** | Autenticar chamadas à API Asaas **em nome da subconta** (header `access_token` nas requisições). |
| **`walletId` da subconta** | Usar no array **`split`** ao criar cobranças, para repassar valor fixo ou percentual para essa carteira. |
| **Ambiente** | Sandbox → `https://api-sandbox.asaas.com`. Produção → `https://api.asaas.com`. **Não misturar.** |

---

## Carteira principal — recebe o split das subcontas

Nesta configuração, **todas as subcontas** enviam parte do valor (split) para a **conta matriz**. O `walletId` da matriz **muda por ambiente** — use sempre o da mesma base URL da API:

| Ambiente | Base URL | `walletId` da conta principal |
|----------|----------|-------------------------------|
| **Sandbox** | `https://api-sandbox.asaas.com` | `5aab22ca-7a2e-4b6f-b741-8ca8542d2430` |
| **Produção** | `https://api.asaas.com` | `c1c11850-aced-4867-9401-6f25a4cbc2f2` |

- Inclua o UUID correto no array **`split`** ao criar a cobrança (normalmente com a **`api_key` da subconta** que emite o pagamento), com `fixedValue` e/ou `percentualValue` conforme sua regra.
- **Nunca** use o `walletId` de produção em chamadas ao sandbox (e vice-versa).

---

## Secrets no Supabase (Edge Functions)

No projeto **Sub-Contas-Asaas**, os secrets ficam em **Edge Functions → Secrets**. Nomes usados no painel / CLI:

| Secret | Conteúdo |
|--------|----------|
| `ASAAS_MAIN_TOKEN_SANDBOX` | `access_token` da **conta principal** Asaas (sandbox) — mesmo valor que funciona no script local. |
| `ASAAS_MAIN_TOKEN_PRODUCTION` | `access_token` da conta principal (produção). |
| `ASAAS_MAIN_WALLET_ID` | UUID da **carteira da conta principal** em **produção** (split). |
| `ASAAS_MAIN_WALLET_ID_SANDBOX` | UUID da **carteira da conta principal** em **sandbox** (split). |

Costumam existir também (Supabase): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.

**Observações:**

- A coluna **Digest (SHA256)** no painel é só hash do valor para auditoria — o que você grava continua sendo **token ou UUID em texto**, não o hash.
- `create-subaccount` e `list-asaas-subaccounts` leem **`ASAAS_MAIN_TOKEN_*`**. Os **`ASAAS_MAIN_WALLET_ID*`** servem para novas funções (ex.: cobrança com split) ou `Deno.env.get(...)` no mesmo projeto.
- Produção e sandbox: cada secret de carteira deve ter o UUID do **mesmo ambiente** (não trocar).

CLI (após `supabase link`):

```bash
supabase secrets set ASAAS_MAIN_WALLET_ID="UUID_PRODUCAO"
supabase secrets set ASAAS_MAIN_WALLET_ID_SANDBOX="UUID_SANDBOX"
```

---

## Regras práticas

1. **Cobrança da subconta**  
   Se o outro app cria cobranças **com a `api_key` da subconta`**, as operações são da própria subconta.

2. **Split**  
   Ao criar um pagamento, inclua o **`split`** com o `walletId` da subconta (ou de outras carteiras envolvidas), conforme a [documentação de split da Asaas](https://docs.asaas.com/docs/payment-split-overview).

3. **Conta principal vs subconta**  
   Quem **emite** a cobrança define de qual conta sai o “restante” após o split. A doc da Asaas orienta **não** incluir o `walletId` do próprio emissor no split — o valor que sobra fica com quem criou a cobrança.

4. **Chave e carteira coerentes**  
   `api_key` e `walletId` devem ser da **mesma subconta** e do **mesmo ambiente**.

---

## Checklist antes de ir para produção

- [ ] `api_key` preenchida e válida (não vazia).
- [ ] `walletId` copiado da mesma subconta (ex.: resposta da criação da subconta ou listagem).
- [ ] Base URL da API = ambiente correto (sandbox × produção).
- [ ] No painel Asaas: recursos de **split** / integrações habilitados conforme o contrato da conta.
- [ ] Teste com **valor baixo** em sandbox (ou produção controlada) e confira extrato / webhook.

---

## Exemplo de `split` ao criar pagamento (referência)

A estrutura exata pode variar conforme o endpoint (ex.: criar cobrança). Exemplo com **percentual** — troque o `walletId` conforme o ambiente da chamada:

**Sandbox** (`api-sandbox.asaas.com`):

```json
{
  "split": [
    {
      "walletId": "5aab22ca-7a2e-4b6f-b741-8ca8542d2430",
      "percentualValue": 10
    }
  ]
}
```

**Produção** (`api.asaas.com`):

```json
{
  "split": [
    {
      "walletId": "c1c11850-aced-4867-9401-6f25a4cbc2f2",
      "percentualValue": 10
    }
  ]
}
```

*(Ajuste o percentual ou use `fixedValue` conforme o contrato.)*

Consulte sempre a doc oficial:

- [Payment split overview](https://docs.asaas.com/docs/payment-split-overview)
- [Split in single payments](https://docs.asaas.com/docs/split-in-single-payments)
- [Create new payment](https://docs.asaas.com/reference/create-new-payment)

---

## Onde isso aparece neste projeto

- Subcontas criadas pela plataforma gravam no Supabase (`asaas_subaccounts`) campos como `api_key`, `asaas_wallet_id` e `environment`.
- Use esses valores no seu outro app (variáveis de ambiente, banco ou painel de configuração por cliente).
- **`ASAAS_MAIN_WALLET_ID` / `ASAAS_MAIN_WALLET_ID_SANDBOX`** no Supabase centralizam o UUID da matriz para montar `split` sem hardcode no repositório.

---

## Observação de segurança

- Trate **`api_key` como segredo** (não commitar em repositório público, não expor no frontend se o outro app for só backend).
- Se a chave vazar, **revogue e gere outra** no Asaas.
