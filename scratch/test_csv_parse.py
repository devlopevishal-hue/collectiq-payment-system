import csv
import io

sample_csv = '''Book,Party,"Marka/Grou
p",Bill Date,Bill No,TO DAYS,Days,Gross Amt,"Taxable
Amt",Bill Amt,Dr Amt,Cr Amt,Part,Paid,Balance,Acc + Address,Agent,Master,Collection Person,Month,"PolicyDa
te","PolicyNam
e"
BANK RECEIP,FASHION ROY,JGG,18/09/26,3194,ddMMyyyy,12,0.00,0.00,0.00,0.00,0.00,1117925.00,0.00,-1117925.00,FASHION ROY,,BABLU SHERA,,September,,
JOB BILLING,AARUSH EXP,MAU,17/02/26,45859,ddMMyyyy,225,33396.00,32394.12,34014.00,0.00,0.00,0.00,0.00,34014.00,AARUSH EXP,,BABLU SHERA,,February,01/05/26,3% PARTY
'''

reader = csv.DictReader(io.StringIO(sample_csv))
rows = list(reader)
print('Parsed rows count:', len(rows))
for i, r in enumerate(rows):
    clean = {k.lower().replace('\n','').replace('\r','').replace(' ','').replace('/','').replace('+',''): v for k, v in r.items() if k}
    print(f'Row {i}:')
    print('  Party:', clean.get('party'))
    print('  Marka/Group:', clean.get('markagroup'))
    print('  Bill Date:', clean.get('billdate'))
    print('  Bill No:', clean.get('billno'))
    print('  Balance:', clean.get('balance'))
    print('  Master:', clean.get('master'))
    print('  PolicyDate:', clean.get('policydate'))
    print('  PolicyName:', clean.get('policyname'))
