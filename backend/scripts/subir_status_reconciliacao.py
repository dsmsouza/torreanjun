# -*- coding: utf-8 -*-
r"""
subir_status_reconciliacao.py — Carga Dedicada de Atualizacao de Status & Reconciliacao do Mes.

Destaques:
  - Aceita planilhas de corte por status (ex: so Circuito Fechado, so Backlog, ou corte do mes)
  - Le linha a linha a Coluna M (Tempo real para a coleta) e Coluna N (Data de conclusao)
  - Atualiza o status de cada pacote no seu dia de coleta original SEM duplicar o volume
  - Recalcula automaticamente os agregados diarios afetados e atualiza a auditoria de aging
  - Sincroniza o Dashboard Online (GitHub / Vercel)
"""

import sys
import os
import re
import time
import datetime
import builtins
from pathlib import Path

# Ajustar saida para UTF-8 sem travar no terminal do Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    except Exception:
        pass


def safe_print(msg: str = ""):
    try:
        builtins.print(msg, flush=True)
    except Exception:
        try:
            builtins.print(str(msg).encode("ascii", errors="replace").decode("ascii"), flush=True)
        except Exception:
            pass


# Ajustar PYTHONPATH
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

try:
    from database.connection import SessionLocal
    from services.otimizador_planilha import processar_otimizacao_streaming
    from services.reconciliacao_pacotes import reconciliar_planilha_otimizada_csv
except Exception as e:
    safe_print(f"\n[ERRO] Falha ao importar modulos do backend: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)


def localizar_planilha_downloads() -> Path | None:
    """Busca a planilha de status/reconciliacao mais recente na pasta Downloads ou planilhas_entrada."""
    pastas_busca = [
        ROOT_DIR,
        Path.home() / "Downloads",
        BACKEND_DIR / "planilhas_entrada",
        ROOT_DIR / "planilhas_entrada"
    ]
    padroes_relevantes = [
        "*status*.xlsx",
        "*circuito*.xlsx",
        "*fechado*.xlsx",
        "*coleta*.xlsx",
        "*saco*.xlsx",
        "*transito*.xlsx",
        "*carregamento*.xlsx",
        "*Receber*ordens*.xlsx",
        "*receber*bin*detalhe*.xlsx",
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


def main():
    safe_print("=" * 80)
    safe_print("     TORRE DE CONTROLE ANJUN - RECONCILIACAO RETROATIVA E CARGA DE STATUS")
    safe_print("=" * 80)
    safe_print("Dedicado para subir cortes de status do mes (Circuito Fechado, Backlog, etc.)")
    safe_print("Cada pacote e vinculado a sua data da Coluna M sem duplicar o volume de coletas.")
    safe_print("=" * 80)

    arquivos_alvo = []
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

    if not arquivos_alvo:
        safe_print("\nProcurando planilha de status recente na pasta Downloads ou raiz...")
        encontrado = localizar_planilha_downloads()
        if encontrado:
            arquivos_alvo.append(encontrado)

    if not arquivos_alvo:
        safe_print("\n[AVISO] Nenhuma planilha operacional (.xlsx ou .csv) encontrada!")
        safe_print("Dica: Voce pode arrastar o arquivo .xlsx diretamente para cima do subir_status_reconciliacao.bat.")
        return 1

    hoje_str = datetime.date.today().strftime("%d/%m/%Y")
    pasta_temp = BACKEND_DIR / "temp_reconciliacao"
    pasta_temp.mkdir(parents=True, exist_ok=True)

    db = SessionLocal()

    for idx, arquivo_alvo in enumerate(arquivos_alvo, 1):
        tam_mb = round(arquivo_alvo.stat().st_size / (1024 * 1024), 2)
        mtime_dt = datetime.datetime.fromtimestamp(arquivo_alvo.stat().st_mtime).strftime("%d/%m/%Y %H:%M:%S")

        safe_print("\n" + "-" * 80)
        safe_print(f"[{idx}/{len(arquivos_alvo)}] Processando Planilha de Status:")
        safe_print(f"   Nome: {arquivo_alvo.name}")
        safe_print(f"   Tamanho: {tam_mb} MB")
        safe_print(f"   Modificado em: {mtime_dt}")
        safe_print("-" * 80)

        t_inicio = time.time()
        caminho_csv = ""

        if arquivo_alvo.suffix.lower() == ".csv":
            caminho_csv = str(arquivo_alvo)
        else:
            safe_print("\n[1/3] Otimizando planilha para extracao ultrarrapida (Coluna M e Coluna N)...")
            try:
                job_id = f"rec_{int(time.time())}"
                res_otim = processar_otimizacao_streaming(
                    caminho_entrada=str(arquivo_alvo),
                    diretorio_saida=str(pasta_temp),
                    job_id=job_id,
                    modo="no_dia"
                )
                caminho_csv = os.path.join(str(pasta_temp), res_otim["arquivo_csv"])
                safe_print(f"   -> Otimizado com sucesso: {res_otim.get('linhas_totais', 0):,} linhas detectadas.")
            except Exception as e_otim:
                safe_print(f"   [AVISO] Otimizador padrao falhou ({e_otim}). Tentando leitura direta...")
                caminho_csv = str(arquivo_alvo)

        safe_print("\n[2/3] Auditando codigos de barras e reconciliando status contra o historico...")
        try:
            res_rec = reconciliar_planilha_otimizada_csv(
                db=db,
                caminho_csv=caminho_csv,
                dia_planilha=hoje_str,
                semana_planilha="SEMANA ATUAL",
                callback_log=lambda m: safe_print(f"   -> {m}")
            )
        except Exception as e_rec:
            safe_print(f"\n[ERRO] Erro durante a reconciliacao: {e_rec}")
            import traceback
            traceback.print_exc()
            continue

        tempo_proc = round(time.time() - t_inicio, 1)

        safe_print("\n" + "=" * 80)
        safe_print("     RECONCILIACAO DE STATUS CONCLUIDA COM SUCESSO!")
        safe_print("=" * 80)
        safe_print(f"Total de Pacotes Auditados na Planilha: {res_rec.get('total_pacotes_lidos', 0):,}")
        safe_print(f"Pacotes com Status Atualizado: {res_rec.get('pacotes_atualizados_status', 0):,}")
        safe_print(f"Pacotes Atualizados em Dias Anteriores: {res_rec.get('pacotes_retroativos_outros_dias', 0):,}")
        safe_print(f"Pacotes Novos (Inseridos na data da Col. M): {res_rec.get('pacotes_novos', 0):,}")
        safe_print(f"Pacotes de Outras Datas (NAO duplicaram hoje): {res_rec.get('pacotes_de_outros_dias', 0):,}")
        
        dias_rec = res_rec.get("dias_recalculados", [])
        if dias_rec:
            safe_print(f"Datas recalculadas automaticamente: {', '.join(dias_rec)}")

        trans = res_rec.get("transicoes", {})
        if trans:
            safe_print("\nPrincipais Transicoes de Status Registradas:")
            for k, v in sorted(trans.items(), key=lambda x: x[1], reverse=True)[:8]:
                safe_print(f"   * {k}: {v:,} pacotes")

        safe_print(f"\nTempo de Processamento: {tempo_proc}s")
        safe_print("=" * 80)

    db.close()

    safe_print("\n[3/3] Sincronizando dados com o Dashboard Online (GitHub / Vercel)...")
    try:
        from scripts.exportar_snapshot_online import gerar_snapshots, publicar_github
        gerar_snapshots(max_dias=5)
        publicar_github()
        safe_print("Dashboard Online e Aba 6 (Reconciliacao) atualizados na nuvem!")
    except Exception as e_pub:
        safe_print(f"[AVISO] Publicacao online em segundo plano: {e_pub}")

    safe_print("\nPronto! Os pacotes atualizados ja estao visiveis na Aba 6 e nos cards regionais.")
    return 0


if __name__ == "__main__":
    cod = main()
    if sys.stdin and hasattr(sys.stdin, "isatty") and sys.stdin.isatty():
        try:
            input("\nPressione ENTER para fechar esta janela...")
        except Exception:
            pass
    sys.exit(cod)
