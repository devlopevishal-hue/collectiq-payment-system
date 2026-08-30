# CollectIQ — Comprehensive User Training Manual & Standard Operating Procedures (SOP)

**Document Classification**: Production Operational Guide & Training Courseware  
**Software Version**: CollectIQ 4.0 Pro  
**Cloud Database Engine**: Google Firebase Firestore (`collectiq-ba467`)  
**Deployment Platform**: GitHub Pages (Global HTTPS Access) / Standalone Desktop Cache  
**PDF Document File**: [`CollectIQ_SOP_and_User_Training_Manual.pdf`](file:///c:/Users/Admin/Documents/Codex/2026-08-17/this-is-my-payment-collection-system/CollectIQ_SOP_and_User_Training_Manual.pdf)

---

## 📑 Table of Contents
1. [Course & System Overview](#1-course--system-overview)
2. [Cloud Architecture & Global Access Details](#2-cloud-architecture--global-access-details)
3. [Master & Staff Accountability Matrix](#3-master--staff-accountability-matrix)
4. [Module 1: Daily Follow-Up Execution & Scheduling](#4-module-1-daily-follow-up-execution--scheduling)
5. [Module 2: Daily Rokad & FIFO Payment Settlement](#5-module-2-daily-rokad--fifo-payment-settlement)
6. [Module 3: GP Lock & Credit Risk Control (19+ Days Overdue)](#6-module-3-gp-lock--credit-risk-control-19-days-overdue)
7. [Module 4: CRM Quality Claims & WhatsApp Dispute Resolution](#7-module-4-crm-quality-claims--whatsapp-dispute-resolution)
8. [Module 5: Periodic Outstanding Report Synchronization](#8-module-5-periodic-outstanding-report-synchronization)
9. [Module 6: Statements, Reports & Excel / PDF Exports](#9-module-6-statements-reports--excel--pdf-exports)
10. [Daily 5-Minute Checklist & FAQ](#10-daily-5-minute-checklist--faq)

---

## 1. Course & System Overview
CollectIQ is a cloud-native receivables management and collection tracking command center designed to eliminate bad debts, automate invoice aging, enforce Followper accountability, and provide seamless FIFO payment settlements.

### Key Business Terminology:
* **Marka**: The primary trading identity/account of the customer (e.g. `ABT`, `KGN`, `SHREE`).
* **Master**: The supervising group or brokerage umbrella under which Markas operate (e.g. `MANISH MASTER`, `KALPESH MASTER`).
* **Followper**: The collection officer designated with primary operational accountability for following up on that account.
* **Policy Date**: The contractual due date of the invoice (e.g. Net 30, 3% Party).
* **Already Due**: Invoices where `Policy Date <= Today`.
* **Daily Rokad**: The official collection cash/bank receipt register where payments are logged and allocated against bills.
* **FIFO Settlement**: First-In, First-Out knock-off where incoming money automatically settles the oldest unpaid invoice first.

---

## 2. Cloud Architecture & Global Access Details
* **Live Global Web Link**: `https://<your-github-username>.github.io/<your-repo-name>/`
* **Cloud Database Project**: `collectiq-ba467` (Google Firebase Firestore)
* **Multi-Device Real-Time Sync**: Whenever any Followper logs a call or enters a payment on their phone, **all other screens update in real-time worldwide** without page refresh.
* **Offline Guarantee**: If internet drops, the system continues running offline via browser storage and syncs back upon reconnection.

---

## 3. Master & Staff Accountability Matrix

| Master Account | Designated Followper | Role & Hierarchy |
| :--- | :--- | :--- |
| **MANISH MASTER** | **Girdharilal** | Primary Collection Specialist $\rightarrow$ Escalates to Sales HOD / Saurav Bhai |
| **RAJESH MASTER** | **Girdharilal** | Primary Collection Specialist $\rightarrow$ Escalates to Sales HOD / Saurav Bhai |
| **RIPTESH / RIPETSH MASTER** | **Girdharilal** | Primary Collection Specialist $\rightarrow$ Escalates to Sales HOD / Saurav Bhai |
| **KUNAL MASTER** | **Mahavir** | Senior Recovery Officer $\rightarrow$ Escalates to Accounts / Management |
| **GUDDU MASTER** | **Mahavir** | Senior Recovery Officer $\rightarrow$ Escalates to Accounts / Management |
| **KALPESH MASTER** | **Sajjan** | Recovery Specialist $\rightarrow$ Escalates to Accounts / Management |
| **BABLU MASTER / BABLU SHERA** | **Surendra** | Field Collection Executive $\rightarrow$ Escalates to CRM / Sales HOD |
| **11 MASTER** | **Girdharilal** | Key Accounts Lead $\rightarrow$ Escalates to Saurav Bhai |

> **To Change Master Assignment**: In the sidebar, click **Marka & Followper** $\rightarrow$ switch to **Master Accountability Master** tab $\rightarrow$ click **Change Followper** on any Master $\rightarrow$ check *Update all existing Markas under this Master* to bulk-transfer existing accounts.

---

## 4. Module 1: Daily Follow-Up Execution & Scheduling

### Daily Operational Steps:
1. Open **Follow-up Schedule** (`#schedule`).
2. Select your name under the **Followper** dropdown filter.
3. Switch between **Due today**, **Overdue**, and **Upcoming** tabs.
4. Click **Update** on the customer row.
5. Verify **Actual follow-up date** (defaults to today's date).
6. Enter **Contact Person** and select **Contact Mode** (Phone call / WhatsApp / Email / In person).
7. Select the **Action Status**:

### Action Status Rules:
* **`Promise to Pay (PTP)`**:
  * *Required*: Expected Amount (₹) and Promise Date.
  * *Rule*: The next follow-up date is automatically locked to the customer's promised payment date.
* **`Payment Delayed` / `Not Responding` / `Dispute`**:
  * Enter conversation notes and set a new follow-up date (default +2 days).
* **`Claim Matter`**:
  * *Required*: Claim / Complaint Number.
  * *Action*: Creates an active dispute ticket in the **CRM Escalations** dashboard.
* **`WhatsApp Complaint`**:
  * *Required*: WhatsApp Complaint Number / Reason.
  * *Action*: Creates an active ticket in **CRM Escalations**.
* **`Escalated`**:
  * *Required*: Select target manager (**Saurav Bhai**, **Sales HOD**, **Accounts**, **CRM**, or **Masters**).
  * *Action*: Account ownership transfers immediately to the selected manager.

---

## 5. Module 2: Daily Rokad & FIFO Payment Settlement

### How FIFO Payment Knock-Off Operates:
1. Navigate to **Daily Rokad** (`#rokad`) $\rightarrow$ click **`+ Record payment`**.
2. Enter:
   * **Received Date**: Date payment was received.
   * **Payment Mode**: Bank transfer / Cheque / UPI / Cash.
   * **Receipt / UTR**: Bank transaction reference.
   * **Total Received (₹)**: Amount received.
   * **Select Marka**: Choose the paying customer.
3. **FIFO Preview**:
   * The oldest due bill is settled first (`SETTLED ✓`).
   * Any remaining amount is applied to subsequent bills (`PART ◐`).
4. Click **Post to Rokad**:
   * Balances update instantly in the cloud.
   * If a balance remains $> 0$, the system automatically reschedules a follow-up in 2 days.

---

## 6. Module 3: GP Lock & Credit Risk Control (19+ Days Overdue)

* **Trigger**: Any Marka whose follow-up is overdue by **19 days or more** is automatically placed in **GP Lock**.
* **Lockdown Rules**:
  1. **Zero Dispatch / Gate Pass Freeze**: Strict freeze on new billings and dispatches.
  2. **Isolated View**: Account is removed from normal schedule and listed in **GP lock list** (`#gplock`).
  3. **Release Protocol**: Requires clearance from **Saurav Bhai** or **Accounts Head** upon payment or written guarantee.

---

## 7. Module 4: CRM Quality Claims & WhatsApp Dispute Resolution

1. Open **CRM Escalations** (`#escalations`).
2. Click **Resolve & Settle** on the open claim.
3. Select Resolution Type: *Discount / Debit Note*, *Goods Return / Credit Note*, *Mutual Settlement*, or *Rejected*.
4. Check the invoice checkboxes to adjust the claim deduction against specific bills.
5. Click **Confirm & Resolve Ticket** $\rightarrow$ invoice balances adjust automatically and an audit entry is logged.

---

## 8. Module 5: Periodic Outstanding Report Synchronization

1. Export fresh outstanding balance report from Tally/BUSY/ERP as CSV.
2. In CollectIQ sidebar, click **Sync outstanding** $\rightarrow$ click **Choose CSV file**.
3. **Zero Data Loss Guarantee**: All past conversation logs, PTP dates, and notes are preserved while updating new bill numbers and current balances.

---

## 9. Module 6: Statements, Reports & Excel / PDF Exports

* **Master 22-Column Collection Register**: Click **Export to Excel** in top header.
* **Customer Bill Statement of Accounts**: Open Marka $\rightarrow$ click **Bills** $\rightarrow$ **Print Statement** (for PDF) or **Excel (Bills)**.
* **Customer Payment Ledger**: Open Marka $\rightarrow$ click **₹ Payments** $\rightarrow$ **Print** or **Export Excel (Ledger)**.

---

## 10. Daily 5-Minute Checklist & FAQ

### Daily Morning Routine for Followpers:
1. [ ] Log into CollectIQ link on your phone/PC.
2. [ ] Check **Control Alert Banner** on Dashboard.
3. [ ] Filter schedule by your name and switch to **Due today**.
4. [ ] Call each party and log actual interactions using the correct **Action Status**.
5. [ ] For payments, notify Accounts or log immediately in **Daily Rokad**.
