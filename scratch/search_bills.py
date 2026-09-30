import os

for root, dirs, files in os.walk('.'):
    if '.git' in root or 'node_modules' in root:
        continue
    for file in files:
        path = os.path.join(root, file)
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                if '12613' in content or '11366' in content or '11,366' in content:
                    print(f"Found 12613 / 11366 in {path}")
                if '14674' in content or '20003' in content:
                    print(f"Found 14674 / 20003 in {path}")
        except Exception as e:
            pass
