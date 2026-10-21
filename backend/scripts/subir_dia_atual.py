# -*- coding: utf-8 -*-
r"""
subir_dia_atual.py — Ingestão em Tempo Real (No Dia / Intraday)
Permite subir a planilha do dia corrente ao longo do dia para acompanhar a evolução em tempo real.
"""

import sys
import os
import re
import time
import datetime
from pathlib import Path

# Ajustar saída para UTF-8 sem travar no Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ajustar PYTHONPATH
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

try:
    from services.ingestao_streaming_500mb import processar_arquivo_streaming
except Exception as e:
    print(f"\n[ERRO] Falha ao importar motor de ingestão: {e}")
    sys.exit(1)


def localizar_planilha_downloads() -> Path | None:
    """Busca a planilha operacional mais recente na pasta Downloads, planilhas_entrada ou C:\ANJUN."""
    pastas_busca = [
        BACKEND_DIR.parent,
        Path.home() / "Downloads",
        BACKEND_DIR / "planilhas_entrada",
        BACKEND_DIR.parent / "planilhas_entrada"
    ]
    
    padroes_relevantes = [
        "*Receber*ordens*.xlsx",
        "*receber*bin*detalhe*.xlsx",
        "*relat*rio*.xlsx",
        "*coleta*.xlsx",
        "*operacional*.xlsx",
        "*.xlsx",
        "*.csv"
    ]
    
    candidatos = []
    for pasta in pastas_busca:
        if not pasta.exists():
            continue
        for padrao in padroes_relevantes:
            for arq in pasta.glob(padrao):
                if arq.is_file() and not arq.name.startswith("~$"):
                    try:
                        mtime = arq.stat().st_mtime
                        candidatos.append((mtime, arq))
                    except Exception:
                        pass
        if candidatos:
            break
            
    if not candidatos:
        return None
        
    candidatos.sort(key=lambda x: x[0], reverse=True)
    return candidatos[0][1]


def renderizar_barra_progresso(prog: dict):
    """Renderiza a barra de progresso em tempo real."""
    pct = prog.get("pct", 0.0)
    linhas = prog.get("linhas_processadas", 0)
    total = prog.get("total_linhas", 0)
    taxa = prog.get("linhas_por_segundo", 0)
    restante = prog.get("tempo_restante_str", "")
    mensagem = prog.get("mensagem", "")

    largura_barra = 25
    preenchidos = int((pct / 100.0) * largura_barra)
    barra = "=" * preenchidos + ">" if preenchidos < largura_barra else "=" * largura_barra
    barra = barra.ljust(largura_barra, " ")

    if taxa > 0 and restante:
        info_str = f"[{barra}] {pct:>5.1f}% | {linhas:>7,}/{total:,} lin | {taxa:>6,}/s | Restam ~{restante}"
    else:
        info_str = f"[{barra}] {pct:>5.1f}% | {mensagem[:40]}"

    sys.stdout.write(f"\r  {info_str:<85}")
    sys.stdout.flush()


def main():
    print("=" * 80)
    print("     TORRE DE CONTROLE ANJUN - CARGA EM TEMPO REAL (NO DIA / INTRADAY)")
    print("=" * 80)
    
    arquivos_alvo = []
    data_override = None
    data_hoje = datetime.date.today().strftime("%d/%m/%Y")

    # Suporte a arquivos passados com ou sem aspas (mesmo com espaços no nome)
    full_arg = " ".join(sys.argv[1:]).strip().strip('"')
    if full_arg and Path(full_arg).is_file() and Path(full_arg).suffix.lower() in [".xlsx", ".xls", ".csv"]:
        arquivos_alvo.append(Path(full_arg))
    else:
        for arg in sys.argv[1:]:
            clean_arg = arg.strip().strip('"')
            if not clean_arg:
                continue
            p = Path(clean_arg)
            if p.is_file() and p.suffix.lower() in [".xlsx", ".xls", ".csv"]:
                arquivos_alvo.append(p)
            elif re.match(r"^\d{2}/\d{2}/\d{4}$|^\d{4}-\d{2}-\d{2}$", clean_arg):
                data_override = clean_arg

    if not arquivos_alvo:
        print("\n🔍 Procurando planilha do dia na pasta Downloads...")
        encontrado = localizar_planilha_downloads()
        if encontrado:
            arquivos_alvo.append(encontrado)
        
    if not arquivos_alvo:
        print("\n❌ Nenhuma planilha operacional (.xlsx ou .csv) encontrada na pasta Downloads!")
        print("💡 Dica: Você pode arrastar o arquivo .xlsx para cima do 'subir_dia_atual.bat'")
        return 1

    # Por padrão na carga "No Dia", se não informado override, assume a data de hoje
    data_final = data_override or data_hoje

    for idx, arquivo_alvo in enumerate(arquivos_alvo, 1):
        tam_mb = round(arquivo_alvo.stat().st_size / (1024 * 1024), 2)
        mtime_dt = datetime.datetime.fromtimestamp(arquivo_alvo.stat().st_mtime).strftime("%d/%m/%Y %H:%M:%S")
        
        print("\n" + "-" * 80)
        print(f"📁 [{idx}/{len(arquivos_alvo)}] Sincronizando Operação do Dia:")
        print(f"   Nome: {arquivo_alvo.name}")
        print(f"   Tamanho: {tam_mb} MB")
        print(f"   Modificado em: {mtime_dt}")
        print(f"📅 Data Operacional em Tempo Real: {data_final}")
        print("\n🚀 Ingestão em Streaming (RAM Constante < 150 MB)...")

        t_inicio = time.time()

        def cb(prog):
            renderizar_barra_progresso(prog)

        try:
            resultado = processar_arquivo_streaming(
                caminho_xlsx=str(arquivo_alvo),
                data_operacao_override=data_final,
                callback_progresso=cb
            )
            print("\r  [=========================] 100.0% | Ingestão e Agregações Finalizadas!               \n")
        except Exception as e:
            print(f"\n\n❌ Erro durante a ingestão do arquivo {arquivo_alvo.name}: {e}")
            import traceback
            traceback.print_exc()
            continue

        tempo_total = round(time.time() - t_inicio, 1)

        print("=" * 80)
        print(f"     🎉 SINCRONIZAÇÃO EM TEMPO REAL CONCLUÍDA ({data_final})!")
        print("=" * 80)
        print(f"📦 Total de Pacotes Registrados Hoje: {resultado['total_linhas_processadas']:,} linhas")
        print(f"⚡ Módulos Atualizados ao Vivo: Cockpit No Dia (/no-dia), D2D SP e Minidrops")
        print(f"⏱️ Tempo de Sincronização: {tempo_total}s (Velocidade: {round(resultado['total_linhas_processadas']/max(tempo_total, 0.1)):,} linhas/s)")
        print("=" * 80)

        res_bk = resultado.get("resumo_backlog")
        if res_bk:
            bk_tot = res_bk.get("backlog_total", 0)
            col_cam = res_bk.get("coletados_caminhao", 0)
            tx_col = res_bk.get("taxa_coleta_pct", 100.0)
            top_mds = res_bk.get("top_mds_backlog", [])
            top_hubs = res_bk.get("top_hubs", [])

            print("\n" + "=" * 80)
            print("     📊 FOTO DA OPERAÇÃO AO VIVO HOJE")
            print("=" * 80)
            print(f"🚚 Pacotes Já Coletados/Em Trânsito: {col_cam:,} ({tx_col}%)")
            print(f"🏢 Pacotes Bipados Aguardando Coleta no Ponto: {bk_tot:,} ({round(100.0 - tx_col, 1)}%)")
            
            if top_mds:
                print("\n📍 Top Mini Drops (MDs) com Maior Carga no Momento (Balcões):")
                print(f"   {'CÓDIGO MD':<20} | {'RETIDO NO MD':<16} | {'DESTINO SP':<12} | {'OUTRAS UFs':<12}")
                print("   " + "-" * 66)
                for m in top_mds:
                    print(f"   {m['md_codigo']:<20} | {m['backlog_retido']:>6,} pacotes     | {m['sp_bipados']:>5,} pcts   | {m['outros_bipados']:>5,} pcts")

            if top_hubs:
                print("\n🏭 Top HUBs e Galpões de Transferência (Volume Operacional):")
                print(f"   {'UNIDADE':<20} | {'TIPO':<10} | {'VOLUME TOTAL':<14} | {'RETIDO':<12}")
                print("   " + "-" * 66)
                for h in top_hubs:
                    print(f"   {h['hub_codigo']:<20} | {h['tipo']:<10} | {h['volume_total']:>6,} pacotes   | {h['backlog_retido']:>6,} pcts")
            print("=" * 80)

    try:
        from scripts.exportar_snapshot_online import gerar_snapshots, publicar_github
        gerar_snapshots(max_dias=5)
        publicar_github()
    except Exception as e_snap:
        print(f"\n⚠️ Aviso ao atualizar snapshot online: {e_snap}")

    print("\n💡 A tela 'No Dia' (Local e Online) já está atualizada com a foto ao vivo!")
    return 0


if __name__ == "__main__":
    codigo = main()
    print("\nPressione ENTER para fechar esta janela...")
    try:
        input()
    except Exception:
        pass
    sys.exit(codigo)
