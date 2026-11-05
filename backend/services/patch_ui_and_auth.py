import re

# 1. Patch use-auth.ts
p_auth = r'C:\ANJUN\frontend\hooks\use-auth.ts'
with open(p_auth, 'r', encoding='utf-8') as f:
    c = f.read()
if '"/vtag-pickup"' not in c:
    c = c.replace('allowedPaths = ["/vtag", "/mapa", "/login"];', 'allowedPaths = ["/vtag", "/vtag-pickup", "/mapa", "/login"];')
    with open(p_auth, 'w', encoding='utf-8') as f:
        f.write(c)
    print('use-auth.ts updated with /vtag-pickup')
else:
    print('use-auth.ts already has /vtag-pickup')

# 2. Patch vtag/page.tsx
p_vtag = r'C:\ANJUN\frontend\app\vtag\page.tsx'
with open(p_vtag, 'r', encoding='utf-8') as f:
    v = f.read()

v = re.sub(
    r'const carregarMotoristas = async \(\) => \{\s*try \{\s*setLoadingMotoristas\(true\);',
    'const carregarMotoristas = async (isBackground: boolean = false) => {\n    try {\n      if (!isBackground) setLoadingMotoristas(true);',
    v
)
v = re.sub(
    r'\} finally \{\s*setLoadingMotoristas\(false\);\s*\}',
    '} finally {\n      if (!isBackground) setLoadingMotoristas(false);\n    }',
    v
)
v = re.sub(
    r'const timer = setInterval\(\(\) => \{\s*if \(statusData\?\.possui_planilha\) \{\s*carregarMotoristas\(\);',
    'const timer = setInterval(() => {\n      if (statusData?.possui_planilha) {\n        carregarMotoristas(true);',
    v
)
v = v.replace('{loadingMotoristas ? (', '{loadingMotoristas && motoristas.length === 0 ? (')
with open(p_vtag, 'w', encoding='utf-8') as f:
    f.write(v)
print('vtag/page.tsx patched successfully')

# 3. Patch vtag-pickup/page.tsx
p_pickup = r'C:\ANJUN\frontend\app\vtag-pickup\page.tsx'
with open(p_pickup, 'r', encoding='utf-8') as f:
    vp = f.read()

vp = re.sub(
    r'const carregarMotoristas = async \(\) => \{\s*try \{\s*setLoadingMotoristas\(true\);',
    'const carregarMotoristas = async (isBackground: boolean = false) => {\n    try {\n      if (!isBackground) setLoadingMotoristas(true);',
    vp
)
vp = re.sub(
    r'\} finally \{\s*setLoadingMotoristas\(false\);\s*\}',
    '} finally {\n      if (!isBackground) setLoadingMotoristas(false);\n    }',
    vp
)
vp = re.sub(
    r'const timer = setInterval\(\(\) => \{\s*if \(statusData\?\.possui_planilha\) \{\s*carregarMotoristas\(\);',
    'const timer = setInterval(() => {\n      if (statusData?.possui_planilha) {\n        carregarMotoristas(true);',
    vp
)
vp = vp.replace('{loadingMotoristas ? (', '{loadingMotoristas && motoristas.length === 0 ? (')
with open(p_pickup, 'w', encoding='utf-8') as f:
    f.write(vp)
print('vtag-pickup/page.tsx patched successfully')
