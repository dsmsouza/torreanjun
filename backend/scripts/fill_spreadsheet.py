import openpyxl
import sqlite3
import datetime
from collections import defaultdict
import shutil
import os

DB_PATH = r"C:\ANJUN\Banco de Dados\torre_anjun.db"
EXCEL_PATH = r"C:\Users\Anjun_\Downloads\levantamento de mds que fecham as 18hrs.xlsx"
BACKUP_PATH = r"C:\Users\Anjun_\Downloads\levantamento de mds que fecham as 18hrs_backup.xlsx"

print("=" * 80)
print("PREENCHIMENTO DE DADOS OPERACIONAIS DE OUTUBRO (ATÉ 21/10)")
print("Arquivo Alvo:", EXCEL_PATH)
print("=" * 80)

# 0. Backup
shutil.copy2(EXCEL_PATH, BACKUP_PATH)
print(f"Backup de seguranca criado em: {BACKUP_PATH}")

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

# 1. Carregar detalhe_md_historico (05/10 a 16/10)
md_days_vol = defaultdict(lambda: defaultdict(lambda: [0, 0])) # md -> dia_base -> [vol, bkl]

print("\n1. Carregando dados historicos de detalhe_md_historico (05/10 a 16/10)...")
rows_hist = c.execute("""
    SELECT UPPER(TRIM(md)), dia_base, total, backlog
    FROM detalhe_md_historico
    WHERE dia_base LIKE '%/10/2026%' AND md IS NOT NULL
""").fetchall()

for md, d, tot, bkl in rows_hist:
    md_days_vol[md][d][0] += (tot or 0)
    md_days_vol[md][d][1] += (bkl or 0)

print(f"  -> {len(rows_hist):,} registros carregados de detalhe_md_historico.")

# 2. Carregar criacao_pedidos_historico (01/10 e 19/10)
print("\n2. Carregando agregacoes de criacao_pedidos_historico (01/10 e 19/10)...")
rows_criacao = c.execute("""
    SELECT UPPER(TRIM(ponto_colecao)), dia_base,
           sum(total_pedidos),
           sum(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'pendente', 'aguardando', 'no ponto') THEN total_pedidos ELSE 0 END)
    FROM criacao_pedidos_historico
    WHERE dia_base IN ('01/10/2026', '19/10/2026')
      AND ponto_colecao IS NOT NULL AND TRIM(ponto_colecao) != ''
    GROUP BY UPPER(TRIM(ponto_colecao)), dia_base
""").fetchall()

for md, d, tot, bkl in rows_criacao:
    md_days_vol[md][d][0] += (tot or 0)
    md_days_vol[md][d][1] += (bkl or 0)

print(f"  -> {len(rows_criacao):,} combinacoes MD-dia carregadas de criacao_pedidos_historico.")

# 3. Carregar operacional_pedidos_completo (17/10, 20/10, 21/10)
print("\n3. Carregando agregacoes de operacional_pedidos_completo (17/10, 20/10, 21/10)...")
rows_op = c.execute("""
    SELECT UPPER(TRIM(ponto_colecao)), dia_base,
           count(*),
           sum(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'pendente', 'aguardando', 'no ponto')
                    OR (LOWER(status_pedido) NOT IN ('circuito fechado', 'carregamento', 'descarregamento', 'foi assinado', 'cancelado') AND status_pedido IS NOT NULL)
                    THEN 1 ELSE 0 END)
    FROM operacional_pedidos_completo
    WHERE ponto_colecao IS NOT NULL AND TRIM(ponto_colecao) != ''
    GROUP BY UPPER(TRIM(ponto_colecao)), dia_base
""").fetchall()

for md, d, tot, bkl in rows_op:
    md_days_vol[md][d][0] += (tot or 0)
    md_days_vol[md][d][1] += (bkl or 0)

print(f"  -> {len(rows_op):,} combinacoes MD-dia carregadas de operacional_pedidos_completo.")

# 4. Carregar ultimo bipe de coleta
print("\n4. Carregando horarios de ultimo bipe de coleta por dia...")
md_beep_seconds = defaultdict(list)

# De detalhe_pico_historico (05/10 a 16/10)
rows_pico = c.execute("""
    SELECT UPPER(TRIM(md)), dia_base, MAX(CAST(hora_bipagem AS INTEGER))
    FROM detalhe_pico_historico
    WHERE dia_base LIKE '%/10/2026%' AND md IS NOT NULL
    GROUP BY UPPER(TRIM(md)), dia_base
""").fetchall()

for md, d, max_h in rows_pico:
    if max_h is not None and 0 <= max_h <= 23:
        # Bipagem na ultima hora fecha ~H:30
        sec = max_h * 3600 + 1800
        md_beep_seconds[md].append(sec)

# De operacional_pedidos_completo (17/10, 20/10, 21/10) com segundos exatos
rows_op_beeps = c.execute("""
    SELECT UPPER(TRIM(ponto_colecao)), dia_base, MAX(tempo_coleta)
    FROM operacional_pedidos_completo
    WHERE ponto_colecao IS NOT NULL AND tempo_coleta IS NOT NULL AND TRIM(tempo_coleta) != ''
    GROUP BY UPPER(TRIM(ponto_colecao)), dia_base
""").fetchall()

for md, d, max_t in rows_op_beeps:
    if max_t and len(max_t) >= 16:
        try:
            time_part = max_t[11:19]
            parts = time_part.split(':')
            h = int(parts[0])
            m = int(parts[1])
            s = int(parts[2]) if len(parts) > 2 else 0
            if 0 <= h <= 23:
                sec = h * 3600 + m * 60 + s
                md_beep_seconds[md].append(sec)
        except Exception:
            pass

print(f"  -> Horarios compilados para {len(md_beep_seconds)} MDs.")

# 5. Abrir planilha Excel para atualizacao
print("\n5. Atualizando planilha Excel...")
wb = openpyxl.load_workbook(EXCEL_PATH)

# --- Atualizar Sheet: Rota da Semana ---
ws_rota = wb['Rota da Semana']
header_rota = [ws_rota.cell(1, c).value for c in range(1, ws_rota.max_column + 1)]
print("  Cabecalhos 'Rota da Semana':", header_rota)

col_md_rota = 1
col_mbkl_rota = 4 # Media de backlog
col_dbkl_rota = 5 # Dias com backlog
col_hbipe_rota = 6 # Media de horario do ultimo bipe de coleta

count_rota_preenchidos = 0
for r in range(2, ws_rota.max_row + 1):
    cell_md = ws_rota.cell(r, col_md_rota).value
    if not cell_md:
        continue
    md_clean = str(cell_md).strip().upper()
    days_dict = md_days_vol.get(md_clean, {})
    num_days = len(days_dict)
    
    tot_bkl = sum(v[1] for v in days_dict.values())
    dias_bkl = sum(1 for v in days_dict.values() if v[1] > 0)
    media_bkl = round(tot_bkl / max(num_days, 1), 1) if num_days > 0 else 0
    
    beeps = md_beep_seconds.get(md_clean, [])
    if beeps:
        avg_s = sum(beeps) / len(beeps)
        avg_h = int(avg_s // 3600)
        avg_m = int((avg_s % 3600) // 60)
        time_val = datetime.time(avg_h, avg_m)
    else:
        time_val = None
        
    # Preencher celulas
    ws_rota.cell(r, col_mbkl_rota).value = media_bkl
    ws_rota.cell(r, col_dbkl_rota).value = dias_bkl
    if time_val is not None:
        c_bipe = ws_rota.cell(r, col_hbipe_rota)
        c_bipe.value = time_val
        c_bipe.number_format = 'hh:mm'
    else:
        ws_rota.cell(r, col_hbipe_rota).value = "-"
        
    count_rota_preenchidos += 1

print(f"  -> 'Rota da Semana': {count_rota_preenchidos} linhas preenchidas com sucesso.")

# --- Atualizar Sheet: Rota da Semana D2D ---
ws_d2d = wb['Rota da Semana D2D']
header_d2d = [ws_d2d.cell(1, c).value for c in range(1, ws_d2d.max_column + 1)]
print("  Cabecalhos 'Rota da Semana D2D':", header_d2d[:10])

col_md_d2d = 1
col_mdia_d2d = 8 # Media dia

count_d2d_preenchidos = 0
for r in range(2, ws_d2d.max_row + 1):
    cell_md = ws_d2d.cell(r, col_md_d2d).value
    if not cell_md:
        continue
    md_clean = str(cell_md).strip().upper()
    days_dict = md_days_vol.get(md_clean, {})
    num_days = len(days_dict)
    
    tot_vol = sum(v[0] for v in days_dict.values())
    media_dia = round(tot_vol / max(num_days, 1), 1) if num_days > 0 else 0
    
    c_mdia = ws_d2d.cell(r, col_mdia_d2d)
    c_mdia.value = media_dia
    c_mdia.number_format = '#,##0.0'
    count_d2d_preenchidos += 1

print(f"  -> 'Rota da Semana D2D': {count_d2d_preenchidos} linhas preenchidas com sucesso.")

# Salvar planilha
wb.save(EXCEL_PATH)
print("\n" + "=" * 80)
print(f"SUCESSO! Planilha atualizada salva em: {EXCEL_PATH}")
print("=" * 80)
