# -*- coding: utf-8 -*-
"""
limpar_planilha.py — Reduz planilhas XLSX gigantes (até 300MB+)

Lê a planilha com python-calamine (rápido e barato em memória), mantém SOMENTE
as colunas que o backend consome (mesmo mapeamento de backend/services/operacional.py
-> mapear_colunas) e aplica filtros de linha:

  - Estado: mantém apenas estados brasileiros (26 UF + DF). Aceita "SP", "sp",
    "Sao Paulo", "SÃO PAULO", "sao paulo" etc. e normaliza para a sigla (SP).
  - MD (Ponto de Coleta): remove o ponto "SP-R-TFK001" (exato, sem diferenciar
    maiúsculas).

Uso:
    python limpar_planilha.py "C:/caminho/planilha_original.xlsx"
    python limpar_planilha.py "origem.xlsx" "destino_filtrado.xlsx"

A saída padrão é o mesmo caminho da origem com sufixo "_filtrado.xlsx".
A escrita é feita em streaming (chunks) para não estourar a memória.
"""

import sys
import unicodedata
from pathlib import Path

from python_calamine import CalamineWorkbook
from openpyxl import Workbook

# Colunas que o backend realmente usa (ordem do mapear_colunas)
TARGET_COLS = [
    "barcode", "id_cliente", "saca", "maneira_coleta", "tempo_criacao",
    "tempo_previsto", "tempo_coleta", "status", "md", "merchant_id",
    "merchant_nome", "cep_remetente", "estado", "cidade", "bairro",
    "endereco", "tipo_pedido",
]

# Palavras-chave por coluna (mesma lógica flexível do backend)
COL_KEYWORDS = {
    "barcode": ["codigodebarras", "barcode"],
    "id_cliente": ["nodocliente", "numcliente", "idcliente"],
    "saca": ["numerodasaca", "saca", "lacre"],
    "maneira_coleta": ["maneiradecoleta", "tipocoleta", "modalidade"],
    "tempo_criacao": ["tempodecriacaodopedido", "datacriacao", "tempodecriacao"],
    "tempo_previsto": ["tempoprevisto", "dataprevista"],
    "tempo_coleta": ["temporeal", "tempocoleta", "datacoleta"],
    "status": ["statusdopedido", "status"],
    "md": ["pontodecolecao", "md", "minidrop", "iata"],
    "merchant_id": ["numerodoclientecomerciante", "idmerchant", "codigoseller"],
    "merchant_nome": ["nomedoclientemerchant", "merchantnome", "nomeseller"],
    "cep_remetente": ["cepremetente", "ceporigem", "cepenvio", "cep"],
    "estado": ["estadoorigem", "estadoremetente", "estadoenvio", "estado", "uf"],
    "cidade": ["cidadeorigem", "cidaderemetente", "cidadeenvio", "cidade", "municipio"],
    "bairro": ["areadoenvio", "bairro"],
    "endereco": ["enderecodoenvio", "endereco"],
    "tipo_pedido": ["tipodopedido", "tipopedido"],
}

# Siglas válidas: 26 estados + DF
UFS_VALIDAS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
}

# Nome completo (sem acento) -> UF
UF_POR_NOME = {
    "ACRE": "AC", "ALAGOAS": "AL", "AMAPA": "AP", "AMAZONAS": "AM",
    "BAHIA": "BA", "CEARA": "CE", "DISTRITOFEDERAL": "DF", "ESPIRITOSANTO": "ES",
    "GOIAS": "GO", "MARANHAO": "MA", "MATOGROSSO": "MT", "MATOGROSSODOSUL": "MS",
    "MINASGERAIS": "MG", "PARA": "PA", "PARAIBA": "PB", "PARANA": "PR",
    "PERNAMBUCO": "PE", "PIAUI": "PI", "RIODEJANEIRO": "RJ", "RIOGRANDEDONORTE": "RN",
    "RIOGRANDEDOSUL": "RS", "RONDONIA": "RO", "RORAIMA": "RR", "SANTACATARINA": "SC",
    "SAOPAULO": "SP", "SERGIPE": "SE", "TOCANTINS": "TO",
}

MD_EXCLUIR = "SP-R-TFK001"


def normalizar(texto: str) -> str:
    """Remove acentos, espaços e coloca em maiúsculas."""
    if texto is None:
        return ""
    t = unicodedata.normalize("NFD", str(texto))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return t.replace(" ", "").upper()


def uf_string_para_sigla(valor) -> str | None:
    """'Sao Paulo'/'SP'/'são paulo' -> 'SP'; retorna None se não for estado BR."""
    t = normalizar(valor)
    if not t:
        return None
    if len(t) == 2 and t in UFS_VALIDAS:
        return t
    return UF_POR_NOME.get(t)


def mapear_cabecalho(header_row) -> dict:
    """Header da planilha -> nome canônico da coluna (TARGET_COLS)."""
    col_map: dict[int, str] = {}
    encontrados = set()

    for idx, cel in enumerate(header_row):
        c = normalizar(cel)
        if not c:
            continue
        best = None
        for target, keywords in COL_KEYWORDS.items():
            if target in encontrados:
                continue
            for kw in keywords:
                if kw.upper() in c:
                    best = target
                    break
            if best:
                break
        # Refinamento: 'md' não pode ser 'md real'/'entrega'
        if best == "md" and ("real" in c or "entrega" in c):
            best = None
        if best and best not in encontrados:
            col_map[idx] = best
            encontrados.add(best)
    return col_map


def esvazia(valor) -> bool:
    return valor is None or (isinstance(valor, float) and valor != valor)  # NaN


def main():
    if len(sys.argv) < 2:
        print("Uso: python limpar_planilha.py <origem.xlsx> [destino.xlsx]")
        sys.exit(1)

    origem = Path(sys.argv[1])
    destino = Path(sys.argv[2]) if len(sys.argv) > 2 else origem.with_name(origem.stem + "_filtrado.xlsx")

    if not origem.exists():
        print(f"ERRO: arquivo não encontrado: {origem}")
        sys.exit(1)

    print(f"Origem : {origem} ({origem.stat().st_size / 1024 / 1024:.1f} MB)")
    print("Abrindo workbook com calamine...")
    wb = CalamineWorkbook.from_path(str(origem))
    print(f"Sheets: {wb.sheet_names}")

    # Escolhe a planilha com o cabeçalho mais compatível
    melhor_sheet = None
    melhor_cols = []
    melhor_meta = None
    for nome in wb.sheet_names:
        sheet = wb.get_sheet_by_name(nome)
        it = sheet.iter_rows()
        first = next(it, None) or []
        cmap = mapear_cabecalho(first)
        if len(cmap) > len(melhor_cols):
            melhor_sheet, melhor_cols, melhor_meta = sheet, cmap, first

    if not melhor_cols or len(melhor_cols) < 3:
        print("ERRO: nenhuma planilha com cabeçalho reconhecível (mínimo 3 colunas mapeadas).")
        print("Cabeçalhos encontrados:", [normalizar(c) for c in melhor_meta or []])
        sys.exit(1)

    print(f"Usando sheet '{melhor_sheet.name}' com {len(melhor_cols)} colunas mapeadas.")
    print("Colunas que SERÃO MANTIDAS:", list(melhor_cols.values()))
    descartadas = [normalizar(c) for i, c in enumerate(melhor_meta) if i not in melhor_cols]
    print(f"{len(descartadas)} colunas serão DESCARTADAS: {descartadas}")

    # Ordem canônica das colunas na saída
    ordem = [t for t in TARGET_COLS if t in melhor_cols.values()]
    idx_por_target = {target: idx for idx, target in melhor_cols.items()}

    print(f"Filtros: apenas estados BR (26+DF), excluindo MD '{MD_EXCLUIR}'")
    print("Processando linha a linha (streaming, memória constante)...\n")

    wb_out = Workbook(write_only=True)
    ws_out = wb_out.create_sheet(title="dados")
    ws_out.append(ordem)

    total_linhas = 0
    mantidas = 0
    remov_estado = 0
    remov_md = 0

    linha_iter = melhor_sheet.iter_rows()
    next(linha_iter, None)  # pula o cabeçalho já mapeado
    for linha in linha_iter:
        total_linhas += 1

        # Filtro de estado
        idx_estado = melhor_cols.get("estado")
        if idx_estado is not None:
            uf = uf_string_para_sigla(linha[idx_estado] if idx_estado < len(linha) else None)
            if uf is None:
                remov_estado += 1
                continue
            linha[idx_estado] = uf  # normaliza para a sigla

        # Filtro de MD
        idx_md = melhor_cols.get("md")
        if idx_md is not None:
            md_val = linha[idx_md] if idx_md < len(linha) else None
            if normalizar(md_val) == MD_EXCLUIR:
                remov_md += 1
                continue

        # Monta linha canônica (sem NaN/metade vazia)
        out = []
        for target in ordem:
            v = linha[idx_por_target[target]] if idx_por_target[target] < len(linha) else None
            out.append(None if esvazia(v) else v)
        ws_out.append(out)
        mantidas += 1

        if total_linhas % 100_000 == 0:
            print(f"  ...lidas: {total_linhas:,} | mantidas: {mantidas:,}")

    wb_out.save(destino)

    print("\n" + "=" * 55)
    print(f"Linhas lidas            : {total_linhas:,}")
    print(f"Linhas mantidas         : {mantidas:,}")
    print(f"Removidas por UF invál. : {remov_estado:,}")
    print(f"Removidas (TFK001)      : {remov_md:,}")
    print(f"Saída : {destino} ({destino.stat().st_size / 1024 / 1024:.1f} MB)")
    print("=" * 55)


if __name__ == "__main__":
    main()