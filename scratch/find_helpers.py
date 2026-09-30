with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'function totaloutstanding' in line.lower() or 'function alreadydueamount' in line.lower() or 'function upcomingdueamount' in line.lower():
        print(f"{i+1}: {line.strip()[:100]}")
