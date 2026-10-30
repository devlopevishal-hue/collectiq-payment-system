// Read-only export of CollectIQ for the "Payment Collection Scoring" Google
// Sheet. The sheet's Apps Script calls this every few minutes and rewrites its
// tabs from the reply. It never changes any data.
//
// GET with header  x-sheet-key: <SHEET_EXPORT_KEY>
// (the key is an Edge Function secret; set it in Supabase, paste the same key
// into the sheet's script).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import '../../../sheet-export.js';

const SheetExport = (globalThis as any).SheetExport;
const COLLECTIONS = ['collectiq_markas', 'collectiq_payments', 'collectiq_help_tickets', 'collectiq_config'];

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Today in India, where the team works.
function todayIst() {
  return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
}

Deno.serve(async req => {
  if (req.method !== 'GET') return reply(405, { error: 'Use GET.' });
  const expected = Deno.env.get('SHEET_EXPORT_KEY') || '';
  const given = req.headers.get('x-sheet-key') || '';
  if (!expected || given !== expected) return reply(401, { error: 'Wrong or missing sheet key.' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const docs: Record<string, unknown[]> = {};
  for (const c of COLLECTIONS) docs[c] = [];
  // Page through so a growing table never gets cut at the API row limit.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('cq_docs').select('collection, data').in('collection', COLLECTIONS).order('id').range(from, from + 999);
    if (error) return reply(500, { error: error.message });
    data.forEach((d: { collection: string; data: unknown }) => docs[d.collection].push(d.data));
    if (data.length < 1000) break;
  }

  const url = new URL(req.url);
  const scoreFrom = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('scoreFrom') || '') ? url.searchParams.get('scoreFrom') : undefined;
  return reply(200, SheetExport.buildSheet({
    markas: docs.collectiq_markas,
    payments: docs.collectiq_payments,
    helpTickets: docs.collectiq_help_tickets,
    config: docs.collectiq_config[0] || {},
    today: todayIst(),
    scoreFrom
  }));
});
