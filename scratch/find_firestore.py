with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'firestore' in line.lower() or 'onsnapshot' in line.lower() or 'savecloud' in line.lower():
        print(f"{i+1}: {line.strip()[:100]}")
