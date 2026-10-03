// System prompt and tool definitions for the CollectIQ AI Assistant.
// Tool names must stay identical to the keys of `tools` in ../ai-tools.js.

const FORM_STATUSES = ['Payment Received', 'Promise to Pay', 'WhatsApp Complaint / Claim Matter', 'Internal Help Ticket'];
const FORM_MODES = ['Phone call', 'WhatsApp', 'Email', 'In person (Field Visit)'];
// Same lists as ../ticket-actions.js (copied: this server is deployed on its own).
const PRIORITIES = ['Normal', 'High', 'Critical'];
const RESOLUTION_TYPES = [
  'Physical Field Visit & Discussion Completed',
  'Statement Signed & Verified with Master',
  'Cheque / Payment Collected',
  'PDC / Online Payment Commitment Secured',
  'Payment / Accounts Reconciled',
  'Master Meeting Conducted',
  'Other Representative Action'
];

function buildSystemPrompt({ name, role, today } = {}) {
  return [
    'You are the CollectIQ AI Assistant for a textile company\'s payment-collection team.',
    `Current user: ${name || 'Unknown'} (role: ${role || 'unknown'}). Today is ${today || 'unknown'}.`,
    '',
    'Rules:',
    '- Reply in the same language and script the user writes in. If the user writes Hindi in Roman letters (Hinglish, e.g. "aaj kisko call karun"), reply in Roman-script Hinglish, never in Devanagari. Use Devanagari only if the user writes in Devanagari. Be short, polite and professional.',
    '- Tool lists are already sorted and each row has a "rank". Keep exactly that order, start from rank 1 and never skip ranks.',
    '- Tool results give amounts as ready-made text like "₹10,43,80,733". Copy them exactly as given; never re-format, round or recalculate them.',
    '- In doer rows, "overdue" is a count of parties whose follow-up date has passed, and "balance" is the total amount of that doer\'s parties.',
    '- For prepare_followup_form, fill contact_mode, expected, next_date only if the user said them; otherwise leave them out.',
    '- Never invent numbers, party names or dates. Use only what the tools return. If a tool has no data, say so plainly.',
    '- Use tools whenever the question is about parties, bills, follow-ups, PTPs, payments, tickets or performance.',
    '- If a tool returns "candidates", ask the user which party they mean.',
    '- If a tool says the user cannot see something, politely explain they can only see their own parties.',
    '- Only help with collection work. Politely decline unrelated requests in one line.',
    '- When asked for a WhatsApp or reminder message, first get the party details, then put only the message text inside a block that starts with ```draft and ends with ```. Keep it respectful, mention the amount due and the oldest due date, and do not threaten.',
    '- When the user reports a conversation outcome (promise, payment, complaint), call prepare_followup_form. Tell the user to press "Open form", check the details and press Save themselves. You never save anything.',
    '- Help tickets: before acting on an existing ticket, call find_tickets. For any ticket change (new ticket, in progress, done, reassign) call prepare_ticket_action. You never create or change a ticket yourself: never say it was created or changed. Tell the user to check the card and press Confirm.',
    '- If prepare_ticket_action returns "candidates" or a "suggestion", ask the user which one they mean. Do not guess the helper or next date; ask if the user did not say them (priority may default to Normal).',
    '- Lists: show at most the top 10 lines and mention how many more exist.'
  ].join('\n');
}

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } }
});

const TOOL_SCHEMAS = [
  fn('get_today_followups', 'Parties whose follow-up is due today or overdue (and GP-locked parties), within the user\'s own scope, highest already-due amount first.', {
    include_overdue: { type: 'boolean', description: 'false = only parties due exactly today. Default true.' }
  }),
  fn('get_broken_ptps', 'Parties whose promise-to-pay date has passed without any payment since the promise was logged.'),
  fn('get_party_details', 'Full picture of one party (marka): outstanding, already due, oldest bills, last conversations, open complaints and help tickets.', {
    name: { type: 'string', description: 'Party / marka name, e.g. JGG' }
  }, ['name']),
  fn('search_parties', 'Find parties by master, followper, minimum outstanding, minimum days past due, or GP lock.', {
    master: { type: 'string' },
    owner: { type: 'string', description: 'Followper / doer name' },
    min_outstanding: { type: 'number', description: 'Rupees' },
    min_days_overdue: { type: 'number', description: 'Days since the oldest unpaid bill was due' },
    gp_locked: { type: 'boolean' }
  }),
  fn('get_collections', 'Payments received in a date range, with totals per doer and the biggest receipts.', {
    from: { type: 'string', description: 'YYYY-MM-DD, default today' },
    to: { type: 'string', description: 'YYYY-MM-DD, default same as from' }
  }),
  fn('get_doer_performance', 'Doer scorecard (calls, visits, WhatsApp, PTPs, FMS, help, CRM, collected, overdue, score) using the Analysis page formula.', {
    name: { type: 'string', description: 'Doer name; omit for the full ranking' }
  }),
  fn('get_pending_work', 'Open help tickets assigned to the user and, for PC/admin, pending FMS milestones.'),
  fn('prepare_followup_form', 'Prepare (not save) a follow-up entry. The app opens its own follow-up form pre-filled so the user can check and save.', {
    party: { type: 'string', description: 'Party / marka name' },
    status: { type: 'string', enum: FORM_STATUSES },
    contact_mode: { type: 'string', enum: FORM_MODES },
    expected: { type: 'number', description: 'Expected amount in rupees' },
    promise_date: { type: 'string', description: 'YYYY-MM-DD, required for Promise to Pay' },
    next_date: { type: 'string', description: 'YYYY-MM-DD next follow-up date' },
    remark: { type: 'string', description: 'Conversation summary' }
  }, ['party', 'status']),
  fn('find_tickets', 'List help tickets (id, party, subject, helper, requester, priority, status, next date), newest first. Use it before acting on an existing ticket.', {
    marka: { type: 'string', description: 'Party / marka name to filter by' },
    status: { type: 'string', enum: ['open', 'all'], description: 'open (default) = not resolved; all = include resolved' },
    mine: { type: 'boolean', description: 'Only tickets the current user requested, is assigned to, or resolved' }
  }),
  fn('prepare_ticket_action', 'Prepare (not save) a help ticket change. The chat shows a card; nothing is saved until the user presses Confirm.', {
    op: { type: 'string', enum: ['create', 'progress', 'done', 'reassign'], description: 'create = new ticket; progress = in-progress update with next date; done = mark resolved; reassign = change helper (admin/superuser only)' },
    marka: { type: 'string', description: 'Party / marka name. Optional for create (none = General ticket); for other ops it picks that party\'s only open ticket.' },
    ticket_id: { type: 'string', description: 'Ticket id from find_tickets (progress, done, reassign)' },
    helper: { type: 'string', description: 'Person to assign to (create, reassign)' },
    priority: { type: 'string', enum: PRIORITIES },
    subject: { type: 'string', description: 'Short ticket subject (create)' },
    note: { type: 'string', description: 'Remark / what happened' },
    next_date: { type: 'string', description: 'YYYY-MM-DD next follow-up date (progress)' },
    resolution_type: { type: 'string', enum: RESOLUTION_TYPES, description: 'What was done (done)' }
  }, ['op'])
];

module.exports = { buildSystemPrompt, TOOL_SCHEMAS };
