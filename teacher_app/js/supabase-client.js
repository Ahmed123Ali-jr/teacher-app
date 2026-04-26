/**
 * Supabase client — single shared instance for the whole app.
 * The publishable key is safe to ship in the browser; RLS policies
 * + auth tokens enforce access control.
 */
(function (global) {
    'use strict';

    const SUPABASE_URL = 'https://rbsfpsmolxldmwcclhlc.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_z5RQ0LotgRBWRSUXjTz38w_GOyBOhUX';

    if (!global.supabase || !global.supabase.createClient) {
        console.error('[Supabase] SDK not loaded. Make sure the CDN <script> tag is in index.html.');
        return;
    }

    const client = global.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storage: global.localStorage,
            storageKey: 'teacher-app-auth'
        }
    });

    global.SB = client;
})(window);
