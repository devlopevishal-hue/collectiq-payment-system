"""
build_report_data.py — CollectIQ v4 ETL
Reads the source Excel outstanding report and outputs latest-report-data.js
in the new two-tier MarkaProfile format (1 Marka = 1 profile with nested bills).
"""
import json
import math
import pandas as pd

source = r"C:\Users\Admin\Downloads\OUTSTANDING RECEIVABLE REPORT WITH POLICY 01-09-2026.xls"
target = r"C:\Users\Admin\Documents\Codex\2026-08-17\this-is-my-payment-collection-system\outputs\latest-report-data.js"

# ── Read and clean ──────────────────────────────────────────
df = pd.read_excel(source)
df['Balance'] = pd.to_numeric(df['Balance'], errors='coerce').fillna(0)
df = df[df['Balance'] > 0].copy()
df['Bill Date'] = pd.to_datetime(df['Bill Date'], errors='coerce')

# ── Group by Marka/Group → then by Bill Date (individual bills) ──
marka_profiles = []
bill_id_counter = 1

for marka_name, marka_group in df.groupby('Marka/Group', dropna=False):
    marka_name = str(marka_name).strip() if not pd.isna(marka_name) else 'UNMAPPED'

    # Determine master and followper from first row
    first_row = marka_group.iloc[0]
    master = str(first_row.get('Master') or 'Unassigned Master').strip()

    followper_values = marka_group['Collection Person'].dropna().astype(str).str.strip()
    followper = followper_values.iloc[0] if len(followper_values) else 'Unassigned'

    # Build bills array (one bill per unique Bill Date)
    bills = []
    for bill_date, bill_group in marka_group.groupby('Bill Date', dropna=False):
        bill_first = bill_group.iloc[0]
        policy_date = pd.to_datetime(bill_first.get('PolicyDate'), errors='coerce')
        bill_numbers = [
            str(int(value)) if not pd.isna(value) else ''
            for value in bill_group['Bill No']
        ]
        balance = round(float(bill_group['Balance'].sum()), 2)

        bills.append({
            'id': bill_id_counter,
            'firstDate': bill_date.strftime('%Y-%m-%d') if not pd.isna(bill_date) else '',
            'balance': balance,
            'sourceAmount': balance,
            'billCount': int(len(bill_group)),
            'billNos': bill_numbers,
            'policyDate': policy_date.strftime('%Y-%m-%d') if not pd.isna(policy_date) else '',
            'policyName': str(bill_first.get('PolicyName') or '').strip(),
        })
        bill_id_counter += 1

    # Sort bills by date ascending (oldest first)
    bills.sort(key=lambda b: b['firstDate'])

    # Compute summary fields
    total_outstanding = sum(b['balance'] for b in bills)
    oldest_due = bills[0]['firstDate'] if bills else ''
    today_str = '2026-09-01'  # import date — app uses real today

    marka_profiles.append({
        'id': f"m{len(marka_profiles)+1}",
        'marka': marka_name,
        'master': master,
        'owner': followper,
        'nextDate': today_str,
        'lastDate': '',
        'lastStatus': '',
        'remark': 'Imported from Outstanding Receivable Report dated 01-Sep-2026.',
        'ptp': '',
        'expected': 0,
        'history': [],
        'bills': bills,
        'escalations': [],
    })

# ── Write output ────────────────────────────────────────────
with open(target, 'w', encoding='utf-8') as out:
    out.write('window.latestReportCases = ')
    json.dump(marka_profiles, out, ensure_ascii=False, separators=(',', ':'))
    out.write(';\n')

total_bills = sum(len(m['bills']) for m in marka_profiles)
total_outstanding = sum(
    sum(b['balance'] for b in m['bills'])
    for m in marka_profiles
)
print(f'Created {len(marka_profiles)} Marka profiles with {total_bills} bills')
print(f'Total outstanding: ₹{total_outstanding:,.2f}')
print(f'Output: {target}')
