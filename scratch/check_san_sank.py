import json

with open('latest-report-data.js', 'r', encoding='utf-8') as f:
    text = f.read()

cases = json.loads(text.split('window.latestReportCases = ')[1].rstrip(';\n'))
for m in cases:
    if 'SAN' in m['marka'].upper():
        print(f"Marka: '{m['marka']}', Master: '{m['master']}', Bills count: {len(m['bills'])}, Total: {sum(b['balance'] for b in m['bills'])}")
