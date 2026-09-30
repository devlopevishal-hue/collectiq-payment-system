with open('latest-report-data.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('"SAN"')
if idx != -1:
    print(text[idx-50:idx+600])
else:
    print('SAN not found')
