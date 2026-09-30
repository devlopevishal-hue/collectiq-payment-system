with open('app.js', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'function openpayment' in line.lower() or 'function savepayment' in line.lower():
            print(f"{i+1}: {line.strip()[:100]}")
