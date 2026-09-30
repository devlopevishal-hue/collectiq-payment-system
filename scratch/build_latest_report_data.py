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

    for r_idx, r in enumerate(rows):
        cells = {}
        for c in r.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
            cell_ref = c.get('r')
            col_letters = ''.join([ch for ch in cell_ref if ch.isalpha()])
            col_idx = col_to_idx(col_letters)
            
            t = c.get('t')
            v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
            val = v.text if v is not None else ''
            if t == 's' and val.isdigit() and int(val) < len(shared_strings):
                val = shared_strings[int(val)]
            cells[col_idx] = str(val).strip()

        if r_idx == 0:
            continue

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

print(f"Parsed {len(parsed_rows)} valid bills.")

# Group into Markas
DEFAULT_MASTER_FOLLOWPERS = {
  'MANISH MASTER': 'Girdharilal',
  'RAJESH MASTER': 'Girdharilal',
  'RIPETSH MASTER': 'Girdharilal',
  'RIPTESH MASTER': 'Girdharilal',
  'KUNAL MASTER': 'Mahavir',
  'GUDDU MASTER': 'Mahavir',
  'KALPESH MASTER': 'Sajjan',
  'BABLU MASTER': 'Surendra',
  'BABLU SHERA MASTER': 'Surendra',
  '11': 'Girdharilal'
}

DEFAULT_MASTER_CRR = {
  'BABLU MASTER': 'Ravi Bhai',
  'BABLU SHERA MASTER': 'Ravi Bhai',
  'KALPESH MASTER': 'Ravi Bhai',
  'RAJESH MASTER': 'Nayan Bhai',
  'RIPETSH MASTER': 'Nayan Bhai',
  'RIPTESH MASTER': 'Nayan Bhai',
  'MANISH MASTER': 'Nayan Bhai',
  'KUNAL MASTER': 'Mahendra Bhai',
  'GUDDU MASTER': 'Mahendra Bhai',
  '11': 'Nayan Bhai'
}

def get_followper(m_name, master):
    master_clean = (master or '').strip().upper()
    for k, v in DEFAULT_MASTER_FOLLOWPERS.items():
        if k in master_clean or master_clean in k:
            return v
    return 'Unassigned'

def get_crr(master):
    master_clean = (master or '').strip().upper()
    for k, v in DEFAULT_MASTER_CRR.items():
        if k in master_clean or master_clean in k:
            return v
    return 'Unassigned'

markas_dict = {}
for idx, r in enumerate(parsed_rows):
    m_clean = r['marka'].strip().upper()
    if m_clean not in markas_dict:
        owner = r['collectionPerson'] or get_followper(r['marka'], r['master'])
        crr = get_crr(r['master'])
        markas_dict[m_clean] = {
            'id': f"m_{len(markas_dict) + 1}",
            'marka': r['marka'].strip(),
            'master': r['master'],
            'owner': owner,
            'crr': crr,
            'nextDate': '2026-10-01',
            'lastDate': '',
            'lastStatus': '',
            'remark': 'Outstanding report sync.',
            'ptp': '',
            'expected': 0,
            'history': [],
            'bills': [],
            'escalations': [],
            'fmsTasks': []
        }
    
    markas_dict[m_clean]['bills'].append({
        'id': idx + 1,
        'firstDate': r['billDate'],
        'balance': r['balance'],
        'sourceAmount': r['balance'],
        'billCount': 1,
        'billNos': [r['billNo']] if r['billNo'] else [],
        'policyDate': r['policyDate'],
        'policyName': r['policyName']
    })

markas_list = list(markas_dict.values())
print(f"Generated {len(markas_list)} Markas for latest-report-data.js")

# Write to latest-report-data.js and outputs/latest-report-data.js
js_content = "// Latest Outstanding Receivable Report with Policy Generated Data\n"
js_content += f"// Generated from Desktop Excel at {datetime.now().isoformat()}\n"
js_content += "window.latestReportCases = " + json.dumps(markas_list, indent=2) + ";\n"

with open('latest-report-data.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

with open('outputs/latest-report-data.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print("Saved latest-report-data.js and outputs/latest-report-data.js successfully!")
