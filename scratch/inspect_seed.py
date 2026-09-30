with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'ensureseeddataloaded' in line.lower() or 'latestreportcases' in line.lower():
        print(f"{i+1}: {line.strip()[:100]}")
