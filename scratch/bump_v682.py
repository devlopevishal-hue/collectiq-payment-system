import re

def bump_versions(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        c = f.read()
    c = re.sub(r'styles\.css\?v=[0-9\.]+', 'styles.css?v=6.8.2', c)
    c = re.sub(r'latest-report-data\.js\?v=[0-9\.]+', 'latest-report-data.js?v=6.8.2', c)
    c = re.sub(r'app\.js\?v=[0-9\.]+', 'app.js?v=6.8.2', c)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(c)
    print(f"Bumped version in {filepath}")

bump_versions('index.html')
bump_versions('outputs/index.html')
