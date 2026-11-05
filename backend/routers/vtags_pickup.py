import os
import re
import json
import time
import datetime
import urllib.parse
from pathlib import Path
from typing import List, Dict, Any, Optional

import requests
import openpyxl
import pymupdf  # PyMuPDF
from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.responses import FileResponse

import sqlite3

BASE_DIR = Path(r"C:\ANJUN")
DB_PATH = BASE_DIR / "backend" / "coletas.db"

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn
from routers.vtags import obter_headers_anjun, verificar_status_token, CONFIG_PATH, carregar_config_anjun

router = APIRouter()

ROTAS_DIR = Path(r"C:\ANJUN\PLANILHA DE ROTAS")
STATIC_PICKUP_DIR = Path(r"C:\ANJUN\backend\static\vtags_pickup")
STATIC_PICKUP_DIR.mkdir(parents=True, exist_ok=True)

# Constante definida pelo Diego Mandarino
SITE_ID_PICKUP = 3762  # SP-Z-H001


def init_pickup_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS vtags_pickup_geradas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dia_base TEXT NOT NULL,
            canal TEXT NOT NULL,
            ponto_codigo TEXT NOT NULL,
            site_id INTEGER NOT NULL,
            tag_number TEXT NOT NULL,
            motorista TEXT NOT NULL,
            placa TEXT,
            rota TEXT,
            contato TEXT,
            telefone_wpp TEXT,
            quantidade INTEGER DEFAULT 0,
            endereco TEXT,
            imagem_nome TEXT,
            pdf_url TEXT,
            status_envio TEXT DEFAULT 'PENDENTE',
            enviado_por TEXT,
            enviado_em TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(dia_base, canal, ponto_codigo, tag_number)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS vtags_pickup_disparos_motoristas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dia_base TEXT NOT NULL,
            canal TEXT NOT NULL,
            motorista TEXT NOT NULL,
            placa TEXT,
            status_envio TEXT DEFAULT 'PENDENTE',
            enviado_por TEXT,
            enviado_em TEXT,
            UNIQUE(dia_base, canal, motorista)
        )
    """)
    conn.commit()
    conn.close()


init_pickup_db()


def encontrar_planilha_fm_recente() -> Optional[Path]:
    """Busca o arquivo mais recente de Planejamento Consolidado FM."""
    diretorios = [ROTAS_DIR, Path(r"C:\ANJUN")]
    arquivos = []
    for d in diretorios:
        if d.exists():
            arquivos.extend([
                p for p in d.glob("*.xlsx") 
                if not p.name.startswith("~$") and "consolidado fm" in p.name.lower()
            ])
    if not arquivos:
        return None
    arquivos.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return arquivos[0]


def ler_dados_planilha_fm(arquivo_path: Path) -> Dict[str, Any]:
    """Lê as 4 guias do consolidado FM: C&A, PICKUP, TIKTOK, TEMU aplicando o filtro anti-HUB/RIVILOG."""
    wb = openpyxl.load_workbook(str(arquivo_path), data_only=True)
    
    # 1. Determinar dia base brasileiro (ex: 05/11/2026)
    # Procura dia e mes na guia de pickup (ex: '05.11_Pickup')
    dia_str = "05/11/2026"
    for sname in wb.sheetnames:
        m_s = re.search(r'(\d{2})[.\-_](\d{2})', sname)
        if m_s:
            dia_str = f"{m_s.group(1)}/{m_s.group(2)}/{datetime.date.today().year}"
            break

    target_sheets = {
        "C&A": next((s for s in wb.sheetnames if s.strip().upper() == "C&A"), None),
        "PICKUP": next((s for s in wb.sheetnames if "pickup" in s.lower() and "performance" not in s.lower()), None),
        "TIKTOK": next((s for s in wb.sheetnames if "tiktok" in s.lower() and "performance" not in s.lower()), None),
        "TEMU": next((s for s in wb.sheetnames if "temu" in s.lower() and "performance" not in s.lower()), None),
    }

    itens = []
    totais_por_canal = {"C&A": 0, "PICKUP": 0, "TIKTOK": 0, "TEMU": 0}

    for canal, sname in target_sheets.items():
        if not sname or sname not in wb.sheetnames:
            continue
        sheet = wb[sname]
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            continue
        headers = [str(c).strip().lower() if c is not None else "" for c in rows[0]]

        def find_col(kws):
            for idx, h in enumerate(headers):
                for kw in kws:
                    if kw in h:
                        return idx
            return None

        mot_idx = find_col(["motorista"])
        placa_idx = find_col(["placa"])
        tel_idx = find_col(["telefone", "contato", "celular"])
        rota_idx = find_col(["rota"])
        qtd_idx = find_col(["quantidade"])

        for r_idx, r in enumerate(rows[1:], start=2):
            if not any(r):
                continue
            mot = str(r[mot_idx]).strip() if mot_idx is not None and len(r) > mot_idx and r[mot_idx] is not None else ""
            mot_upper = mot.upper()

            mot_lower = mot.lower()
            # Regra solicitada: Se o motorista for HUB ou RIVILOG, pular e não gerar nada!
            if not mot or "aguardando" in mot_lower or "sem motorista" in mot_lower or "confirmação" in mot_lower or "confirmacao" in mot_lower or "gestão" in mot_lower or "gestao" in mot_lower:
                continue
            if "hub" in mot_lower or "rivilog" in mot_lower:
                continue

            ponto = ""
            endereco = ""
            if canal == "C&A":
                ponto = str(r[2]).strip() if len(r) > 2 and r[2] is not None else (str(r[1]).strip() if len(r) > 1 and r[1] is not None else f"LOJA_{r_idx}")
                endereco = str(r[4]).strip() if len(r) > 4 and r[4] is not None else ""
            elif canal == "PICKUP":
                ponto = str(r[1]).strip() if len(r) > 1 and r[1] is not None else f"SELLER_{r_idx}"
                endereco = str(r[2]).strip() if len(r) > 2 and r[2] is not None else ""
            elif canal == "TIKTOK":
                ponto = str(r[0]).strip() if len(r) > 0 and r[0] is not None else f"TIKTOK_{r_idx}"
                endereco = str(r[1]).strip() if len(r) > 1 and r[1] is not None else ""
            elif canal == "TEMU":
                remetente = str(r[1]).strip() if len(r) > 1 and r[1] is not None else ""
                cliente = str(r[0]).strip() if len(r) > 0 and r[0] is not None else ""
                ponto = remetente if remetente and remetente != "#N/A" else (cliente if cliente and cliente != "#N/A" else f"TEMU_{r_idx}")
                endereco = str(r[2]).strip() if len(r) > 2 and r[2] is not None else ""

            placa = str(r[placa_idx]).strip() if placa_idx is not None and len(r) > placa_idx and r[placa_idx] is not None else "-"
            rota = str(r[rota_idx]).strip() if rota_idx is not None and len(r) > rota_idx and r[rota_idx] is not None else canal
            tel = str(r[tel_idx]).strip() if tel_idx is not None and len(r) > tel_idx and r[tel_idx] is not None else ""
            qtd = int(r[qtd_idx]) if qtd_idx is not None and len(r) > qtd_idx and isinstance(r[qtd_idx], (int, float)) else 0

            tel_limpo = re.sub(r'\D', '', tel)
            if len(tel_limpo) == 10:
                tel_limpo = tel_limpo[:2] + "9" + tel_limpo[2:]
            if len(tel_limpo) == 11 and not tel_limpo.startswith("55"):
                tel_formatado = f"55{tel_limpo}"
            else:
                tel_formatado = tel_limpo

            itens.append({
                "canal": canal,
                "ponto": ponto,
                "motorista": mot,
                "placa": placa,
                "rota": rota,
                "telefone": tel,
                "telefone_wpp": tel_formatado,
                "quantidade": qtd,
                "endereco": endereco
            })
            totais_por_canal[canal] += 1

    return {
        "arquivo": arquivo_path.name,
        "dia_base": dia_str,
        "itens": itens,
        "totais_por_canal": totais_por_canal,
        "total_pontos": len(itens)
    }


@router.get("/status")
def get_vtag_pickup_status():
    """Retorna o status da planilha Consolidado FM e das VTAGs de Pickup geradas."""
    arquivo_fm = encontrar_planilha_fm_recente()
    token_status = verificar_status_token()

    if not arquivo_fm:
        return {
            "possui_planilha": False,
            "arquivo": None,
            "dia_base": None,
            "token_status": token_status,
            "total_pontos_planilha": 0,
            "total_motoristas_planilha": 0,
            "canais_disponiveis": ["TODOS", "C&A", "PICKUP", "TIKTOK", "TEMU"],
            "por_canal": {},
            "estatisticas_banco": {
                "total_gerados": 0,
                "total_enviados": 0,
                "total_vtags_geradas": 0
            },
            "mensagem": "Nenhum arquivo 'Planejamento Consolidado FM' encontrado na pasta de rotas."
        }

    try:
        dados = ler_dados_planilha_fm(arquivo_fm)
    except Exception as e:
        return {
            "possui_planilha": False,
            "arquivo": arquivo_fm.name,
            "dia_base": None,
            "token_status": token_status,
            "erro_leitura": str(e)
        }

    dia_base = dados["dia_base"]
    motoristas_unicos = set(i["motorista"] for i in dados["itens"])

    # Estatísticas do banco de dados SQLite
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(DISTINCT ponto_codigo), COUNT(DISTINCT tag_number) FROM vtags_pickup_geradas WHERE dia_base = ?", (dia_base,))
    row_stats = cursor.fetchone()
    total_pontos_com_vtag = row_stats[0] if row_stats else 0
    total_vtags_geradas = row_stats[1] if row_stats else 0

    cursor.execute("SELECT COUNT(DISTINCT motorista) FROM vtags_pickup_disparos_motoristas WHERE dia_base = ? AND status_envio = 'ENVIADO'", (dia_base,))
    row_disp = cursor.fetchone()
    total_enviados = row_disp[0] if row_disp else 0
    conn.close()

    return {
        "possui_planilha": True,
        "arquivo": dados["arquivo"],
        "dia_base": dia_base,
        "token_status": token_status,
        "site_id_oficial": SITE_ID_PICKUP,
        "site_nome_oficial": "SP-Z-H001",
        "total_pontos_planilha": len(dados["itens"]),
        "total_motoristas_planilha": len(motoristas_unicos),
        "canais_disponiveis": ["TODOS", "C&A", "PICKUP", "TIKTOK", "TEMU"],
        "por_canal": dados["totais_por_canal"],
        "estatisticas_banco": {
            "total_pontos_com_vtag": total_pontos_com_vtag,
            "total_enviados": total_enviados,
            "total_vtags_geradas": total_vtags_geradas
        }
    }


@router.get("/motoristas")
def get_motoristas_pickup_agrupados(
    dia_base: Optional[str] = Query(None),
    canal: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    status_filtro: Optional[str] = Query(None)
):
    """Retorna os motoristas de Pickup com seus respectivos Sellers/Lojas e VTAGs geradas."""
    arquivo_fm = encontrar_planilha_fm_recente()
    if not arquivo_fm:
        return {"motoristas": [], "total": 0}

    dados = ler_dados_planilha_fm(arquivo_fm)
    dia_ref = dia_base or dados["dia_base"]

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT ponto_codigo, tag_number, imagem_nome, pdf_url, status_envio, enviado_por, enviado_em, canal, motorista
        FROM vtags_pickup_geradas
        WHERE dia_base = ?
    """, (dia_ref,))
    vtags_db = cursor.fetchall()

    cursor.execute("""
        SELECT motorista, status_envio, enviado_por, enviado_em, canal
        FROM vtags_pickup_disparos_motoristas
        WHERE dia_base = ?
    """, (dia_ref,))
    disparos_rows = cursor.fetchall()
    conn.close()

    disparos_map = {r["motorista"]: r for r in disparos_rows}

    # Mapear VTAGs por Ponto
    ponto_to_vtags: Dict[str, List[Dict[str, Any]]] = {}
    for row in vtags_db:
        ponto = row["ponto_codigo"]
        if ponto not in ponto_to_vtags:
            ponto_to_vtags[ponto] = []
        ponto_to_vtags[ponto].append({
            "tag_number": row["tag_number"],
            "imagem_url": f"/api/vtags-pickup/imagem/{row['imagem_nome']}" if row["imagem_nome"] else None,
            "pdf_url": row["pdf_url"]
        })

    # Filtrar itens por canal
    itens_filtrados = dados["itens"]
    if canal and canal.upper() != "TODOS":
        canal_up = canal.upper().strip()
        itens_filtrados = [i for i in itens_filtrados if i["canal"] == canal_up]

    # Agrupar itens por Motorista
    motoristas_map: Dict[str, Dict[str, Any]] = {}
    for item in itens_filtrados:
        mot = item["motorista"]
        disp = disparos_map.get(mot)
        if mot not in motoristas_map:
            motoristas_map[mot] = {
                "motorista": mot,
                "placa": item["placa"],
                "rota": item["rota"],
                "contato": item["telefone"],
                "telefone_wpp": item["telefone_wpp"],
                "canal": item["canal"],
                "pontos": [],
                "total_vtags": 0,
                "card_imagem_url": f"/api/vtags-pickup/card-motorista?dia_base={urllib.parse.quote(dia_ref)}&motorista={urllib.parse.quote(mot)}",
                "status_envio": disp["status_envio"] if disp else "PENDENTE",
                "enviado_por": disp["enviado_por"] if disp else None,
                "enviado_em": disp["enviado_em"] if disp else None
            }

        ponto_nome = item["ponto"]
        vtags_do_ponto = ponto_to_vtags.get(ponto_nome, [])
        motoristas_map[mot]["pontos"].append({
            "ponto_nome": ponto_nome,
            "canal": item["canal"],
            "endereco": item["endereco"],
            "quantidade": item["quantidade"],
            "vtags": vtags_do_ponto
        })
        motoristas_map[mot]["total_vtags"] += len(vtags_do_ponto)

    lista_motoristas = list(motoristas_map.values())

    # Filtro de Busca
    if search:
        s_norm = search.strip().lower()
        lista_motoristas = [
            m for m in lista_motoristas
            if s_norm in m["motorista"].lower()
            or s_norm in m["placa"].lower()
            or s_norm in m["rota"].lower()
            or any(s_norm in p["ponto_nome"].lower() for p in m["pontos"])
        ]

    # Filtro de Status
    if status_filtro and status_filtro.upper() != "TODOS":
        st_up = status_filtro.upper().strip()
        lista_motoristas = [m for m in lista_motoristas if m["status_envio"] == st_up]

    return {
        "dia_base": dia_ref,
        "canal": canal or "TODOS",
        "total": len(lista_motoristas),
        "motoristas": lista_motoristas
    }


@router.post("/gerar-vtags-anjun")
def gerar_vtags_pickup_em_lote(
    canal: Optional[str] = Query(None),
    motorista: Optional[str] = Query(None),
    ponto_nome: Optional[str] = Query(None),
    usuario: Optional[str] = Query(None),
    forcar: bool = Query(False)
):
    """
    Gera VTAGs oficiais de Pickup na Anjun (1 VTAG por ponto, Site SP-Z-H001 ID 3762).
    Aplica o Belonging Point customizado com o nome do Seller / Loja C&A / TikTok / Temu.
    """
    u_norm = (usuario or "").strip().lower()
    if u_norm not in ["diego", "ellen", "admin", "mandarino"]:
        raise HTTPException(
            status_code=403, 
            detail="Acesso negado. Apenas Diego ou Ellen podem gerar as VTAGs oficiais."
        )

    token_status = verificar_status_token()
    if not token_status.get("valido"):
        raise HTTPException(status_code=401, detail="Sessão com a Anjun inválida ou expirada. Atualize o token.")

    arquivo_fm = encontrar_planilha_fm_recente()
    if not arquivo_fm:
        raise HTTPException(status_code=404, detail="Planilha Consolidado FM não encontrada.")

    dados = ler_dados_planilha_fm(arquivo_fm)
    itens_alvo = dados["itens"]

    if ponto_nome:
        p_target = ponto_nome.strip().upper()
        itens_alvo = [i for i in dados["itens"] if i["ponto"].strip().upper() == p_target]
    elif motorista:
        m_target = motorista.strip().upper()
        itens_alvo = [i for i in dados["itens"] if i["motorista"].strip().upper() == m_target]
    elif canal and canal.upper() != "TODOS":
        c_target = canal.upper().strip()
        itens_alvo = [i for i in itens_alvo if i["canal"] == c_target]

    if not itens_alvo:
        raise HTTPException(status_code=400, detail="Nenhum ponto de coleta localizado para os filtros informados.")

    headers = obter_headers_anjun()
    base_admin = "https://newmanage.anjunexpress.com/admin"

    dia_base = dados["dia_base"]
    dia_safe = dia_base.replace("/", "-")
    dia_folder = STATIC_PICKUP_DIR / dia_safe
    dia_folder.mkdir(parents=True, exist_ok=True)

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT DISTINCT ponto_codigo FROM vtags_pickup_geradas WHERE dia_base = ?", (dia_base,))
    pontos_ja_gerados = set(r[0] for r in cursor.fetchall())

    if ponto_nome and forcar:
        cursor.execute("DELETE FROM vtags_pickup_geradas WHERE dia_base = ? AND ponto_codigo = ?", (dia_base, ponto_nome.strip()))
        conn.commit()
        pontos_ja_gerados.discard(ponto_nome.strip())
    elif motorista and forcar:
        cursor.execute("DELETE FROM vtags_pickup_geradas WHERE dia_base = ? AND UPPER(motorista) = UPPER(?)", (dia_base, motorista.strip()))
        conn.commit()
        for it in itens_alvo:
            pontos_ja_gerados.discard(it["ponto"])

    pontos_gerados = 0
    vtags_salvas = 0
    falhas = []

    # Loop de criação das VTAGs (1 VTAG por ponto no Site SP-Z-H001)
    for item in itens_alvo:
        pt_nome = item["ponto"]
        if pt_nome in pontos_ja_gerados and not forcar:
            continue

        payload_gerar = {
            "printQty": 1,  # 1 VTAG somente conforme solicitado
            "siteId": SITE_ID_PICKUP  # 3762
        }

        try:
            r_gen = requests.post(f"{base_admin}/collectTagNumber/createTagNumber", headers=headers, json=payload_gerar, timeout=12)
            res_json = r_gen.json()
            if res_json.get("code") != 200:
                falhas.append({
                    "ponto": pt_nome,
                    "canal": item["canal"],
                    "motorista": item["motorista"],
                    "motivo": f"Anjun recusou: {res_json.get('msg', 'Erro na API')}"
                })
                continue

            pontos_gerados += 1
            time.sleep(0.05)

            # Buscar o master record
            r_det = requests.post(
                f"{base_admin}/collectTagNumber/page",
                headers=headers,
                json={"pageNumber": 1, "pageSize": 1, "params": {"siteId": SITE_ID_PICKUP}},
                timeout=12
            )
            rec_master = r_det.json().get("data", {}).get("records", [])
            tag_master_id = rec_master[0].get("id") if rec_master else None
            print_url = rec_master[0].get("printUrl") if rec_master else None

            # Gravar o Belonging Point customizado com o nome do Seller/Loja
            if tag_master_id:
                try:
                    r_p = requests.post(
                        f"{base_admin}/collectTagNumber/printTagNumber",
                        headers=headers,
                        json={
                            "tagNumberId": tag_master_id,
                            "siteId": SITE_ID_PICKUP,
                            "siteName": pt_nome,
                            "printQty": 1
                        },
                        timeout=12
                    )
                    res_p_data = r_p.json().get("data")
                    if res_p_data and str(res_p_data).startswith("http"):
                        print_url = res_p_data
                except Exception as ep:
                    print(f"Aviso ao customizar Belonging Point de {pt_nome}: {ep}")

                r_items = requests.post(
                    f"{base_admin}/collectTagNumber/itemList",
                    headers=headers,
                    json={"tagNumberId": tag_master_id},
                    timeout=12
                )
                tags_detalhes = r_items.json().get("data", {}).get("records", [])

            # Renderização da imagem PNG (787x787)
            img_nomes = []
            if print_url:
                try:
                    pdf_bytes = requests.get(print_url, timeout=15).content
                    doc_pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
                    for p_idx, page in enumerate(doc_pdf):
                        pix = page.get_pixmap(dpi=200)
                        v_cod = tags_detalhes[p_idx].get("tagNumber") if p_idx < len(tags_detalhes) else f"VTAG_{p_idx+1}"
                        clean_pt = re.sub(r'[^a-zA-Z0-9_\-]', '_', pt_nome)[:30]
                        img_filename = f"{dia_safe}_{item['canal']}_{clean_pt}_{v_cod}.png"
                        pix.save(str(dia_folder / img_filename))
                        img_nomes.append((v_cod, img_filename))
                except Exception as err_pdf:
                    print(f"Aviso ao renderizar PDF de {pt_nome}: {err_pdf}")

            # Salvar no banco
            if tags_detalhes:
                for idx_tag, tag_item in enumerate(tags_detalhes):
                    t_num = tag_item.get("tagNumber")
                    img_match = next((im[1] for im in img_nomes if im[0] == t_num), None)
                    cursor.execute("""
                        INSERT OR REPLACE INTO vtags_pickup_geradas (
                            dia_base, canal, ponto_codigo, site_id, tag_number, motorista, placa, rota, contato, telefone_wpp, quantidade, endereco, imagem_nome, pdf_url
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        dia_base, item["canal"], pt_nome, SITE_ID_PICKUP, t_num,
                        item["motorista"], item["placa"], item["rota"], item["telefone"], item["telefone_wpp"],
                        item["quantidade"], item["endereco"], img_match, print_url
                    ))
                    vtags_salvas += 1
            else:
                cursor.execute("""
                    INSERT OR REPLACE INTO vtags_pickup_geradas (
                        dia_base, canal, ponto_codigo, site_id, tag_number, motorista, placa, rota, contato, telefone_wpp, quantidade, endereco, imagem_nome, pdf_url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    dia_base, item["canal"], pt_nome, SITE_ID_PICKUP, f"PEND_{pt_nome}",
                    item["motorista"], item["placa"], item["rota"], item["telefone"], item["telefone_wpp"],
                    item["quantidade"], item["endereco"], None, print_url
                ))
                vtags_salvas += 1

            conn.commit()

        except Exception as e_req:
            falhas.append({
                "ponto": pt_nome,
                "canal": item["canal"],
                "motorista": item["motorista"],
                "motivo": f"Exceção de rede/processamento: {e_req}"
            })

    conn.close()

    status_geral = "sucesso"
    if len(falhas) > 0:
        status_geral = "parcial" if pontos_gerados > 0 else "erro"

    return {
        "status": status_geral,
        "dia_base": dia_base,
        "canal": canal or "TODOS",
        "motorista": motorista,
        "ponto_nome": ponto_nome,
        "pontos_solicitados": len(itens_alvo),
        "pontos_gerados_nesta_execucao": pontos_gerados,
        "vtags_salvas": vtags_salvas,
        "total_falhas": len(falhas),
        "falhas": falhas
    }


@router.api_route("/imagem/{imagem_nome}", methods=["GET", "HEAD"])
def get_vtag_pickup_imagem(imagem_nome: str):
    """Serve a imagem renderizada da VTAG de Pickup com CORS liberado."""
    for p in STATIC_PICKUP_DIR.rglob(imagem_nome):
        if p.is_file():
            return FileResponse(
                str(p),
                media_type="image/png",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                    "Cache-Control": "public, max-age=86400"
                }
            )
    raise HTTPException(status_code=404, detail="Imagem da VTAG de Pickup não localizada.")


@router.api_route("/card-motorista", methods=["GET", "HEAD"])
def get_card_motorista_pickup(dia_base: str = Query(...), motorista: str = Query(...)):
    """Gera e retorna a imagem combinada com todas as VTAGs de Pickup do motorista em alta resolução."""
    dia_safe = dia_base.replace("/", "-")
    dia_folder = STATIC_PICKUP_DIR / dia_safe
    dia_folder.mkdir(parents=True, exist_ok=True)

    mot_safe = re.sub(r'[^a-zA-Z0-9_\-]', '_', motorista)
    card_filename = f"card_pickup_{mot_safe}.png"
    card_path = dia_folder / card_filename

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT ponto_codigo, canal, tag_number, rota, placa, imagem_nome
        FROM vtags_pickup_geradas
        WHERE dia_base = ? AND UPPER(motorista) = UPPER(?)
        ORDER BY canal ASC, ponto_codigo ASC, id ASC
    """, (dia_base, motorista.strip()))
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail="Nenhuma VTAG de Pickup encontrada para este motorista.")

    rota = rows[0]["rota"] if rows[0]["rota"] else "Padrão"
    placa = rows[0]["placa"] if rows[0]["placa"] else "-"

    pt_map = {}
    for r in rows:
        pt = r["ponto_codigo"]
        if pt not in pt_map:
            pt_map[pt] = {
                "ponto": pt,
                "canal": r["canal"],
                "tag_number": r["tag_number"],
                "path": dia_folder / r["imagem_nome"] if r["imagem_nome"] else None
            }

    valid_pts = [p for p in pt_map.values() if p["path"] and p["path"].exists()]
    if not valid_pts:
        raise HTTPException(status_code=404, detail="Imagens das VTAGs ainda não foram renderizadas.")

    try:
        from PIL import Image, ImageDraw, ImageFont
        try:
            font_title = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 26)
            font_sub = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 17)
            font_pt = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 18)
            font_tag = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 16)
            font_foot = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 14)
        except Exception:
            font_title = font_sub = font_pt = font_tag = font_foot = ImageFont.load_default()

        card_w = 1200
        header_h = 100
        footer_h = 45
        box_w = 560
        box_h = 560
        num_rows = (len(valid_pts) + 1) // 2
        total_h = header_h + num_rows * (box_h + 90) + footer_h + 30

        card = Image.new("RGB", (card_w, total_h), (248, 250, 252))
        draw = ImageDraw.Draw(card)

        # 1. Header escuro de alto contraste
        draw.rectangle([0, 0, card_w, header_h], fill=(15, 23, 42))
        draw.text((30, 20), "ANJUN EXPRESS - VTAGS OFICIAIS DE PICKUP / FM", fill=(56, 189, 248), font=font_title)
        draw.text((30, 60), f"Motorista: {motorista}   |   Rota: {rota}   |   Placa: {placa}   |   Data: {dia_base}   |   Pickups: {len(valid_pts)}", fill=(226, 232, 240), font=font_sub)

        cur_y = header_h + 20
        for idx, pt in enumerate(valid_pts):
            col = idx % 2
            col_x = 25 if col == 0 else 25 + box_w + 30

            # Banner do Seller / Ponto
            draw.rounded_rectangle([col_x, cur_y, col_x + box_w, cur_y + 36], radius=6, fill=(224, 231, 255), outline=(165, 180, 252))
            draw.text((col_x + 12, cur_y + 8), f"📍 [{pt['canal']}] {pt['ponto'][:35]}", fill=(30, 58, 138), font=font_pt)

            # Imagem do código de barras
            im_v = Image.open(pt["path"])
            resized = im_v.resize((box_w, box_h), Image.Resampling.LANCZOS)
            card.paste(resized, (col_x, cur_y + 42))

            # Borda sutil
            draw.rectangle([col_x, cur_y + 42, col_x + box_w, cur_y + 42 + box_h], outline=(203, 213, 225), width=2)

            # Rótulo VTAG
            lbl = f"VTAG: {pt['tag_number']}  (SP-Z-H001)"
            draw.text((col_x + 10, cur_y + 42 + box_h + 6), lbl, fill=(15, 23, 42), font=font_tag)

            if col == 1 or idx == len(valid_pts) - 1:
                cur_y += box_h + 90

        # Footer
        draw.rectangle([0, total_h - footer_h, card_w, total_h], fill=(241, 245, 249))
        draw.line([0, total_h - footer_h, card_w, total_h - footer_h], fill=(226, 232, 240), width=1)
        draw.text((30, total_h - footer_h + 13), "⚠️ Apresente o código de barras no momento do bipe no ponto de coleta.", fill=(100, 116, 139), font=font_foot)

        card.save(card_path, "PNG")
        return FileResponse(
            str(card_path),
            media_type="image/png",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                "Cache-Control": "public, max-age=3600"
            }
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Erro ao compor card do motorista: {err}")


@router.post("/marcar-enviado")
def marcar_pickup_como_enviado(payload: Dict[str, Any] = Body(...)):
    """Marca todos os pontos de um determinado motorista de Pickup como ENVIADO."""
    dia_base = payload.get("dia_base")
    motorista = payload.get("motorista")
    canal = payload.get("canal", "TODOS")
    enviado_por = payload.get("enviado_por", "Operador Suporte")

    if not dia_base or not motorista:
        raise HTTPException(status_code=400, detail="dia_base e motorista são obrigatórios.")

    agora = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
    conn = get_db()
    cursor = conn.cursor()
    placa = payload.get("placa", "")

    cursor.execute("""
        INSERT INTO vtags_pickup_disparos_motoristas (dia_base, canal, motorista, placa, status_envio, enviado_por, enviado_em)
        VALUES (?, ?, ?, ?, 'ENVIADO', ?, ?)
        ON CONFLICT(dia_base, canal, motorista) DO UPDATE SET
            status_envio = 'ENVIADO',
            enviado_por = excluded.enviado_por,
            enviado_em = excluded.enviado_em;
    """, (dia_base, canal, motorista, placa, enviado_por, agora))

    cursor.execute("""
        UPDATE vtags_pickup_geradas
        SET status_envio = 'ENVIADO', enviado_por = ?, enviado_em = ?
        WHERE dia_base = ? AND motorista = ?
    """, (enviado_por, agora, dia_base, motorista))
    rows = cursor.rowcount
    conn.commit()
    conn.close()

    return {
        "status": "sucesso",
        "motorista": motorista,
        "vtags_atualizadas": rows,
        "enviado_por": enviado_por,
        "enviado_em": agora
    }
