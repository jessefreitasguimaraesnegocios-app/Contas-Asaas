// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { environment, offset, limit, cpfCnpj, email, name, walletId } = await req.json();

    if (!environment || !["sandbox", "production"].includes(environment)) {
      return new Response(JSON.stringify({ error: "environment (sandbox|production) é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mainToken =
      environment === "production"
        ? Deno.env.get("ASAAS_MAIN_TOKEN_PRODUCTION")
        : Deno.env.get("ASAAS_MAIN_TOKEN_SANDBOX");

    if (!mainToken) {
      return new Response(JSON.stringify({ error: "Token da conta principal não configurado para este ambiente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = environment === "production" ? "https://api.asaas.com" : "https://api-sandbox.asaas.com";
    const params = new URLSearchParams();
    if (offset != null) params.set("offset", String(offset));
    if (limit != null) params.set("limit", String(limit));
    if (cpfCnpj) params.set("cpfCnpj", String(cpfCnpj));
    if (email) params.set("email", String(email));
    if (name) params.set("name", String(name));
    if (walletId) params.set("walletId", String(walletId));

    const url = `${baseUrl}/v3/accounts${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        access_token: mainToken,
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Erro ao listar subcontas no Asaas", details: data }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, environment, result: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

