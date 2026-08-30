# CollectIQ — Payment Collection, FMS & Receivables Command Center

**CollectIQ** is a high-performance, enterprise-grade payment collection, FMS task adherence, and receivables management system designed for textile, wholesale, and commercial distribution enterprises.

---

## 🚀 Quick Start & Deployment Guide

### Option 1: Deploy on GitHub & Run with Node.js SQLite Server
```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/collectiq-payment-collection-system.git
cd collectiq-payment-collection-system

# 2. Start the built-in SQLite server (Requires Node.js 22+ - Zero external npm dependencies)
npm start
# or: node server.js
```
* **Local Web Interface**: [http://localhost:3000](http://localhost:3000)
* **Mobile / LAN Access**: Open `http://<SERVER_IP>:3000` (e.g. `http://192.168.1.50:3000`) from any smartphone, tablet, or laptop on your office network.
* **Database Storage**: Stored permanently in SQLite WAL mode at `data/collectiq.db`.

---

### Option 2: Deploy on GitHub Pages (Static / Serverless Mode)
1. Push this repository to GitHub.
2. In GitHub: **Settings** → **Pages** → **Source**: `Deploy from a branch` (`main` / root).
3. The app is live instantly! For multi-device cloud synchronization on GitHub Pages, connect Firebase Firestore in **Setup** → **Cloud Database**.

---

## 👥 Default User Credentials & Role-Based Access Control

All existing Doers and Administrators are pre-configured in SQLite:

| Name / Doer | Email / Username | Password | Role | Access Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Vishal (Admin)** | `devlope.vishal@gmail.com` | `1234` | **Admin** | Full Organization Access & User Control |
| **CollectIQ Admin** | `admin@collectiq.com` | `1234` | **Admin** | Full System & Management Control |
| **Accounts Team** | `accounts@collectiq.com` / `accounts` | `1234` | **User (Accounts)** | Account Verification, FMS-1 & Rokad |
| **CRM Team** | `crm@collectiq.com` / `crm` | `1234` | **User (CRM)** | Customer Claims & CRM Escalations |
| **Sales HOD** | `sales.hod@collectiq.com` / `sales.hod` | `1234` | **User (HOD)** | Sales Escalations & Help Tickets |
| **Surendra** | `surendra@collectiq.com` / `surendra` | `1234` | **User (Doer)** | Own Markas, Visits, FMS & Tickets Only |
| **Mahavir** | `mahavir@collectiq.com` / `mahavir` | `1234` | **User (Doer)** | Own Markas, Visits, FMS & Tickets Only |
| **Girdharilal** | `girdharilal@collectiq.com` / `girdharilal` | `1234` | **User (Doer)** | Own Markas, Visits, FMS & Tickets Only |
| **Sajjan** | `sajjan@collectiq.com` / `sajjan` | `1234` | **User (Doer)** | Own Markas, Visits, FMS & Tickets Only |
| **Anil Sharma** | `anil.sharma@collectiq.com` / `anil` | `1234` | **User (Doer)** | Own Markas, Visits, FMS & Tickets Only |
| **Manish Agarwal** | `manish.agarwal@collectiq.com` / `manish` | `1234` | **User (Doer)** | Own Markas, Visits, FMS & Tickets Only |
| **Ravi Kant Sharma** | `ravi.sharma@collectiq.com` / `ravi` | `1234` | **User (Doer)** | Own Markas, Visits, FMS & Tickets Only |
| **Saurav Bhai** | `saurav@collectiq.com` / `saurav` | `1234` | **User (Doer)** | Own Markas, Visits, FMS & Tickets Only |
| **Bhavesh Bhai** | `bhavesh@collectiq.com` / `bhavesh` | `1234` | **User (Doer)** | Own Markas, Visits, FMS & Tickets Only |
| **Process Coordinator** | `pc@collectiq.com` / `pc` | `1234` | **User (Doer)** | FMS-2 Coordinator & Own Markas |

> **Convenient Login**: You can enter either your full email (e.g. `accounts@collectiq.com`) or simple username (`accounts`) with password `1234`.

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

## 🔒 Strict Data Isolation
* **Standard Doers (`role: 'user'`)**: Only see their assigned Markas, their own Field Visits, FMS tasks, Help Tickets (where they are requester, assigned helper, or resolver), and CRM Escalations.
* **Administrators (`role: 'admin'`)**: Have complete visibility across the whole organization and can manage user credentials, master assignments, and imports.
