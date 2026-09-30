with open('app.js', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'function openfollowup' in line.lower():
            print(f"{i+1}: {line.strip()[:100]}")
