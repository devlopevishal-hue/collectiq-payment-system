with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'syncwithdatabase' in line.lower() or 'fetchfromserver' in line.lower() or 'synctoserver' in line.lower() or 'loadfromcloud' in line.lower():
        print(f"{i+1}: {line.strip()[:100]}")
