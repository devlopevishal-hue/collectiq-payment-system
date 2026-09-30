import json
import re

# 1. Update latest-report-data.js and outputs/latest-report-data.js so SAN has id 'm_229'
for path in ['latest-report-data.js', 'outputs/latest-report-data.js']:
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()

    prefix = "window.latestReportCases = "
    cases = json.loads(text.split(prefix)[1].rstrip(';\n'))
    for m in cases:
        if m['marka'] == 'SAN':
            m['id'] = 'm_229'
            print("Set SAN id to m_229 in", path)

    new_content = "// Latest Outstanding Receivable Report with Policy Generated Data\n"
    new_content += prefix + json.dumps(cases, indent=2) + ";\n"

    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)

print("Updated latest-report-data.js files.")
