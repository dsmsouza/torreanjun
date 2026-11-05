# -*- coding: utf-8 -*-
"""
backend/routers/vtags.py — Módulo de Gestão, Geração em Lote e Distribuição de VTAGs (SP)
Conecta a Planilha de Rotas (C:\ANJUN\PLANILHA DE ROTAS), a API Oficial da Anjun e a Distribuição por Operador.
"""

import os
import re
import json
import time
import glob
import datetime
import sqlite3
from pathlib import Path
from typing import Dict, Any, List, Optional

import requests
import pymupdf
import openpyxl
from fastapi import APIRouter, HTTPException, Query, Body, Response
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/vtags", tags=["vtags"])

BASE_DIR = Path(r"C:\ANJUN")
ROTAS_DIR = BASE_DIR / "PLANILHA DE ROTAS"
STATIC_VTAGS_DIR = BASE_DIR / "backend" / "static" / "vtags"
STATIC_VTAGS_DIR.mkdir(parents=True, exist_ok=True)

CONFIG_PATH = BASE_DIR / "backend" / "services" / "anjun_api_config.json"
DB_PATH = BASE_DIR / "backend" / "coletas.db"


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_vtags_table():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS vtags_disparos_motoristas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dia_base TEXT NOT NULL,
            motorista TEXT NOT NULL,
            placa TEXT,
            suporte TEXT,
            status_envio TEXT DEFAULT 'ENVIADO',
            enviado_por TEXT NOT NULL,
            enviado_em TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(dia_base, motorista)
        );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_vtags_disp ON vtags_disparos_motoristas(dia_base, motorista);")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS vtags_geradas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dia_base TEXT NOT NULL,
            md_codigo TEXT NOT NULL,
            site_id INTEGER,
            tag_number TEXT,
            motorista TEXT,
            placa TEXT,
            rota TEXT,
            contato TEXT,
            suporte TEXT,
            status_envio TEXT DEFAULT 'PENDENTE',
            enviado_por TEXT,
            enviado_em TEXT,
            imagem_nome TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(dia_base, md_codigo, tag_number)
        );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_vtags_dia_sup ON vtags_geradas(dia_base, suporte);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_vtags_mot ON vtags_geradas(motorista, placa);")
    conn.commit()
    conn.close()


init_vtags_table()


def carregar_config_anjun() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "token": "",
        "usuario": "mandarino",
        "api_base": "https://newmanage.anjunexpress.com/admin"
    }


def obter_headers_anjun() -> Dict[str, str]:
    cfg = carregar_config_anjun()
    return {
        "token": cfg.get("token", ""),
        "Content-Type": "application/json;charset=UTF-8",
        "Origin": "https://manage.anjunexpress.com",
        "Referer": "https://manage.anjunexpress.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }


def verificar_status_token() -> Dict[str, Any]:
    cfg = carregar_config_anjun()
    token = cfg.get("token", "")
    if not token or "." not in token:
        return {"valido": False, "motivo": "Token ausente", "dias_restantes": 0}
    try:
        import base64
        parts = token.split(".")
        if len(parts) >= 2:
            padding = 4 - (len(parts[1]) % 4)
            b64 = parts[1] + ("=" * padding if padding != 4 else "")
            payload_bytes = base64.urlsafe_b64decode(b64)
            payload = json.loads(payload_bytes.decode("utf-8"))
            exp = payload.get("exp", 0)
            now = time.time()
            restante_seg = exp - now
            dias = round(restante_seg / 86400, 1)
            exp_str = datetime.datetime.fromtimestamp(exp).strftime("%d/%m/%Y %H:%M")
            return {
                "valido": restante_seg > 0,
                "dias_restantes": max(0, dias),
                "expira_em": exp_str,
                "usuario": cfg.get("usuario", "mandarino"),
                "expirado": restante_seg <= 0
            }
    except Exception as e:
        return {"valido": False, "motivo": str(e), "dias_restantes": 0}
    return {"valido": True, "dias_restantes": 3.0}


def encontrar_planilha_rotas_recente() -> Optional[Path]:
    if not ROTAS_DIR.exists():
        return None
    arquivos = [p for p in ROTAS_DIR.glob("*.xlsx") if not p.name.startswith("~$")]
    if not arquivos:
        return None
    # Ordena pelo mtime mais recente
    arquivos.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return arquivos[0]


def ler_dados_planilha_rotas(arquivo_path: Path) -> Dict[str, Any]:
    wb = openpyxl.load_workbook(str(arquivo_path), data_only=True)
    if "Rota da Semana" not in wb.sheetnames:
        raise ValueError("A aba 'Rota da Semana' não foi localizada na planilha.")
    sheet = wb["Rota da Semana"]
    
    # Extrair data pelo nome do arquivo ou hoje
    m = re.search(r'(\d{2})[.\-_](\d{2})[.\-_](\d{4})', arquivo_path.name)
    if m:
        dia_str = f"{m.group(1)}/{m.group(2)}/{m.group(3)}"
    else:
        dia_str = datetime.date.today().strftime("%d/%m/%Y")

    itens = []
    suportes_set = set()

    for row in sheet.iter_rows(min_row=2, values_only=True):
        md = str(row[0]).strip() if row[0] is not None else ""
        if not md or "desativado" in md.lower() or "sem volume" in md.lower():
            continue

        rota = str(row[6]).strip() if len(row) > 6 and row[6] is not None else ""
        motorista = str(row[11]).strip() if len(row) > 11 and row[11] is not None else ""
        placa = str(row[12]).strip() if len(row) > 12 and row[12] is not None else ""
        contato = str(row[13]).strip() if len(row) > 13 and row[13] is not None else ""
        suporte = str(row[15]).strip() if len(row) > 15 and row[15] is not None else "SEM SUPORTE"

        if not motorista or "desativado" in motorista.lower() or "sem volume" in motorista.lower():
            continue

        # Normalizar telefone (apenas digitos)
        tel_limpo = re.sub(r'\D', '', contato)
        if len(tel_limpo) == 10:  # adiciona 9 se antigo
            tel_limpo = tel_limpo[:2] + "9" + tel_limpo[2:]
        if len(tel_limpo) == 11 and not tel_limpo.startswith("55"):
            tel_formatado = f"55{tel_limpo}"
        elif len(tel_limpo) == 13:
            tel_formatado = tel_limpo
        else:
            tel_formatado = tel_limpo

        itens.append({
            "md": md,
            "rota": rota,
            "motorista": motorista,
            "placa": placa,
            "contato": contato,
            "telefone_wpp": tel_formatado,
            "suporte": suporte.upper(),
        })
        suportes_set.add(suporte.upper())

    return {
        "arquivo": arquivo_path.name,
        "dia_base": dia_str,
        "total_mds_ativos": len(itens),
        "suportes": sorted(list(suportes_set)),
        "itens": itens
    }


# ==============================================================================
# ENDPOINTS DA API
# ==============================================================================

@router.get("/status")
def get_vtag_status():
    """Retorna o status geral: planilha carregada, token anjun, totais e suportes."""
    token_status = verificar_status_token()
    arquivo_rotas = encontrar_planilha_rotas_recente()
    
    if not arquivo_rotas:
        return {
            "possui_planilha": False,
            "token_status": token_status,
            "mensagem": "Nenhuma planilha localizada em C:\\ANJUN\\PLANILHA DE ROTAS."
        }

    try:
        dados = ler_dados_planilha_rotas(arquivo_rotas)
    except Exception as e:
        return {
            "possui_planilha": True,
            "arquivo": arquivo_rotas.name,
            "token_status": token_status,
            "erro_leitura": str(e)
        }

    # Consultar no banco quantas VTAGs já foram emitidas para esta data
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            COUNT(DISTINCT md_codigo) as mds_com_vtag,
            COUNT(DISTINCT motorista) as motoristas_com_vtag,
            COUNT(CASE WHEN status_envio = 'ENVIADO' THEN 1 END) as total_enviados,
            COUNT(*) as total_vtags_geradas
        FROM vtags_geradas
        WHERE dia_base = ?
    """, (dados["dia_base"],))
    stats = dict(cursor.fetchone())
    conn.close()

    motoristas_unicos = set(i["motorista"] for i in dados["itens"])

    return {
        "possui_planilha": True,
        "arquivo": dados["arquivo"],
        "dia_base": dados["dia_base"],
        "token_status": token_status,
        "total_mds_planilha": dados["total_mds_ativos"],
        "total_motoristas_planilha": len(motoristas_unicos),
        "suportes_disponiveis": ["TODOS"] + dados["suportes"],
        "lista_mds": sorted(list(set(i["md"] for i in dados["itens"]))),
        "estatisticas_banco": stats
    }


@router.get("/motoristas")
def get_motoristas_agrupados(
    suporte: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    status_filtro: Optional[str] = Query("TODOS")
):
    """
    Retorna os motoristas do dia agrupados com seus respectivos MDs,
    status de envio no WhatsApp e links das VTAGs geradas.
    """
    arquivo_rotas = encontrar_planilha_rotas_recente()
    if not arquivo_rotas:
        raise HTTPException(status_code=404, detail="Planilha de rotas não encontrada na pasta.")

    dados = ler_dados_planilha_rotas(arquivo_rotas)
    dia_base = dados["dia_base"]

    # Carregar VTAGs existentes no banco para o dia
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT md_codigo, tag_number, status_envio, enviado_por, enviado_em, imagem_nome
        FROM vtags_geradas
        WHERE dia_base = ?
    """, (dia_base,))
    vtags_db = cursor.fetchall()

    cursor.execute("""
        SELECT motorista, status_envio, enviado_por, enviado_em 
        FROM vtags_disparos_motoristas
        WHERE dia_base = ?
    """, (dia_base,))
    disparos_rows = cursor.fetchall()
    conn.close()

    disparos_map = {r["motorista"]: r for r in disparos_rows}

    # Mapear VTAGs por MD
    md_to_vtags: Dict[str, List[Dict[str, Any]]] = {}
    md_status_envio: Dict[str, Dict[str, Any]] = {}
    for row in vtags_db:
        md = row["md_codigo"]
        if md not in md_to_vtags:
            md_to_vtags[md] = []
        md_to_vtags[md].append({
            "tag_number": row["tag_number"],
            "imagem_url": f"/api/vtags/imagem/{row['imagem_nome']}" if row["imagem_nome"] else None
        })
        if row["status_envio"] == "ENVIADO":
            md_status_envio[md] = {
                "status": "ENVIADO",
                "enviado_por": row["enviado_por"],
                "enviado_em": row["enviado_em"]
            }

    # Agrupar itens por Motorista
    motoristas_map: Dict[str, Dict[str, Any]] = {}
    for item in dados["itens"]:
        mot = item["motorista"]
        disp = disparos_map.get(mot)
        if mot not in motoristas_map:
            motoristas_map[mot] = {
                "motorista": mot,
                "placa": item["placa"],
                "rota": item["rota"],
                "contato": item["contato"],
                "telefone_wpp": item["telefone_wpp"],
                "suporte": item["suporte"],
                "mds": [],
                "total_vtags": 0,
                "status_envio": disp["status_envio"] if disp else "PENDENTE",
                "enviado_por": disp["enviado_por"] if disp else None,
                "enviado_em": disp["enviado_em"] if disp else None
            }
        
        md_cod = item["md"]
        vtags_do_md = md_to_vtags.get(md_cod, [])
        motoristas_map[mot]["mds"].append({
            "md_codigo": md_cod,
            "vtags": vtags_do_md
        })
        motoristas_map[mot]["total_vtags"] += len(vtags_do_md)

        if md_cod in md_status_envio:
            motoristas_map[mot]["status_envio"] = "ENVIADO"
            motoristas_map[mot]["enviado_por"] = md_status_envio[md_cod]["enviado_por"]
            motoristas_map[mot]["enviado_em"] = md_status_envio[md_cod]["enviado_em"]

    resultado = list(motoristas_map.values())

    # Aplicar filtros
    if suporte and suporte.upper() != "TODOS":
        sup_up = suporte.upper().strip()
        resultado = [m for m in resultado if m["suporte"] == sup_up]

    if status_filtro and status_filtro.upper() != "TODOS":
        st_up = status_filtro.upper().strip()
        resultado = [m for m in resultado if m["status_envio"] == st_up]

    if search and search.strip():
        q = search.lower().strip()
        resultado = [
            m for m in resultado
            if q in m["motorista"].lower()
            or q in m["placa"].lower()
            or q in m["rota"].lower()
            or q in m["suporte"].lower()
            or any(q in md_info["md_codigo"].lower() for md_info in m["mds"])
        ]

    # Ordenação: Pendentes primeiro, depois por nome do motorista
    resultado.sort(key=lambda x: (0 if x["status_envio"] == "PENDENTE" else 1, x["motorista"]))

    return {
        "dia_base": dia_base,
        "total_motoristas": len(resultado),
        "total_enviados": sum(1 for m in resultado if m["status_envio"] == "ENVIADO"),
        "total_pendentes": sum(1 for m in resultado if m["status_envio"] == "PENDENTE"),
        "motoristas": resultado
    }


@router.post("/gerar-vtags-anjun")
def gerar_vtags_em_lote(
    suporte: Optional[str] = Query(None),
    md_codigo: Optional[str] = Query(None),
    qtd_por_md: int = Query(2, ge=1, le=5),
    usuario: Optional[str] = Query(None),
    forcar: bool = Query(False)
):
    u_norm = (usuario or "").strip().lower()
    if u_norm not in ["diego", "ellen", "admin", "mandarino"]:
        raise HTTPException(
            status_code=403, 
            detail="Acesso negado. Apenas Diego (Master) ou Ellen (Líder da Torre) podem gerar as VTAGs oficiais."
        )
    """
    Chama a API oficial da Anjun (POST /collectTagNumber/createTagNumber)
    para os MDs ativos da planilha do dia (ou um MD específico), gerando VTAGs oficiais,
    baixando o PDF e fatiando as imagens de código de barras prontas para WhatsApp.
    """
    token_status = verificar_status_token()
    if not token_status.get("valido"):
        raise HTTPException(status_code=401, detail="Sessão com a Anjun inválida ou expirada. Atualize o token.")

    arquivo_rotas = encontrar_planilha_rotas_recente()
    if not arquivo_rotas:
        raise HTTPException(status_code=404, detail="Planilha de rotas não encontrada na pasta.")

    dados = ler_dados_planilha_rotas(arquivo_rotas)
    itens_alvo = dados["itens"]

    if md_codigo:
        target_md = md_codigo.strip().upper()
        md_encontrados = [i for i in dados["itens"] if i["md"].strip().upper() == target_md]
        if md_encontrados:
            itens_alvo = md_encontrados
        else:
            # MD avulso (caso queira gerar teste ou ponto fora da planilha)
            itens_alvo = [{
                "md": target_md,
                "rota": "AVULSO",
                "motorista": "AVULSO",
                "placa": "-",
                "contato": "",
                "telefone_wpp": "",
                "suporte": "TORRE"
            }]
    elif suporte and suporte.upper() != "TODOS":
        sup_up = suporte.upper().strip()
        itens_alvo = [i for i in itens_alvo if i["suporte"] == sup_up]

    if not itens_alvo:
        raise HTTPException(status_code=400, detail="Nenhum MD encontrado para os critérios de filtro.")

    headers = obter_headers_anjun()
    base_admin = "https://newmanage.anjunexpress.com/admin"

    # 1. Obter mapa de siteId da Anjun
    try:
        resp_sites = requests.get(f"{base_admin}/site/queryOwnSite", headers=headers, timeout=15)
        if resp_sites.status_code != 200:
            raise HTTPException(status_code=502, detail="Falha ao obter catálogo de sites da Anjun.")
        sites_list = resp_sites.json().get("data", [])
        site_name_to_id = {s.get("name", "").strip().upper(): s.get("id") for s in sites_list if s.get("name")}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro de conexão com API Anjun: {e}")

    mds_gerados = 0
    vtags_salvas = 0
    falhas = []

    dia_base = dados["dia_base"]
    conn = get_db()
    cursor = conn.cursor()

    # Cria pasta do dia para salvar as imagens renderizadas
    dia_safe = dia_base.replace("/", "-")
    dia_folder = STATIC_VTAGS_DIR / dia_safe
    dia_folder.mkdir(parents=True, exist_ok=True)

    # 2. Loop de geração para cada MD
    # Evita re-gerar para MDs que já possuem VTAG gerada hoje
    cursor.execute("SELECT DISTINCT md_codigo FROM vtags_geradas WHERE dia_base = ?", (dia_base,))
    mds_ja_gerados = set(r[0] for r in cursor.fetchall())

    if md_codigo and forcar:
        target_norm = md_codigo.strip().upper()
        cursor.execute("DELETE FROM vtags_geradas WHERE dia_base = ? AND md_codigo = ?", (dia_base, target_norm))
        conn.commit()
        mds_ja_gerados.discard(target_norm)

    for item in itens_alvo:
        md_cod = item["md"]
        if md_cod in mds_ja_gerados and not (md_codigo and forcar):
            continue

        site_id = site_name_to_id.get(md_cod.upper())
        if not site_id:
            falhas.append(f"{md_cod}: ID não localizado na Anjun")
            continue

        payload_gerar = {
            "printQty": qtd_por_md,
            "siteId": site_id
        }

        try:
            r_gen = requests.post(f"{base_admin}/collectTagNumber/createTagNumber", headers=headers, json=payload_gerar, timeout=12)
            res_json = r_gen.json()
            if res_json.get("code") != 200:
                falhas.append(f"{md_cod}: {res_json.get('msg', 'Erro desconhecido na Anjun')}")
                continue

            mds_gerados += 1

            # Buscar os detalhes dos números gerados
            time.sleep(0.05)  # pausa curta amigável
            r_det = requests.post(
                f"{base_admin}/collectTagNumber/page",
                headers=headers,
                json={"pageNumber": 1, "pageSize": 1, "params": {"siteId": site_id}},
                timeout=12
            )
            rec_master = r_det.json().get("data", {}).get("records", [])
            tag_master_id = rec_master[0].get("id") if rec_master else None
            print_url = rec_master[0].get("printUrl") if rec_master else None

            # Obter a URL de impressao oficial do PDF na nuvem via /printTagNumber com metadados (garante Belonging Point com nome do MD)
            if tag_master_id:
                try:
                    r_p = requests.post(
                        f"{base_admin}/collectTagNumber/printTagNumber",
                        headers=headers,
                        json={
                            "tagNumberId": tag_master_id,
                            "siteId": site_id,
                            "siteName": md_cod,
                            "printQty": qtd_por_md
                        },
                        timeout=12
                    )
                    res_p_data = r_p.json().get("data")
                    if res_p_data and str(res_p_data).startswith("http"):
                        print_url = res_p_data
                except Exception as ep:
                    print(f"Aviso ao chamar printTagNumber para {md_cod}: {ep}")

            # Baixar o PDF oficial se disponível e renderizar as imagens das páginas
            tags_detalhes = []
            if tag_master_id:
                r_items = requests.post(
                    f"{base_admin}/collectTagNumberDetail/page",
                    headers=headers,
                    json={"pageNumber": 1, "pageSize": qtd_por_md, "params": {"tagNumberId": tag_master_id}},
                    timeout=12
                )
                tags_detalhes = r_items.json().get("data", {}).get("records", [])

            # Renderização das imagens PNG a partir do PDF da Anjun
            img_nomes = []
            if print_url:
                try:
                    pdf_bytes = requests.get(print_url, timeout=15).content
                    doc_pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
                    for p_idx, page in enumerate(doc_pdf):
                        pix = page.get_pixmap(dpi=200)
                        # Nome da VTAG associada
                        v_cod = tags_detalhes[p_idx].get("tagNumber") if p_idx < len(tags_detalhes) else f"VTAG_{p_idx+1}"
                        img_filename = f"{dia_safe}_{md_cod}_{v_cod}.png"
                        pix.save(str(dia_folder / img_filename))
                        img_nomes.append((v_cod, img_filename))
                except Exception as err_pdf:
                    print(f"Aviso ao renderizar PDF do {md_cod}: {err_pdf}")

            # Gravar no banco de dados
            if tags_detalhes:
                for idx_tag, tag_item in enumerate(tags_detalhes):
                    t_num = tag_item.get("tagNumber")
                    img_match = next((im[1] for im in img_nomes if im[0] == t_num), None)
                    cursor.execute("""
                        INSERT OR REPLACE INTO vtags_geradas (
                            dia_base, md_codigo, site_id, tag_number, motorista, placa, rota, contato, suporte, imagem_nome
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        dia_base, md_cod, site_id, t_num,
                        item["motorista"], item["placa"], item["rota"], item["contato"], item["suporte"],
                        img_match
                    ))
                    vtags_salvas += 1
            else:
                # Fallback caso não retorne o detalhe imediato
                cursor.execute("""
                    INSERT OR REPLACE INTO vtags_geradas (
                        dia_base, md_codigo, site_id, tag_number, motorista, placa, rota, contato, suporte, imagem_nome
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    dia_base, md_cod, site_id, f"PEND_{md_cod}",
                    item["motorista"], item["placa"], item["rota"], item["contato"], item["suporte"],
                    None
                ))
                vtags_salvas += 1

            conn.commit()

        except Exception as e_req:
            falhas.append(f"{md_cod}: Exceção {e_req}")

    conn.close()

    return {
        "status": "sucesso",
        "dia_base": dia_base,
        "mds_gerados_nesta_execucao": mds_gerados,
        "vtags_salvas": vtags_salvas,
        "total_falhas": len(falhas),
        "falhas": falhas[:20]
    }


@router.post("/marcar-enviado")
def marcar_como_enviado(payload: Dict[str, Any] = Body(...)):
    """Marca todos os MDs de um determinado motorista como ENVIADO."""
    dia_base = payload.get("dia_base")
    motorista = payload.get("motorista")
    enviado_por = payload.get("enviado_por", "Operador Suporte")

    if not dia_base or not motorista:
        raise HTTPException(status_code=400, detail="dia_base e motorista são obrigatórios.")

    agora = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
    conn = get_db()
    cursor = conn.cursor()
    suporte = payload.get("suporte", "")
    placa = payload.get("placa", "")

    cursor.execute("""
        INSERT INTO vtags_disparos_motoristas (dia_base, motorista, placa, suporte, status_envio, enviado_por, enviado_em)
        VALUES (?, ?, ?, ?, 'ENVIADO', ?, ?)
        ON CONFLICT(dia_base, motorista) DO UPDATE SET
            status_envio = 'ENVIADO',
            enviado_por = excluded.enviado_por,
            enviado_em = excluded.enviado_em;
    """, (dia_base, motorista, placa, suporte, enviado_por, agora))

    cursor.execute("""
        UPDATE vtags_geradas
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


@router.post("/atualizar-token")
def atualizar_token_anjun(payload: Dict[str, str] = Body(...)):
    """Atualiza o token de autenticação no arquivo anjun_api_config.json."""
    novo_token = payload.get("token", "").strip()
    if not novo_token:
        raise HTTPException(status_code=400, detail="Token não pode ser vazio.")

    cfg = carregar_config_anjun()
    cfg["token"] = novo_token
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar configuração: {e}")

    status_novo = verificar_status_token()
    return {"status": "sucesso", "token_status": status_novo}


@router.get("/imagem/{imagem_nome}")
def get_vtag_imagem(imagem_nome: str):
    """Serve a imagem renderizada da VTAG."""
    # Busca recursiva na pasta de static vtags
    for p in STATIC_VTAGS_DIR.rglob(imagem_nome):
        if p.is_file():
            return FileResponse(str(p), media_type="image/png")
    raise HTTPException(status_code=404, detail="Imagem da VTAG não localizada.")
