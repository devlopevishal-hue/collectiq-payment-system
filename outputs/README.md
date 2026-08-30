# CollectIQ — Marka Collection System v4

Open `index.html` in a modern browser. This is a self-contained working prototype: collection data, Followper assignments, conversations, scheduled actions and Daily Rokad entries persist in the browser.

The outstanding report is loaded as Marka profiles with nested bill details. The interface shows **Marka** and **Master**; Party legal names are not displayed.

## Core Concept: 1 Marka = 1 Follow-up

Each Marka has **one follow-up schedule**. All bills for that Marka are grouped under a single follow-up entry. Click **See Bill Details** to view individual invoices; click **See Conversation History** to view the full timeline.

## Working Rules

- **Unique identity**: Each bill is identified by `Marka + first invoice date + source amount`. At the Marka level, one Marka = one follow-up schedule.
- **Followper assignment**: Use **Marka & Followper** to assign or reassign. The assignment applies to the Marka and carries into new report syncs.
- **Follow-up schedule**: Listed in ascending next-action date. Default next follow-up is **2 days** (always editable); a new imported lead defaults to **tomorrow**. Previous conversations appear as the full history when the lead is opened.
- **GP lock**: At more than 19 overdue days from the scheduled action date, a Marka automatically appears in **GP lock** and follow-up is suspended. Full payment automatically removes it from GP lock.
- **Report sync**: A new report with the same Marka replaces bill balances and retains the complete conversation and follow-up history. It never creates duplicates.
- **Daily Rokad**: Records every received payment. Select the Marka, enter the received amount, and the system automatically settles **oldest bills first (FIFO)**. A full settlement closes the Marka follow-up; a part payment keeps it active and schedules a new follow-up in 2 days.

## Action Statuses

| Status | Behaviour |
|--------|-----------|
| **Promise to Pay** | PTP date is required. Next follow-up date is automatically set to the promise date. |
| **Payment Received** | Full payment recorded via Daily Rokad. |
| **Part Payment** | Partial payment; Marka stays active with follow-up in 2 days. |
| **Payment Delayed** | Standard follow-up continues. |
| **Not Responding** | Standard follow-up continues. |
| **Dispute** | Standard follow-up continues. |
| **Claim Matter** | Quality dispute. Claim/complaint number is required. Auto-escalated to CRM log. |
| **WhatsApp Complaint** | WA complaint number/reason is required. Auto-escalated to CRM log. |
| **Escalated** | Must select escalation target from: Saurav Bhai, Sales HOD, Accounts, CRM, or a Master name. The selected person becomes the new Followper (accountability transfer). |

## Conversation History

Each follow-up entry records: **Followper name**, **Date**, **Action Status**, **Contact Mode**, and conditionally:
- **Promise date** (if PTP)
- **Claim number** (if Claim Matter)
- **WA Complaint number** (if WhatsApp Complaint)
- **Doer / escalated to** (if Escalated)

## CRM Escalation Log

All Claim Matter, WhatsApp Complaint, and Escalated actions are logged in the **CRM Escalations** view with status tracking (Open / Resolved).

## Scoring

Followper activity score: `completed actions × 10`, `PTP actions × 6`, `overdue cases × −4`.

## Filters

All data views have filters for Followper, Master, Marka, amount ranges, follow-up count ranges, and first-invoice date range. Export to Excel is included. Use the PDF button to print/save as PDF.

## Import Format

Export the source report to CSV, then use **Sync outstanding**. Recognised columns are `Marka/Group`, `Bill Date`, `Balance`, `Master` and optional `Collection Person` (Followper).
