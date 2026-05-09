// supabase/functions/anthropic-proxy/index.ts
//
// Forwards Anthropic Messages API calls so the secret API key stays on the
// server (never exposed to the browser). The browser-side ai-service.js
// hits this function with the same body shape it would normally send to
// /v1/messages.
//
// Auth: requires a Supabase auth JWT in the Authorization header. This
// gates the proxy to signed-in users of this project — no anonymous
// internet traffic can spend the key.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const ANTHROPIC_URL     = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    // 1) Verify the caller is a signed-in Supabase user.
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Missing auth token' }, 401);

    const supabaseUrl       = Deno.env.get('SUPABASE_URL')         ?? '';
    const supabaseAnonKey   = Deno.env.get('SUPABASE_ANON_KEY')    ?? '';
    const anthropicApiKey   = Deno.env.get('ANTHROPIC_API_KEY')    ?? '';
    if (!anthropicApiKey)   return json({ error: 'Server missing ANTHROPIC_API_KEY' }, 500);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Invalid auth token' }, 401);

    // 2) Forward the body to Anthropic verbatim, swapping in our key.
    let body;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Body must be JSON' }, 400);
    }

    const anthropicRes = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'content-type':       'application/json',
            'x-api-key':          anthropicApiKey,
            'anthropic-version':  ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
    });

    // 3) Stream the response back as-is so the browser sees Anthropic's
    //    error / usage / content payload exactly as the SDK would.
    const respText = await anthropicRes.text();
    return new Response(respText, {
        status:  anthropicRes.status,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
});

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
}
