from pathlib import Path

from .service import serve

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "data" / "translation.local"

serve(LOCAL / "service-config.json", LOCAL / "model")
