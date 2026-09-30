import zipfile
import xml.etree.ElementTree as ET
import json
from datetime import datetime, timedelta

zip_path = r'C:\Users\Admin\Desktop\OUTSTANDING RECEIVABLE REPORT WITH POLICY.xlsx'

with zipfile.ZipFile(zip_path, 'r') as z:
    shared_strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in tree:
            shared_strings.append(''.join(si.itertext()))

    tree = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    rows = tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
    
    print(f"Total rows in sheet1: {len(rows)}")

    def parse_serial_date(val):
        try:
            val = int(val)
            # Excel base date is 1899-12-30
            dt = datetime(1899, 12, 30) + timedelta(days=val)
            return dt.strftime('%Y-%m-%d')
        except:
            return ''

    def col_to_idx(col_str):
        idx = 0
        for ch in col_str:
            idx = idx * 26 + (ord(ch) - ord('A') + 1)
        return idx - 1

    parsed_rows = []
    headers = []

    for r_idx, r in enumerate(rows):
        cells = {}
        for c in r.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
            cell_ref = c.get('r') # e.g. A1, B2
            col_letters = ''.join([ch for ch in cell_ref if ch.isalpha()])
            col_idx = col_to_idx(col_letters)
            
            t = c.get('t')
            v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
            val = v.text if v is not None else ''
            if t == 's' and val.isdigit() and int(val) < len(shared_strings):
                val = shared_strings[int(val)]
            cells[col_idx] = str(val).strip()

        if r_idx == 0:
            max_c = max(cells.keys()) if cells else 21
            headers = [cells.get(ci, f'col_{ci}') for ci in range(max_c + 1)]
            print("Headers:", headers)
            continue

        # Data rows
        # Column 1: Party, Column 2: Marka, Column 3: Bill Date, Column 4: Bill No, Column 14: Balance, Column 17: Master, Column 18: Collection Person, Column 20: Policy Date, Column 21: Policy Name
        marka = cells.get(2, '') or cells.get(1, '')
        if not marka or marka.lower() == 'total' or 'total' in marka.lower():
            continue
        
        balance_str = cells.get(14, '0')
        try:
            balance = float(balance_str)
        except:
            continue

        bill_date_raw = cells.get(3, '')
        bill_date = parse_serial_date(bill_date_raw) if bill_date_raw.isdigit() else bill_date_raw
        
        policy_date_raw = cells.get(20, '')
        policy_date = parse_serial_date(policy_date_raw) if policy_date_raw.isdigit() else (policy_date_raw or bill_date)
        
        bill_no = cells.get(4, '')
        master = cells.get(17, 'Unassigned Master')
        collection_person = cells.get(18, '')
        policy_name = cells.get(21, 'NET')

        parsed_rows.append({
            'party': cells.get(1, ''),
            'marka': marka,
            'billDate': bill_date,
            'billNo': bill_no,
            'balance': balance,
            'master': master,
            'collectionPerson': collection_person,
            'policyDate': policy_date,
            'policyName': policy_name
        })

print(f"Total valid bill rows parsed: {len(parsed_rows)}")

# Group by Marka
marka_groups = {}
for row in parsed_rows:
    m = row['marka'].strip().upper()
    if m not in marka_groups:
        marka_groups[m] = {
            'marka': row['marka'].strip(),
            'master': row['master'],
            'owner': row['collectionPerson'] or 'Unassigned',
            'bills': []
        }
    marka_groups[m]['bills'].append({
        'billNo': row['billNo'],
        'firstDate': row['billDate'],
        'policyDate': row['policyDate'],
        'policyName': row['policyName'],
        'sourceAmount': row['balance'],
        'balance': row['balance']
    })

print(f"Total unique Markas: {len(marka_groups)}")
san_data = marka_groups.get('SAN')
if san_data:
    print(f"SAN Bills: {len(san_data['bills'])}, Total Balance: {sum(b['balance'] for b in san_data['bills'])}")
    for b in san_data['bills']:
        print(f"  Bill No: {b['billNo']} | Date: {b['firstDate']} | Policy Due: {b['policyDate']} | Bal: {b['balance']}")
