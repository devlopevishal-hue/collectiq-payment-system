import pandas as pd

path = r"C:\Users\Admin\Downloads\OUTSTANDING RECEIVABLE REPORT WITH POLICY 01-09-2026.xls"
book = pd.ExcelFile(path)
print(book.sheet_names)
for sheet in book.sheet_names:
    data = pd.read_excel(path, sheet_name=sheet, header=None)
    print(f"\n--- {sheet} ({data.shape[0]} rows x {data.shape[1]} cols) ---")
    print(data.iloc[:25, :25].to_string(index=False, header=False))
