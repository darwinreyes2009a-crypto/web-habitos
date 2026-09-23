// Edge Function: push-subscribe
// Guarda la suscripción Web Push del usuario autenticado.
// Se llama desde la app con el header Authorization del usuario.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'sin sesión' }), { status: 401, headers: cors });

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'sin sesión' }), { status: 401, headers: cors });

    const sub = await req.json();
    if (!sub?.endpoint) return new Response(JSON.stringify({ error: 'suscripción inválida' }), { status: 400, headers: cors });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await admin
      .from('push_subscriptions')
      .upsert({ user_id: user.id, endpoint: sub.endpoint, subscription: sub }, { onConflict: 'endpoint' });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
