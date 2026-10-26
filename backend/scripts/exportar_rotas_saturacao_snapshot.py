import json
import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

from services.saturacao_rotas_service import calcular_saturacao_rotas

def exportar():
    dados = calcular_saturacao_rotas()
    out_dir = ROOT_DIR / "frontend" / "public" / "snapshot"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "rotas_saturacao.json"
    
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        
    print(f"Exported successfully to {out_file}! Size: {out_file.stat().st_size} bytes")

if __name__ == '__main__':
    exportar()
