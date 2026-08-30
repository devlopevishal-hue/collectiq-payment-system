import pandas as pd

path = r"C:\Users\Admin\Downloads\OUTSTANDING RECEIVABLE REPORT WITH POLICY 01-09-2026.xls"
data = pd.read_excel(path)
data['Balance'] = pd.to_numeric(data['Balance'], errors='coerce').fillna(0)
active = data[data['Balance'] > 0].copy()
print('rows', len(data), 'positive rows', len(active), 'positive balance', active['Balance'].sum())
print('\nCollection Person / Followper counts:')
print(active['Collection Person'].fillna('Unassigned').value_counts().head(25).to_string())
print('\nExample active outstanding rows:')
print(active[['Party','Marka/Group','Bill Date','Bill No','Balance','Collection Person','PolicyDate','PolicyName']].head(25).to_string(index=False))
print('\nGrouped Party + Bill Date cases:', active.groupby(['Party','Bill Date'], dropna=False).ngroups)
