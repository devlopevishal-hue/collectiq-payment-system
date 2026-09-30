import io

sample_data = [
    {
        'Book': 'BANK RECEIP',
        'Party': 'FASHION ROY',
        'Marka/Grou\np': 'JGG',
        'Bill Date': '18/09/26',
        'Bill No': '3194',
        'TO DAYS': 'ddMMyyyy',
        'Days': '12',
        'Gross Amt': '0.00',
        'Taxable\nAmt': '0.00',
        'Bill Amt': '0.00',
        'Dr Amt': '0.00',
        'Cr Amt': '0.00',
        'Part': '1117925.00',
        'Paid': '0.00',
        'Balance': '-1,117,925.00',
        'Acc + Address': 'FASHION ROY',
        'Agent': '',
        'Master': 'BABLU SHERA',
        'Collection Person': '',
        'Month': 'September',
        'PolicyDa\nte': '',
        'PolicyNam\ne': ''
    },
    {
        'Book': 'JOB BILLING',
        'Party': 'AARUSH EXP',
        'Marka/Grou\np': 'MAU',
        'Bill Date': '17/02/26',
        'Bill No': '45859',
        'TO DAYS': 'ddMMyyyy',
        'Days': '225',
        'Gross Amt': '33396.00',
        'Taxable\nAmt': '32394.12',
        'Bill Amt': '34014.00',
        'Dr Amt': '0.00',
        'Cr Amt': '0.00',
        'Part': '0.00',
        'Paid': '0.00',
        'Balance': '34,014.00',
        'Acc + Address': 'AARUSH EXP',
        'Agent': '',
        'Master': 'BABLU SHERA',
        'Collection Person': '',
        'Month': 'February',
        'PolicyDa\nte': '01/05/26',
        'PolicyNam\ne': '3% PARTY'
    }
]

def parse_amount(val):
    if not val: return 0.0
    clean = str(val).replace('₹', '').replace(' ', '').replace(',', '').replace("'", "").replace('"', '').strip()
    try:
        return float(clean)
    except:
        return 0.0

def clean_key(k):
    import re
    return re.sub(r'[\s\-_/\\+.\r\n]+', '', k.lower().strip())

for i, raw_row in enumerate(sample_data):
    row = {clean_key(k): v for k, v in raw_row.items()}
    marka_name = (
        row.get('markagroup') or row.get('marka') or row.get('group') or row.get('party') or ''
    ).strip()
    bill_no = str(row.get('billno') or '').strip()
    bill_date = str(row.get('billdate') or '').strip()
    balance = parse_amount(row.get('balance'))
    master = str(row.get('master') or 'Unassigned Master').strip()
    policy_date = str(row.get('policydate') or bill_date).strip()
    policy_name = str(row.get('policyname') or 'NET').strip()

    print(f'Item {i}:')
    print('  Marka:', marka_name)
    print('  Bill No:', bill_no)
    print('  Bill Date:', bill_date)
    print('  Balance:', balance)
    print('  Master:', master)
    print('  Policy Date:', policy_date)
    print('  Policy Name:', policy_name)
