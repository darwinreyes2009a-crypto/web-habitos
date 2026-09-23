// Edge Function: push-send
// Envía una notificación push de prueba a todas las suscripciones del usuario.
// POST body: { title?: string, body?: string }
// Requiere secrets: VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY (Dashboard → Edge Functions → Secrets)
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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

    const body = await req.json().catch(() => ({}));

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, subscription')
      .eq('user_id', user.id);
    if (error) throw error;

    webpush.setVapidDetails(
      'mailto:darwin@example.com',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    );

    let sent = 0, failed = 0;
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify({
          title: body.title || 'DailyHub',
          body: body.body || 'Prueba de notificación en segundo plano.',
          tag: 'dailyhub-test',
        }));
        sent++;
      } catch (err) {
        failed++;
        // 404/410 = suscripción caducada → la quitamos
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, sent, failed }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
