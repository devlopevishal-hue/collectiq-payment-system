with open('index.html', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'import' in line.lower() or 'file' in line.lower():
            if 'modal' in line.lower() or 'section' in line.lower() or 'input' in line.lower():
                print(f"{i+1}: {line.strip()[:100]}")
