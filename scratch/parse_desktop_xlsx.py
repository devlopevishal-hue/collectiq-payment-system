import zipfile
import xml.etree.ElementTree as ET

zip_path = r'C:\Users\Admin\Desktop\OUTSTANDING RECEIVABLE REPORT WITH POLICY.xlsx'

with zipfile.ZipFile(zip_path, 'r') as z:
    print('Zip files:', [f for f in z.namelist() if f.endswith('.xml')])
    
    # Read shared strings
    shared_strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
        # Each <si> has <t> or <r><t>
        for si in tree:
            text = ''.join(si.itertext())
            shared_strings.append(text)
        print(f"Total shared strings: {len(shared_strings)}")
        print("First 20 shared strings:", shared_strings[:20])

    # Read sheet1.xml
    sheet_name = 'xl/worksheets/sheet1.xml'
    if sheet_name in z.namelist():
        tree = ET.fromstring(z.read(sheet_name))
        rows = tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
        print(f"Total rows in sheet1: {len(rows)}")
        
        # Look at row 1 (headers)
        r1 = rows[0]
        r1_vals = []
        for c in r1.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
            t = c.get('t')
            v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
            val = v.text if v is not None else ''
            if t == 's' and val.isdigit():
                val = shared_strings[int(val)]
            r1_vals.append(val)
        print("Header Row 1:", r1_vals)

        # Look for SAN
        san_rows = []
        for r in rows:
            r_num = r.get('r')
            cells = []
            for c in r.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                t = c.get('t')
                v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                val = v.text if v is not None else ''
                if t == 's' and val.isdigit():
                    val = shared_strings[int(val)]
                cells.append((c.get('r'), val))
            line_str = ' '.join(str(val) for _, val in cells)
            if 'SAN' in line_str and 'ANNAPURNA' in line_str:
                san_rows.append((r_num, cells))
        print(f"Found {len(san_rows)} SAN rows:")
        for r_num, cells in san_rows[:15]:
            print(f"Row {r_num}: {[val for _, val in cells]}")
