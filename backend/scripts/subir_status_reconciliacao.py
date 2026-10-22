# -*- coding: utf-8 -*-
r"""
subir_status_reconciliacao.py — Carga Dedicada de Atualização de Status & Reconciliação do Mês.

Destaques:
  - Aceita planilhas de corte por status (ex: só Circuito Fechado, só Backlog, ou corte do mês)
  - Lê linha a linha a Coluna M (Tempo real para a coleta) e Coluna N (Data de conclusão)
  - Atualiza o status de cada pacote no seu dia de coleta original SEM duplicar o volume
  - Recalcula automaticamente os agregados diários afetados e atualiza a auditoria de aging
  - Sincroniza o Dashboard Online (GitHub / Vercel)
"""

import sys
import os
import re
import time
import datetime
from pathlib import Path

# Ajustar saída para UTF-8 sem travar no terminal do Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ajustar PYTHONPATH
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

try:
    from database.connection import SessionLocal
    from services.otimizador_planilha import otimizar_planilha_operacional
    from services.reconciliacao_pacotes import reconciliar_planilha_otimizada_csv
except Exception as e:
    print(f"\n[ERRO] Falha ao importar módulos do backend: {e}")
    sys.exit(1)


def localizar_planilha_downloads() -> Path | None:
    """Busca a planilha de status/reconciliação mais recente na pasta Downloads ou planilhas_entrada."""
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
    print("=" * 80)
    print("     TORRE DE CONTROLE ANJUN - RECONCILIAÇÃO RETROATIVA & CARGA DE STATUS")
    print("=" * 80)
    print("💡 Modelo dedicado para subir cortes de status do mês (Circuito Fechado, Backlog, etc.)")
    print("   Cada pacote é vinculado à sua data da Coluna M sem duplicar o volume de coletas.")
    print("=" * 80)

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
        print("\n🔍 Procurando planilha de status recente na pasta Downloads...")
        encontrado = localizar_planilha_downloads()
        if encontrado:
            arquivos_alvo.append(encontrado)

    if not arquivos_alvo:
        print("\n❌ Nenhuma planilha operacional (.xlsx ou .csv) encontrada na pasta Downloads!")
        print("💡 Dica: Você pode arrastar o arquivo .xlsx diretamente para cima do 'subir_status_reconciliacao.bat'.")
        return 1

    hoje_str = datetime.date.today().strftime("%d/%m/%Y")
    pasta_temp = BACKEND_DIR / "temp_reconciliacao"
    pasta_temp.mkdir(parents=True, exist_ok=True)

    db = SessionLocal()

    for idx, arquivo_alvo in enumerate(arquivos_alvo, 1):
        tam_mb = round(arquivo_alvo.stat().st_size / (1024 * 1024), 2)
        mtime_dt = datetime.datetime.fromtimestamp(arquivo_alvo.stat().st_mtime).strftime("%d/%m/%Y %H:%M:%S")

        print("\n" + "-" * 80)
        print(f"📁 [{idx}/{len(arquivos_alvo)}] Processando Planilha de Status:")
        print(f"   Nome: {arquivo_alvo.name}")
        print(f"   Tamanho: {tam_mb} MB")
        print(f"   Modificado em: {mtime_dt}")
        print("-" * 80)

        t_inicio = time.time()
        caminho_csv = ""

        if arquivo_alvo.suffix.lower() == ".csv":
            caminho_csv = str(arquivo_alvo)
        else:
            print("\n⚡ [1/3] Otimizando planilha para extração ultrarrápida (Coluna M e Coluna N)...")
            try:
                res_otim = otimizar_planilha_operacional(
                    caminho_arquivo=str(arquivo_alvo),
                    diretorio_saida=str(pasta_temp),
                    chunk_size=50000
                )
                caminho_csv = os.path.join(str(pasta_temp), res_otim["arquivo_csv"])
                print(f"   -> Otimizado com sucesso: {res_otim['total_linhas_processadas']:,} linhas detectadas.")
            except Exception as e_otim:
                print(f"   [AVISO] Otimizador padrão falhou ({e_otim}). Tentando leitura direta...")
                caminho_csv = str(arquivo_alvo)

        print("\n🔄 [2/3] Auditando códigos de barras e reconciliando status contra o histórico...")
        try:
            res_rec = reconciliar_planilha_otimizada_csv(
                db=db,
                caminho_csv=caminho_csv,
                dia_planilha=hoje_str,
                semana_planilha="SEMANA ATUAL",
                callback_log=lambda m: print(f"   -> {m}")
            )
        except Exception as e_rec:
            print(f"\n❌ Erro durante a reconciliação: {e_rec}")
            import traceback
            traceback.print_exc()
            continue

        tempo_proc = round(time.time() - t_inicio, 1)

        print("\n" + "=" * 80)
        print("     🎉 RECONCILIAÇÃO DE STATUS CONCLUÍDA COM SUCESSO!")
        print("=" * 80)
        print(f"📦 Total de Pacotes Auditados na Planilha: {res_rec.get('total_pacotes_lidos', 0):,}")
        print(f"🔄 Pacotes com Status Atualizado: {res_rec.get('pacotes_atualizados_status', 0):,}")
        print(f"📅 Pacotes Atualizados em Dias Anteriores: {res_rec.get('pacotes_retroativos_outros_dias', 0):,}")
        print(f"🆕 Pacotes Novos (Inseridos na data da Col. M): {res_rec.get('pacotes_novos', 0):,}")
        print(f"🛡️ Pacotes de Outras Datas (NÃO duplicaram hoje): {res_rec.get('pacotes_de_outros_dias', 0):,}")
        
        dias_rec = res_rec.get("dias_recalculados", [])
        if dias_rec:
            print(f"📊 Datas que tiveram seus totais recalculados automaticamente: {', '.join(dias_rec)}")

        trans = res_rec.get("transicoes", {})
        if trans:
            print("\n📈 Principais Transições de Status Registradas:")
            for k, v in sorted(trans.items(), key=lambda x: x[1], reverse=True)[:8]:
                print(f"   • {k}: {v:,} pacotes")

        print(f"\n⏱️ Tempo de Processamento: {tempo_proc}s")
        print("=" * 80)

    db.close()

    print("\n☁️ [3/3] Sincronizando dados com o Dashboard Online (GitHub / Vercel)...")
    try:
        from scripts.exportar_snapshot_online import gerar_snapshots, publicar_github
        gerar_snapshots(max_dias=5)
        publicar_github()
        print("🎉 Dashboard Online e Aba 6 (Reconciliação) 100% atualizados na nuvem!")
    except Exception as e_pub:
        print(f"⚠️ Aviso na publicação online: {e_pub}")

    print("\n💡 Pronto! Os pacotes atualizados já estão visíveis na Aba 6 e nos cards regionais.")
    return 0


if __name__ == "__main__":
    cod = main()
    print("\nPressione ENTER para fechar esta janela...")
    try:
        input()
    except Exception:
        pass
    sys.exit(cod)
