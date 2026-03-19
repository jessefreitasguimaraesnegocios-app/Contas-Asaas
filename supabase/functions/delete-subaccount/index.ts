// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DeleteMode = "asaas_and_db" | "db_only";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { id, mode, removeReason } = await req.json();
    const deleteMode: DeleteMode = mode ?? "asaas_and_db";

    if (!id) {
      return new Response(JSON.stringify({ error: "id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: row, error: loadErr } = await supabase
      .from("asaas_subaccounts")
      .select("id, environment, api_key, asaas_subaccount_id")
      .eq("id", id)
      .single();

    if (loadErr || !row) {
      return new Response(JSON.stringify({ error: "Subconta não encontrada", details: loadErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = row.environment === "production" ? "https://api.asaas.com" : "https://api-sandbox.asaas.com";

    let asaasResult: any = null;
    if (deleteMode === "asaas_and_db") {
      if (!row.api_key) {
        return new Response(JSON.stringify({ error: "api_key da subconta não está salva; use mode=db_only" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const qs = removeReason ? `?removeReason=${encodeURIComponent(removeReason)}` : "";
      const asaasRes = await fetch(`${baseUrl}/v3/myAccount/${qs}`, {
        method: "DELETE",
        headers: {
          accept: "application/json",
          access_token: row.api_key,
        },
      });
      asaasResult = await asaasRes.json().catch(() => ({}));
      if (!asaasRes.ok) {
        return new Response(
          JSON.stringify({
            error: "Erro ao excluir na Asaas",
            details: asaasResult,
            hint:
              "A Asaas só permite excluir via API subcontas White Label e sem pendências (saldo/cobranças/saques/etc). Se for só limpar do painel, use mode=db_only.",
          }),
          { status: asaasRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { error: delErr } = await supabase.from("asaas_subaccounts").delete().eq("id", id);
    if (delErr) {
      return new Response(JSON.stringify({ error: "Erro ao excluir do banco", details: delErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, deletedId: id, asaas: asaasResult }), {
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

