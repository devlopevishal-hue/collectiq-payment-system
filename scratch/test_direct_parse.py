import json

with open('app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# Let's extract the functions: parseAmount, parseCsvDate, processImportedRows
# and test them with Python directly!

def parse_amount(val):
    if isinstance(val, (int, float)):
        return float(val)
    if not val:
        return 0.0
    clean = str(val).replace('₹', '').replace(' ', '').replace("'", '').replace('"', '').strip()
    clean = clean.replace(',', '')
    try:
        return float(clean)
    except:
        return 0.0

def parse_csv_date(s):
    if not s:
        return ''
    s = str(s).strip()
    if len(s) == 10 and s[4] == '-' and s[7] == '-':
        return s
    parts = s.replace('/', '-').replace('.', '-').split('-')
    if len(parts) == 3:
        p1, p2, p3 = parts
        n1, n2, n3 = int(p1), int(p2), int(p3)
        if n3 < 100:
            n3 += 2000
        # DD-MM-YYYY
        return f"{n3:04d}-{n2:02d}-{n1:02d}"
    return ''

sample_grid = [
  ["Book", "Party", "Marka/Grou\np", "Bill Date", "Bill No", "TO DAYS", "Days", "Gross Amt", "Taxable\nAmt", "Bill Amt", "Dr Amt", "Cr Amt", "Part", "Paid", "Balance", "Acc +\nAddress", "Agent", "Master", "Collection\nPerson", "Month", "PolicyDa\nte", "PolicyNam\ne"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "21/07/26", "14674", "dd/MM/yyyy", "71", "21022.65", "20391.87", "21412.00", "0.00", "0.00", "0.00", "0.00", "21412.00", "ANNAPURNA", "", "KALPESHMAS", "", "July", "01/10/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "21/08/26", "20003", "dd/MM/yyyy", "40", "21022.65", "20391.87", "21412.00", "0.00", "0.00", "0.00", "0.00", "21412.00", "ANNAPURNA", "", "KALPESHMAS", "", "August", "01/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "21/08/26", "20185", "dd/MM/yyyy", "40", "22585.05", "21907.50", "23003.00", "0.00", "0.00", "0.00", "0.00", "23003.00", "ANNAPURNA", "", "KALPESHMAS", "", "August", "01/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "21/08/26", "20186", "dd/MM/yyyy", "40", "10192.80", "9887.02", "10381.00", "0.00", "0.00", "0.00", "0.00", "10381.00", "ANNAPURNA", "", "KALPESHMAS", "", "August", "01/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "02/09/26", "22352", "dd/MM/yyyy", "28", "23813.60", "23099.18", "24254.00", "0.00", "0.00", "0.00", "0.00", "24254.00", "ANNAPURNA", "", "KALPESHMAS", "", "September", "16/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "02/09/26", "22353", "dd/MM/yyyy", "28", "24390.40", "23658.68", "24842.00", "0.00", "0.00", "0.00", "0.00", "24842.00", "ANNAPURNA", "", "KALPESHMAS", "", "September", "16/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "02/09/26", "22354", "dd/MM/yyyy", "28", "12020.10", "11659.50", "12242.00", "0.00", "0.00", "0.00", "0.00", "12242.00", "ANNAPURNA", "", "KALPESHMAS", "", "September", "16/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "05/09/26", "22765", "dd/MM/yyyy", "25", "24071.10", "23348.97", "24516.00", "0.00", "0.00", "0.00", "0.00", "24516.00", "ANNAPURNA", "", "KALPESHMAS", "", "September", "16/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "08/09/26", "23359", "dd/MM/yyyy", "22", "11711.10", "11359.77", "11928.00", "0.00", "0.00", "0.00", "0.00", "11928.00", "ANNAPURNA", "", "KALPESHMAS", "", "September", "16/11/26", "3% PARTY"]
]

headers = [h.lower().replace('\n', '').replace(' ', '').replace('/', '').replace('+', '').replace('-', '') for h in sample_grid[0]]
print('Cleaned headers:', headers)

rows_to_process = []
for line in sample_grid[1:]:
    row_obj = {}
    for col_idx, h in enumerate(headers):
        row_obj[h] = line[col_idx] if col_idx < len(line) else ''
    row_obj['_rawLine'] = line
    rows_to_process.append(row_obj)

print(f"Processed {len(rows_to_process)} rows.")
marka_map = {}

for raw_row in rows_to_process:
    marka_name = raw_row.get('markagroup') or raw_row.get('marka') or raw_row.get('party') or ''
    bill_date = parse_csv_date(raw_row.get('billdate'))
    balance = parse_amount(raw_row.get('balance'))
    bill_no = str(raw_row.get('billno') or '').strip()
    policy_date = parse_csv_date(raw_row.get('policydate')) or bill_date
    policy_name = raw_row.get('policyname') or 'NET'
    master = raw_row.get('master') or 'Unassigned'
    
    if marka_name not in marka_map:
        marka_map[marka_name] = {'marka': marka_name, 'master': master, 'bills': []}
    
    marka_map[marka_name]['bills'].append({
        'firstDate': bill_date,
        'balance': balance,
        'billNos': [bill_no],
        'policyDate': policy_date,
        'policyName': policy_name
    })

for m_name, data in marka_map.items():
    print(f"Marka: {m_name}, Bills: {len(data['bills'])}, Total: {sum(b['balance'] for b in data['bills'])}")
    for b in data['bills']:
        print(f"  Bill No: {b['billNos'][0]}, Date: {b['firstDate']}, PolicyDate: {b['policyDate']}, Balance: {b['balance']}")
