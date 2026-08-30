import pandas as pd

path = r"C:\Users\Admin\Downloads\OUTSTANDING RECEIVABLE REPORT WITH POLICY 01-09-2026.xls"
df = pd.read_excel(path)
df['Balance'] = pd.to_numeric(df['Balance'], errors='coerce').fillna(0)
active = df[df['Balance'] > 0]
for column in ['Party', 'Marka/Group', 'Master', 'Collection Person']:
    values = active[column].dropna().astype(str).str.strip() if column in active else pd.Series(dtype='str')
    print(column, 'populated', len(values), 'unique', values.nunique())
    print(values.value_counts().head(12).to_string())
    print()
