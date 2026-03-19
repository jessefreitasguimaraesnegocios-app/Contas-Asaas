// @ts-nocheck
// Esta função replica o que o script criar-subconta-sandbox.js faz:
// POST para https://api-sandbox.asaas.com/v3/accounts (ou produção) com header access_token.
// O token vem do secret ASAAS_MAIN_TOKEN_SANDBOX/PRODUCTION — deve ser o MESMO valor
// do access_token do script que já funciona (copie incluindo o $ no início se tiver).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { app_id, environment, ...payload } = await req.json();
    if (!app_id || !environment || !["sandbox", "production"].includes(environment)) {
      return new Response(
        JSON.stringify({ error: "app_id e environment (sandbox|production) são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mainToken = environment === "production"
      ? Deno.env.get("ASAAS_MAIN_TOKEN_PRODUCTION")
      : Deno.env.get("ASAAS_MAIN_TOKEN_SANDBOX");
    if (!mainToken) {
      return new Response(
        JSON.stringify({ error: "Token da conta principal não configurado para este ambiente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = environment === "production" ? "https://api.asaas.com" : "https://api-sandbox.asaas.com";

    const createRes = await fetch(`${baseUrl}/v3/accounts`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", access_token: mainToken },
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        loginEmail: payload.loginEmail ?? payload.email,
        cpfCnpj: payload.cpfCnpj,
        birthDate: payload.birthDate,
        companyType: payload.companyType ?? "MEI",
        phone: payload.phone ?? null,
        mobilePhone: payload.mobilePhone ?? null,
        site: payload.site ?? null,
        incomeValue: payload.incomeValue ?? 25000,
        address: payload.address,
        addressNumber: payload.addressNumber,
        complement: payload.complement ?? null,
        province: payload.province,
        postalCode: payload.postalCode,
        webhooks: payload.webhooks ?? [],
      }),
    });
    const createData = await createRes.json();

    if (!createRes.ok) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar subconta", details: createData }),
        { status: createRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subaccountId = createData.id ?? createData.accountId;
    const walletId = createData.walletId ?? createData.wallet ?? null;

    let apiKey: string | null = null;
    const keyRes = await fetch(`${baseUrl}/v3/accounts/${subaccountId}/accessTokens`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", access_token: mainToken },
      body: JSON.stringify({ name: "Chave principal" }),
    });
    const keyData = await keyRes.json();
    if (keyRes.ok && keyData.apiKey) apiKey = keyData.apiKey;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: row, error } = await supabase.from("asaas_subaccounts").insert({
      app_id,
      environment,
      asaas_subaccount_id: subaccountId,
      asaas_wallet_id: walletId,
      api_key: apiKey ?? "",
      email: createData.email ?? payload.email,
      login_email: payload.loginEmail ?? payload.email,
      name: createData.name ?? payload.name,
      cpf_cnpj: payload.cpfCnpj,
      status: createData.status ?? "PENDING",
      phone: payload.phone,
      mobile_phone: payload.mobilePhone,
      address: payload.address,
      address_number: payload.addressNumber,
      complement: payload.complement,
      province: payload.province,
      postal_code: payload.postalCode,
      city_name: payload.cityName,
      state: payload.state,
      // split + mensalidade (opcao B: por subconta)
      split_percent: payload.splitPercent ?? 0,
      monthly_fee_cents: payload.monthlyFeeCents ?? 0,
      raw_creation_response: createData,
      raw_key_response: keyData,
    }).select(
      "id, asaas_subaccount_id, asaas_wallet_id, api_key, email, name, split_percent, monthly_fee_cents, created_at"
    ).single();

    if (error) {
      return new Response(
        JSON.stringify({ error: "Erro ao salvar no banco", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, subaccount: row }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
