with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Let's search for fms, dashboard, renderAll
print("Length of app.js:", len(text))
for f_name in ['function renderAll', 'function dashboard', 'function fms', 'function schedule', 'function saveAllMarkasCloud']:
    idx = text.find(f_name)
    if idx != -1:
        print(f"Found {f_name} at pos {idx}")
