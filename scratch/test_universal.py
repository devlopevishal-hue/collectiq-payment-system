import re

def test_universal_extractor(raw_input):
    # Simulate both array of objects and array of arrays
    extracted_markas = []
    
    # 1. Convert to normalized rows
    if isinstance(raw_input, list) and len(raw_input) > 0 and isinstance(raw_input[0], list):
        # 2D Array format
        # Find header row
        header_row_idx = -1
        for idx, row in enumerate(raw_input[:10]):
            row_str = ' '.join(str(c).lower() for c in row if c)
            if any(k in row_str for k in ['marka', 'party', 'balance', 'bill', 'amount', 'ledger', 'master']):
                header_row_idx = idx
                break
        
        if header_row_idx == -1:
            header_row_idx = 0
            
        raw_headers = [str(c or '').strip() for c in raw_input[header_row_idx]]
        clean_headers = [re.sub(r'[^a-z0-9]', '', h.lower()) for h in raw_headers]
        
        data_rows = raw_input[header_row_idx + 1:]
    elif isinstance(raw_input, list) and len(raw_input) > 0 and isinstance(raw_input[0], dict):
        clean_headers = []
        data_rows = raw_input
    else:
        return []

    # Process rows
    for r in data_rows:
        row_dict = {}
        if isinstance(r, list):
            for i, val in enumerate(r):
                if i < len(clean_headers) and clean_headers[i]:
                    row_dict[clean_headers[i]] = val
                else:
                    row_dict[f'col_{i}'] = val
        elif isinstance(r, dict):
            for k, v in r.items():
                if k:
                    ck = re.sub(r'[^a-z0-9]', '', str(k).lower())
                    row_dict[ck] = v
        
        # Extract Marka / Party
        marka = (
            row_dict.get('markagroup') or row_dict.get('markagrou') or row_dict.get('marka') or
            row_dict.get('group') or row_dict.get('party') or row_dict.get('partyname') or
            row_dict.get('accaddress') or row_dict.get('customername') or row_dict.get('particulars') or ''
        )
        if isinstance(marka, str): marka = marka.strip()
        
        # If still empty, check positional columns if r was list
        if not marka and isinstance(r, list) and len(r) > 2:
            # check col 2 (Marka) or col 1 (Party)
            if r[2] and str(r[2]).strip():
                marka = str(r[2]).strip()
            elif r[1] and str(r[1]).strip():
                marka = str(r[1]).strip()
                
        if marka:
            extracted_markas.append(marka)
            
    return extracted_markas

# Test with 2D array representation of user's Excel
excel_2d = [
    ['Book', 'Party', 'Marka/Grou\np', 'Bill Date', 'Bill No', 'TO DAYS', 'Days', 'Gross Amt', 'Taxable\nAmt', 'Bill Amt', 'Dr Amt', 'Cr Amt', 'Part', 'Paid', 'Balance', 'Acc + Address', 'Agent', 'Master', 'Collection Person', 'Month', 'PolicyDa\nte', 'PolicyNam\ne'],
    ['BANK RECEIP', 'FASHION ROY', 'JGG', '18/09/26', '3194', 'ddMMyyyy', 12, 0.00, 0.00, 0.00, 0.00, 0.00, 1117925.00, 0.00, -1117925.00, 'FASHION ROY', '', 'BABLU SHERA', '', 'September', '', ''],
    ['JOB BILLING', 'AARUSH EXP', 'MAU', '17/02/26', '45859', 'ddMMyyyy', 225, 33396.00, 32394.12, 34014.00, 0.00, 0.00, 0.00, 0.00, 34014.00, 'AARUSH EXP', '', 'BABLU SHERA', '', 'February', '01/05/26', '3% PARTY']
]

# Test with sheet_to_json default object output
excel_objects = [
    {'Book': 'BANK RECEIP', 'Party': 'FASHION ROY', 'Marka/Grou\np': 'JGG', 'Bill Date': '18/09/26', 'Bill No': '3194', 'Balance': '-1,117,925.00'},
    {'Book': 'JOB BILLING', 'Party': 'AARUSH EXP', 'Marka/Grou\np': 'MAU', 'Bill Date': '17/02/26', 'Bill No': '45859', 'Balance': '34,014.00'}
]

print('Extracted from 2D:', test_universal_extractor(excel_2d))
print('Extracted from objects:', test_universal_extractor(excel_objects))
