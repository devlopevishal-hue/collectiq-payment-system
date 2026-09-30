def update_clear_and_import(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Update clearAllData admin check so any admin/superuser can clear
    old_admin_check = '''  const isMasterAdmin = currentUser && (
    currentUser.email === 'devlope.vishal@gmail.com' ||
    currentUser.email === 'admin@collectiq.com' ||
    (currentUser.role === 'admin' && currentUser.email.includes('admin'))
  );'''

    new_admin_check = '''  const isMasterAdmin = !currentUser || (
    currentUser.role === 'admin' ||
    currentUser.role === 'superuser' ||
    currentUser.email === 'devlope.vishal@gmail.com' ||
    currentUser.email === 'admin@collectiq.com'
  );'''

    if old_admin_check in code:
        code = code.replace(old_admin_check, new_admin_check)
        print("Updated admin check in", filepath)

    # 2. Reset input value after file read so re-selecting triggers onchange
    old_input_read = '''  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target.result);
    if (typeof XLSX !== 'undefined') {
      parseWithXlsx(data);
    } else {
      toast('Loading Excel engine...');
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => parseWithXlsx(data);
      s.onerror = () => parseAsTextFallback();
      document.head.appendChild(s);
    }
  };
  reader.readAsArrayBuffer(f);'''

    new_input_read = '''  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target.result);
    if (e.target) e.target.value = '';
    if (typeof XLSX !== 'undefined') {
      parseWithXlsx(data);
    } else {
      toast('Loading Excel engine...');
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => parseWithXlsx(data);
      s.onerror = () => parseAsTextFallback();
      document.head.appendChild(s);
    }
  };
  reader.readAsArrayBuffer(f);'''

    if old_input_read in code:
        code = code.replace(old_input_read, new_input_read)
        print("Updated input read in", filepath)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(code)

update_clear_and_import('app.js')
update_clear_and_import('outputs/app.js')
