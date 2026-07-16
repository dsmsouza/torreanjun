import os
import io
import openpyxl
import random
import datetime
import unicodedata
from sqlalchemy import text
from sqlalchemy.orm import Session
from database.connection import engine, Base
from models.models import MDSLA, PacoteSLA

def normalize(s):
    if not s:
        return ""
    s = str(s).strip().lower()
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return s.replace(" ", "").replace("_", "").replace("-", "").replace("/", "").replace(".", "")

def get_col_index(header_row, aliases):
    normalized_aliases = [normalize(a) for a in aliases]
    for idx, cell_val in enumerate(header_row):
        if cell_val is not None:
            norm_cell = normalize(str(cell_val))
            if norm_cell in normalized_aliases:
                return idx
    return None

def parse_date_str(val):
    if not val:
        return None
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime('%Y-%m-%d %H:%M:%S')
    return str(val).strip()

def parse_float(val):
    if val is None or val == "":
        return 0.0
    try:
        return float(str(val).replace(",", ".").strip())
    except:
        return 0.0

def criar_indices_performance(db: Session):
    import sqlalchemy
    try:
        db.execute(sqlalchemy.text("CREATE INDEX IF NOT EXISTS idx_status_sla ON pacotes_sla(status)"))
        db.execute(sqlalchemy.text("CREATE INDEX IF NOT EXISTS idx_cid_orig_sla ON pacotes_sla(cidade_origem)"))
        db.execute(sqlalchemy.text("CREATE INDEX IF NOT EXISTS idx_est_orig_sla ON pacotes_sla(estado_origem)"))
        db.execute(sqlalchemy.text("CREATE INDEX IF NOT EXISTS idx_t_col_sla ON pacotes_sla(tempo_coleta)"))
        db.commit()
    except Exception as e:
        print(f"Erro ao criar índices de performance: {e}")

def processar_planilha_coleta(file_path: str, db: Session):
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    criar_indices_performance(db)

    
    try:
        # Tenta utilizar Calamine para carregamento ultrarrápido
        from python_calamine import CalamineWorkbook
        wb = CalamineWorkbook.from_path(file_path)
        sheet_name = wb.sheet_names[0]
        # to_python() retorna lista de listas (linhas com valores)
        rows_data = wb.get_sheet_by_name(sheet_name).to_python()
        rows_iter = iter(rows_data)
    except Exception as e:
        # Fallback para openpyxl se o calamine não estiver disponível
        print("Aviso: python-calamine não disponível ou falhou, usando openpyxl. Erro:", e)
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        sheet = wb.active
        rows_iter = sheet.iter_rows(values_only=True)
    try:
        header = next(rows_iter)
    except StopIteration:
        return {"status": "error", "message": "Planilha de coleta vazia."}
        
    # Map column aliases
    idx_pedido = get_col_index(header, ["numerodopedidodecoleta", "pedidodecoleta", "pedido", "numeropedido"])
    idx_barcode = get_col_index(header, ["codigodebarras", "barcode", "codigobarras", "codbarras"])
    idx_status = get_col_index(header, ["statusdopedido", "status", "statuspedido"])
    idx_merchant = get_col_index(header, ["nomedoclientemerchant", "merchant", "clientemerchant", "loja"])
    idx_estado = get_col_index(header, ["estadodeorigem", "estadoorigem", "estado", "state"])
    idx_cidade = get_col_index(header, ["cidadedeorigem", "cidade", "city"])
    idx_cep = get_col_index(header, ["cepdoremetente", "cep", "postalcode"])
    idx_plataforma = get_col_index(header, ["plataformasafiliadas", "plataforma", "plataformas"])
    idx_ponto = get_col_index(header, ["pontodecolecao", "pontodecoleção", "pontodecoleçao", "ponto", "md"])
    idx_coleta = get_col_index(header, ["temporealparaacoleta", "tempocoleta", "coleta"])
    idx_carr1 = get_col_index(header, ["primeirotempodecarregamento", "carregamento1", "primeirocarregamento"])
    idx_desc1 = get_col_index(header, ["tempodaprimeiradescarga", "descarga1", "primeiradescarga"])
    idx_carr2 = get_col_index(header, ["segundotempodecarregamento", "carregamento2", "segundocarregamento"])
    idx_desc2 = get_col_index(header, ["segundotempodedescarregamento", "segundotempodedescarga", "descarga2", "segundadescarga"])
    idx_assin = get_col_index(header, ["tempodeassinatura", "assinatura", "tempoassinatura"])
    idx_concl = get_col_index(header, ["datadeconclusao", "conclusao", "conclusão"])
    idx_placa1 = get_col_index(header, ["numerodaprimeiracarga", "placa1", "veiculo1"])
    idx_placa2 = get_col_index(header, ["numerodaplacadecarregamentosegundavez", "placa2", "veiculo2"])
    idx_dur_transfer = get_col_index(header, ["duracaodotransferhoras", "transfer", "duracaotransfer"])
    idx_dur_transporte = get_col_index(header, ["duracaodotransportehoras", "transporte", "duracaotransporte"])
    idx_dur_arrival = get_col_index(header, ["duracaodoarrivalhoras", "arrival", "duracaoarrival"])
    
    # We must have at least barcode and point or order reference
    if idx_barcode is None:
        return {"status": "error", "message": "Coluna 'Código de barras' não identificada na planilha."}
        
    db.execute(text("DELETE FROM pacotes_sla;"))
    db.commit()
    
    chunk = []
    rows_imported = 0
    
    for row in rows_iter:
        if not any(cell is not None for cell in row):
            continue
            
        barcode_val = str(row[idx_barcode]).strip() if row[idx_barcode] is not None else None
        if not barcode_val:
            continue
            
        ped_val = str(row[idx_pedido]).strip() if (idx_pedido is not None and row[idx_pedido] is not None) else f"PED{random.randint(100000, 999999)}"
        status_val = str(row[idx_status]).strip() if (idx_status is not None and row[idx_status] is not None) else "Foi assinado"
        merch_val = str(row[idx_merchant]).strip() if (idx_merchant is not None and row[idx_merchant] is not None) else "N/A"
        estado_val = str(row[idx_estado]).strip() if (idx_estado is not None and row[idx_estado] is not None) else ""
        cidade_val = str(row[idx_cidade]).strip() if (idx_cidade is not None and row[idx_cidade] is not None) else ""
        cep_val = str(row[idx_cep]).strip() if (idx_cep is not None and row[idx_cep] is not None) else ""
        plat_val = str(row[idx_plataforma]).strip() if (idx_plataforma is not None and row[idx_plataforma] is not None) else "shein"
        ponto_val = str(row[idx_ponto]).strip() if (idx_ponto is not None and row[idx_ponto] is not None) else "MD-HAV-01"
        
        t_col = parse_date_str(row[idx_coleta]) if (idx_coleta is not None and row[idx_coleta] is not None) else datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        tc1 = parse_date_str(row[idx_carr1]) if (idx_carr1 is not None and row[idx_carr1] is not None) else None
        td1 = parse_date_str(row[idx_desc1]) if (idx_desc1 is not None and row[idx_desc1] is not None) else None
        tc2 = parse_date_str(row[idx_carr2]) if (idx_carr2 is not None and row[idx_carr2] is not None) else None
        td2 = parse_date_str(row[idx_desc2]) if (idx_desc2 is not None and row[idx_desc2] is not None) else None
        tass = parse_date_str(row[idx_assin]) if (idx_assin is not None and row[idx_assin] is not None) else None
        tcon = parse_date_str(row[idx_concl]) if (idx_concl is not None and row[idx_concl] is not None) else None
        
        placa1_val = str(row[idx_placa1]).strip() if (idx_placa1 is not None and row[idx_placa1] is not None) else ""
        placa2_val = str(row[idx_placa2]).strip() if (idx_placa2 is not None and row[idx_placa2] is not None) else ""
        
        d_transfer = parse_float(row[idx_dur_transfer]) if (idx_dur_transfer is not None and row[idx_dur_transfer] is not None) else 0.0
        d_transporte = parse_float(row[idx_dur_transporte]) if (idx_dur_transporte is not None and row[idx_dur_transporte] is not None) else 0.0
        d_arrival = parse_float(row[idx_dur_arrival]) if (idx_dur_arrival is not None and row[idx_dur_arrival] is not None) else 0.0
        
        chunk.append({
            "pedido_coleta": ped_val,
            "barcode": barcode_val,
            "status": status_val,
            "cliente_merchant": merch_val,
            "estado_origem": estado_val,
            "cidade_origem": cidade_val,
            "cep_remetente": cep_val,
            "plataforma": plat_val,
            "ponto_colecao": ponto_val,
            "tempo_coleta": t_col,
            "tempo_carregamento_1": tc1,
            "tempo_descarga_1": td1,
            "tempo_carregamento_2": tc2,
            "tempo_descarga_2": td2,
            "tempo_assinatura": tass,
            "data_conclusao": tcon,
            "placa_carga_1": placa1_val,
            "placa_carga_2": placa2_val,
            "duracao_transfer": d_transfer,
            "duracao_transporte": d_transporte,
            "duracao_arrival": d_arrival
        })
        
        # Batch insert for speed
        if len(chunk) >= 2000:
            db.bulk_insert_mappings(PacoteSLA, chunk)
            db.commit()
            rows_imported += len(chunk)
            chunk = []
            
    if chunk:
        db.bulk_insert_mappings(PacoteSLA, chunk)
        db.commit()
        rows_imported += len(chunk)
        
    return {"status": "success", "rows_imported": rows_imported}

def ingest_sla_and_coleta(db: Session):
    Base.metadata.create_all(bind=engine)
    criar_indices_performance(db)

    
    # 1. Ingest Relação MDS
    mds_file = r"C:\ANJUN\Relação MDS.xlsx"
    if not os.path.exists(mds_file):
        raise FileNotFoundError(f"Arquivo Relação MDS não encontrado: {mds_file}")
        
    wb_mds = openpyxl.load_workbook(mds_file, data_only=True)
    sheet_mds = wb_mds['Dados']
    
    db.execute(text("DELETE FROM md_sla;"))
    db.commit()
    
    md_list = []
    for row in sheet_mds.iter_rows(min_row=2, values_only=True):
        md_code = row[0]
        if not md_code:
            continue
        sla = row[1] or 12
        regiao = row[2] or "SP"
        
        md_sla = MDSLA(md=str(md_code).strip(), sla_horas=int(sla), regiao=str(regiao).strip())
        db.add(md_sla)
        md_list.append(md_sla)
        
    db.commit()
    print(f"Ingested {len(md_list)} MD SLAs.")
    
    # 2. Ingest Relatório de Coleta and generate mock database
    db.execute(text("DELETE FROM pacotes_sla;"))
    db.commit()
    
    marketplaces = ["shein", "shopee", "mercado livre", "amazon", "magalu"]
    merchants = ["MIX STORE", "LOJA CONFECCOES", "MODA BRASIL", "DISTRIBUIDORA SP", "FRANCA SHOES", "BARRETOS WEAR"]
    cities = ["Sao Paulo", "Campinas", "Franca", "Ribeirao Preto", "Barretos", "Guarulhos", "Santos", "Praia Grande"]
    plates = ["TTC0F66", "ABC1D23", "XYZ9A88", "DFG4E22", "KML7T34", "PQR2W11"]
    
    md_codes = [m.md for m in md_list]
    if not md_codes:
        md_codes = ["MD-ABC-01", "MD-HAV-01", "MD-FRA-06", "SP-W-MD222", "SP-W-MD150"]
        
    random.seed(42)
    base_date = datetime.datetime(2026, 7, 1, 8, 0, 0)
    
    inserted_packages = 0
    chunk = []
    for i in range(150):
        barcode = f"888002178{random.randint(100000, 999999)}"
        pedido = f"CL2026070{random.randint(100000, 999999)}"
        
        scenario = random.choices(
            ["completed", "delayed", "lost_md", "lost_coleta", "lost_hub", "lost_transfer", "lost_glp", "lost_dhl"],
            weights=[65, 15, 4, 4, 4, 3, 3, 2],
            k=1
        )[0]
        
        plataforma = random.choice(marketplaces)
        merchant = random.choice(merchants)
        
        is_suboptimal = (random.random() < 0.10)
        if is_suboptimal:
            cidade_orig = "Franca"
            cep_rem = "14400-000"
            md_ponto = "MD-HAV-01"
        else:
            cidade_orig = random.choice(cities)
            if cidade_orig == "Franca":
                cep_rem = "14401-100"
                md_ponto = random.choice([m for m in md_codes if "FRA" in m or "222" in m or "150" in m] or md_codes)
            elif cidade_orig == "Sao Paulo":
                cep_rem = "01000-001"
                md_ponto = random.choice([m for m in md_codes if "FRA" not in m] or md_codes)
            else:
                cep_rem = "05000-100"
                md_ponto = random.choice(md_codes)
                
        offset_days = random.randint(0, 2)
        offset_hours = random.randint(0, 8)
        coleta_dt = base_date + datetime.timedelta(days=offset_days, hours=offset_hours)
        
        coleta_str = coleta_dt.strftime('%Y-%m-%d %H:%M:%S')
        carr1_str = None
        desc1_str = None
        carr2_str = None
        desc2_str = None
        assin_str = None
        concl_str = None
        status = "Foi assinado"
        
        p1 = random.choice(plates)
        p2 = random.choice(plates)
        
        if scenario not in ["lost_md"]:
            carr1_dt = coleta_dt + datetime.timedelta(hours=random.uniform(2, 6))
            carr1_str = carr1_dt.strftime('%Y-%m-%d %H:%M:%S')
            
            if scenario not in ["lost_coleta"]:
                desc1_dt = carr1_dt + datetime.timedelta(hours=random.uniform(1.5, 3.5))
                desc1_str = desc1_dt.strftime('%Y-%m-%d %H:%M:%S')
                
                if scenario not in ["lost_hub"]:
                    carr2_dt = desc1_dt + datetime.timedelta(hours=random.uniform(4, 12))
                    carr2_str = carr2_dt.strftime('%Y-%m-%d %H:%M:%S')
                    
                    if scenario not in ["lost_transfer"]:
                        desc2_dt = carr2_dt + datetime.timedelta(hours=random.uniform(6, 14))
                        desc2_str = desc2_dt.strftime('%Y-%m-%d %H:%M:%S')
                        
                        if scenario not in ["lost_glp"]:
                            assin_dt = desc2_dt + datetime.timedelta(hours=random.uniform(2, 4))
                            assin_str = assin_dt.strftime('%Y-%m-%d %H:%M:%S')
                            
                            if scenario not in ["lost_dhl"]:
                                if scenario == "delayed":
                                    concl_dt = assin_dt + datetime.timedelta(hours=random.uniform(24, 48))
                                else:
                                    concl_dt = assin_dt + datetime.timedelta(hours=random.uniform(1, 4))
                                concl_str = concl_dt.strftime('%Y-%m-%d %H:%M:%S')
                                status = "Concluido"
                                
        dur_transfer = 0.0
        dur_transporte = 0.0
        dur_arrival = 0.0
        
        if carr1_str and desc1_str:
            c1 = datetime.datetime.strptime(carr1_str, '%Y-%m-%d %H:%M:%S')
            d1 = datetime.datetime.strptime(desc1_str, '%Y-%m-%d %H:%M:%S')
            dur_transfer = round((d1 - c1).total_seconds() / 3600.0, 2)
            
        if carr2_str and desc2_str:
            c2 = datetime.datetime.strptime(carr2_str, '%Y-%m-%d %H:%M:%S')
            d2 = datetime.datetime.strptime(desc2_str, '%Y-%m-%d %H:%M:%S')
            dur_transporte = round((d2 - c2).total_seconds() / 3600.0, 2)
            
        if desc2_str and assin_str:
            d2 = datetime.datetime.strptime(desc2_str, '%Y-%m-%d %H:%M:%S')
            a1 = datetime.datetime.strptime(assin_str, '%Y-%m-%d %H:%M:%S')
            dur_arrival = round((a1 - d2).total_seconds() / 3600.0, 2)
            
        chunk.append({
            "pedido_coleta": pedido,
            "barcode": barcode,
            "status": status,
            "cliente_merchant": merchant,
            "cidade_origem": cidade_orig,
            "cep_remetente": cep_rem,
            "plataforma": plataforma,
            "ponto_colecao": md_ponto,
            "tempo_coleta": coleta_str,
            "tempo_carregamento_1": carr1_str,
            "tempo_descarga_1": desc1_str,
            "tempo_carregamento_2": carr2_str,
            "tempo_descarga_2": desc2_str,
            "tempo_assinatura": assin_str,
            "data_conclusao": concl_str,
            "placa_carga_1": p1,
            "placa_carga_2": p2,
            "duracao_transfer": dur_transfer,
            "duracao_transporte": dur_transporte,
            "duracao_arrival": dur_arrival
        })
    
    db.bulk_insert_mappings(PacoteSLA, chunk)
    db.commit()
    print(f"Generated 150 mock package records.")
