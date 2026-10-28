# CollectIQ — Payment Collection, FMS & Receivables Command Center

**CollectIQ** is a high-performance, enterprise-grade payment collection, FMS task adherence, and receivables management system designed for textile, wholesale, and commercial distribution enterprises.

---

## 🚀 How it runs

* **App**: a static web app (this repository), served from GitHub Pages or any static host. Phones can install it (PWA).
* **Live database**: Supabase (Postgres + Realtime), Mumbai region. Setup and the move to logins: [`supabase/README.md`](supabase/README.md).
* **Logins**: Supabase Auth. Each person has their own email and password; passwords are stored hashed by Supabase and never in the app, the repository or the database records.
* **Access**: the database itself only lets people on the staff list (`cq_staff`) read or change anything. Settings and deleting are for admins. The public app key on its own gets nothing.
* **Change log**: every save is written to `cq_audit` by the database (who, when, what changed). Admins see it on the Users page (🕘 Change log). A deleted payment or party is kept there in full.

The office SQLite server (`server.js`, `npm start`) is the old LAN mode and is not used with Supabase.

---

## 👥 Logins and roles

The admin manages logins on **Doer & Access Control** (Users page): create a login, change a role or doer name, reset a password, remove a login. New and reset passwords are shown once, to give to the person; everyone can change their own password after logging in.

You can log in with your full email, the part before @ (e.g. `surendra`) or your doer name.

| Role | Access |
| :--- | :--- |
| **Admin** | Everything, including logins, settings, reversing payments and clearing data |
| **Super Doer** | Full visibility, reports, logins and settings |
| **Accounts / CRM / CRR / PC** | Their department's screens across all parties |
| **Doer** | Own Markas, visits, FMS tasks and help tickets |

Access comes from the role on the staff list only, never from the email or name.

---

## 🏆 Doer Performance Scoring & Task Adherence Engine

The system calculates comprehensive Doer performance in real-time:

$$\text{Overall Score} = (\text{Calls} \times 5) + (\text{Visits} \times 15) + (\text{WhatsApp} \times 5) + (\text{PTP} \times 10) + (\text{FMS On-time} \times 20) + (\text{FMS Delayed} \times 10) + (\text{Help Resolved} \times 15) + (\text{Help Re-plan Cycles} \times 5) + (\text{CRM Settled} \times 15) + \left\lfloor\frac{\text{Collected ₹}}{10000}\right\rfloor - (\text{Overdue} \times 5)$$

* **FMS Milestone Task Adherence**:
  * **1.0 Point**: Task completed on or before the planned milestone date.
  * **0.5 Point**: Task completed after the planned milestone date (Delayed).
* **Help Ticket Lifecycle**:
  * **+5 Points**: Interim follow-up with re-planned next follow-up date (`In Progress`).
  * **+15 Points**: Representative action completed / Ticket marked `DONE ✓`.
* **CRM Claims & Escalations**:
  * **+15 Points**: Claim dispute resolved, lump-sum cover amount allocated, or debit note settled.
* **Field Visits**:
  * **+15 Points**: In-person client meetings logged with outcome.

---

## 📊 Comprehensive Excel Reports & Exports

Every module features 1-click **Excel Export** with formatted dates, INR currency formatting, and complete audit history:

1. **Receivables & Aging Schedule**: 22-column comprehensive collection export (`exportExcel`).
2. **Field Visits Register**: Log of all in-person client visits with outcomes and PTP commitments (`exportVisitsExcel`).
3. **Party-wise Matrix Report**: Party-by-party breakdown of visits, phone calls, WhatsApp messages, and outstanding balances (`exportPartyMatrixExcel`).
4. **Daily Activity Summary**: Doer-by-doer breakdown of today's activities and all-time actions (`exportDailySummaryExcel`).
5. **Flow Management System (FMS)**: Planned vs Actual milestone adherence register (`exportFmsExcel`).
6. **Doer Performance Scorecard & Leaderboard**: Complete ranking and point breakdown across all Doers (`exportDoerAnalysisExcel`).
7. **Help Tickets Register**: Delegation and representative action log (`exportHelpTicketsExcel`).
8. **CRM Escalations Register**: Claims, WhatsApp dispute settlements, and discount records (`exportEscalationsExcel`).
9. **Marka & Master Accountability**: Accountability assignment and balance totals (`exportMarkasExcel` / `exportMastersExcel`).

---

## 💰 Daily Payments Bulk Upload

**⇪ Upload Daily Payments** (header, or the + button on mobile) reads the Sales Payment Performance Report: Party, Party Marka, Policy, Bill Amount, Disc / RD / Claim / TDS Amount, Paid Amount, Days, Master. **⇩ Download format** gives a blank sheet in this layout.

- Each row is matched to a party by **Party Marka + Master** (marka alone only when that name is one party).
- A preview shows every row as Ready, Not found, No amount or Already saved before anything is saved.
- On save, Paid + deductions settle the party's oldest bills first; the Paid Amount is recorded as the payment (with the deductions kept on it). Anything above the dues becomes an advance credit.
- Total and blank rows are skipped. A row already saved for the same party, date and amount is not saved twice, so uploading the same file again is safe.

## ↶ Reversing a payment

A payment entered by mistake (wrong party, wrong amount, entered twice) is reversed by an admin from the party's **Payment Ledger** (↶ Reverse). The bills get back exactly what the payment took, its follow-up lines are removed, and a "Payment Reversed" line records who did it and why. The party and the payment are changed together in one step, and the change log keeps the deleted payment.

When a payment is saved, the party (with its reduced bills) and the payment record are also saved together in one step: both are saved, or neither is.

---

## 🔒 Data isolation
The database lets only logged-in staff in. Within the app:
* **Standard Doers (`role: 'user'`)**: Only see their assigned Markas, their own Field Visits, FMS tasks, Help Tickets (where they are requester, assigned helper, or resolver), and CRM Escalations.
* **Administrators (`role: 'admin'`)**: Have complete visibility across the whole organization and can manage user credentials, master assignments, and imports.
