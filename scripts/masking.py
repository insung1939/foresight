"""스크립트용 연결: 가리기 규칙의 원본은 api/app/masking.py 하나다(서버와 같은 규칙)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
from app.masking import leaks, mask, name_terms  # noqa: E402,F401
