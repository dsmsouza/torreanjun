import os
import re
import csv
import io
import time
import uuid
import datetime
from collections import Counter
from typing import Callable, Optional, Tuple, Dict, Any

import openpyxl
import xlsxwriter

# Colunas requisitadas (0-based indices)
# B(1), D(3), E(4), F(5), H(7), K(10), L(11), M(12), O(14), P(15), S(18), U(20), V(21), W(22),
# AB(27), AE(30), AF(31), AG(32), AK(36), AL(37), AQ(42), BH(59)
INDICES_COLUNAS_MANTIDAS = [1, 3, 4, 5, 7, 10, 11, 12, 14, 15, 18, 20, 21, 22, 27, 30, 31, 32, 36, 37, 42, 59, 13]
NOMES_LETRAS_COLUNAS = ["B", "D", "E", "F", "H", "K", "L", "M", "O", "P", "S", "U", "V", "W", "AB", "AE", "AF", "AG", "AK", "AL", "AQ", "BH", "N"]
# Obs: a Coluna N (Data de conclusão = quando o pacote vira Circuito Fechado) é mantida no FINAL
# da lista para não deslocar a posição das demais colunas já usadas pela reconciliação de pacotes.

IDX_COLUNA_F = 5   # Número de escaneamento do veículo (Romaneio AJV)
IDX_COLUNA_M = 12  # Tempo real para a coleta
IDX_COLUNA_P = 15  # Ponto de coleção
IDX_COLUNA_U = 20  # Tempo de descarregamento (Chegada em Perus)
IDX_COLUNA_AQ = 42 # Estado de recebimento (Destino SP vs Outros Estados)

def extrair_data_valida(val: Any) -> Optional[str]:
    """Extrai uma data YYYY-MM-DD a partir de diferentes formatos na Coluna M."""
    if val is None:
        return None
        
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d")
        
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("nan", "none", "null", ""):
        return None
        
    # Padrão YYYY-MM-DD ou YYYY/MM/DD
    m_iso = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", val_str)
    if m_iso:
        y, m, d = m_iso.groups()
        try:
            dt = datetime.date(int(y), int(m), int(d))
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    # Padrão DD/MM/YYYY ou DD-MM-YYYY
    m_br = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", val_str)
    if m_br:
        d, m, y = m_br.groups()
        try:
            dt = datetime.date(int(y), int(m), int(d))
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    return None


def eh_ponto_valido(val_p: Any, modo: str = "central") -> bool:
    """
    Retorna True se o registro deve ser mantido de acordo com a visão:
    - modo == "no_dia": Não remove vazios nem linhas (mantém 100% dos pacotes criados para roteirização preditiva por CEP).
    - modo == "central": Descarta pontos vazios, SP-R-TFK001 e ANJUN (visão consolidada de pontos que biparam).
    """
    if modo == "no_dia":
        return True

    if val_p is None:
        return False
        
    txt = str(val_p).strip()
    if not txt or txt.lower() in ("nan", "none", "null", "-", ""):
        return False
        
    txt_upper = txt.upper()
    if "SP-R-TFK001" in txt_upper:
        return False
    if "ANJUN" in txt_upper:
        return False
        
    return True


def processar_otimizacao_streaming(
    caminho_entrada: str,
    diretorio_saida: str,
    job_id: str,
    callback_progresso: Optional[Callable[[Dict[str, Any]], None]] = None,
    modo: str = "central"
) -> Dict[str, Any]:
    """
    Processa arquivos Excel (.xlsx) ou CSV de grandes dimensões (300MB+) em streaming.
    - Mantém apenas as 18 colunas solicitadas (B, D, E, H, K, L, M, O, P, V, W, AB, AE, AF, AG, AK, AL, BH).
    - Se modo == 'central': Filtra Coluna P (descarta vazios, SP-R-TFK001, ANJUN).
    - Se modo == 'no_dia': Não remove vazios nem linhas; apenas exclui as colunas extras.
    - Inspeciona Coluna M para detectar a data de operação.
    - Grava saídas otimizadas em .xlsx (memória constante) e .csv.
    """
    os.makedirs(diretorio_saida, exist_ok=True)
    tamanho_original_bytes = os.path.getsize(caminho_entrada)
    tamanho_original_mb = round(tamanho_original_bytes / (1024 * 1024), 2)

    nome_base = f"planilha_otimizada_{job_id}"
    caminho_saida_xlsx = os.path.join(diretorio_saida, f"{nome_base}.xlsx")
    caminho_saida_csv = os.path.join(diretorio_saida, f"{nome_base}.csv")

    extensao = os.path.splitext(caminho_entrada)[1].lower()
    is_csv = extensao == ".csv"

    # Preparar gravador CSV
    arquivo_csv = open(caminho_saida_csv, mode="w", newline="", encoding="utf-8-sig")
    csv_writer = csv.writer(arquivo_csv)

    # Preparar gravador XLSX com xlsxwriter (modo constant_memory)
    workbook_xlsx = xlsxwriter.Workbook(caminho_saida_xlsx, {"constant_memory": True})
    worksheet_xlsx = workbook_xlsx.add_worksheet("Dados_Otimizados")

    linhas_totais = 0
    linhas_mantidas = 0
    linhas_descartadas = 0
    contador_datas: Counter = Counter()
    tempo_inicio = time.time()
    header_escrito = False

    try:
        if is_csv:
            # Modo CSV Streaming
            with open(caminho_entrada, mode="r", encoding="utf-8", errors="replace") as f_in:
                # Detectar delimitador (vírgula ou ponto-e-vírgula)
                sample = f_in.read(8192)
                f_in.seek(0)
                delimitador = ";" if sample.count(";") > sample.count(",") else ","
                reader = csv.reader(f_in, delimiter=delimitador)
                
                header_raw = next(reader, None)
                if header_raw:
                    header_reduzido = []
                    for idx, letra in zip(INDICES_COLUNAS_MANTIDAS, NOMES_LETRAS_COLUNAS):
                        nome_orig = header_raw[idx].strip() if idx < len(header_raw) else f"Col_{letra}"
                        header_reduzido.append(nome_orig or f"Col_{letra}")
                    
                    csv_writer.writerow(header_reduzido)
                    worksheet_xlsx.write_row(0, 0, header_reduzido)
                    header_escrito = True

                for row in reader:
                    linhas_totais += 1
                    val_p = row[IDX_COLUNA_P] if len(row) > IDX_COLUNA_P else None
                    if not eh_ponto_valido(val_p, modo=modo):
                        linhas_descartadas += 1
                    else:
                        val_m = row[IDX_COLUNA_M] if len(row) > IDX_COLUNA_M else None
                        dt = extrair_data_valida(val_m)
                        if dt:
                            contador_datas[dt] += 1

                        linha_reduzida = [row[idx] if idx < len(row) else "" for idx in INDICES_COLUNAS_MANTIDAS]
                        csv_writer.writerow(linha_reduzida)
                        worksheet_xlsx.write_row(linhas_mantidas + 1, 0, linha_reduzida)
                        linhas_mantidas += 1

                    if linhas_totais % 20000 == 0 and callback_progresso:
                        callback_progresso({
                            "linhas_totais": linhas_totais,
                            "linhas_mantidas": linhas_mantidas,
                            "linhas_descartadas": linhas_descartadas,
                            "tempo_decorrido": round(time.time() - tempo_inicio, 1)
                        })

        else:
            # Modo Excel Streaming (.xlsx)
            wb_in = openpyxl.load_workbook(caminho_entrada, read_only=True, data_only=True)
            ws_in = wb_in.active

            rows_iter = ws_in.iter_rows(values_only=True)
            header_raw = next(rows_iter, None)
            
            if header_raw:
                header_reduzido = []
                for idx, letra in zip(INDICES_COLUNAS_MANTIDAS, NOMES_LETRAS_COLUNAS):
                    nome_orig = str(header_raw[idx]).strip() if idx < len(header_raw) and header_raw[idx] is not None else f"Col_{letra}"
                    header_reduzido.append(nome_orig or f"Col_{letra}")

                csv_writer.writerow(header_reduzido)
                worksheet_xlsx.write_row(0, 0, header_reduzido)
                header_escrito = True

            for row in rows_iter:
                linhas_totais += 1
                val_p = row[IDX_COLUNA_P] if len(row) > IDX_COLUNA_P else None
                if not eh_ponto_valido(val_p, modo=modo):
                    linhas_descartadas += 1
                else:
                    val_m = row[IDX_COLUNA_M] if len(row) > IDX_COLUNA_M else None
                    dt = extrair_data_valida(val_m)
                    if dt:
                        contador_datas[dt] += 1

                    linha_reduzida = [row[idx] if idx < len(row) and row[idx] is not None else "" for idx in INDICES_COLUNAS_MANTIDAS]
                    csv_writer.writerow(linha_reduzida)
                    worksheet_xlsx.write_row(linhas_mantidas + 1, 0, linha_reduzida)
                    linhas_mantidas += 1

                if linhas_totais % 20000 == 0 and callback_progresso:
                    callback_progresso({
                        "linhas_totais": linhas_totais,
                        "linhas_mantidas": linhas_mantidas,
                        "linhas_descartadas": linhas_descartadas,
                        "tempo_decorrido": round(time.time() - tempo_inicio, 1)
                    })

            wb_in.close()

    finally:
        arquivo_csv.close()
        workbook_xlsx.close()

    # Informações estatísticas finais
    tamanho_final_xlsx = os.path.getsize(caminho_saida_xlsx)
    tamanho_final_mb = round(tamanho_final_xlsx / (1024 * 1024), 2)
    reducao_pct = round((1 - (tamanho_final_xlsx / max(tamanho_original_bytes, 1))) * 100, 1)

    data_predominante = contador_datas.most_common(1)[0][0] if contador_datas else None
    distribuicao_datas = dict(contador_datas.most_common(5))

    resultado = {
        "job_id": job_id,
        "linhas_totais": linhas_totais,
        "linhas_mantidas": linhas_mantidas,
        "linhas_descartadas": linhas_descartadas,
        "tamanho_original_mb": tamanho_original_mb,
        "tamanho_final_mb": tamanho_final_mb,
        "reducao_pct": reducao_pct,
        "data_detectada": data_predominante,
        "distribuicao_datas": distribuicao_datas,
        "arquivo_xlsx": f"{nome_base}.xlsx",
        "arquivo_csv": f"{nome_base}.csv",
        "tempo_total_segundos": round(time.time() - tempo_inicio, 1)
    }

    return resultado
