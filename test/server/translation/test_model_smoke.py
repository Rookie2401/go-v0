from __future__ import annotations

import importlib.util
import os
import unittest
from pathlib import Path

from server.translation.service import LocalTranslator

ROOT = Path(__file__).resolve().parents[3]
MODEL_DIR = Path(os.environ.get("GO_TRANSLATION_MODEL_DIR", ROOT / "data" / "translation.local" / "model"))
HAS_RUNTIME = importlib.util.find_spec("torch") is not None and importlib.util.find_spec("transformers") is not None


@unittest.skipUnless(HAS_RUNTIME and (MODEL_DIR / "pytorch_model.bin").is_file(), "local model runtime is not installed")
class ModelSmokeTests(unittest.TestCase):
    def test_short_phrase_and_generated_fixture_run_through_local_model(self) -> None:
        translator = LocalTranslator(MODEL_DIR)
        outputs = [
            translator.translate("Përshëndetje!"),
            translator.translate("Unë po lexoj një libër në shtëpi."),
        ]
        self.assertTrue(all(isinstance(text, str) and text.strip() for text in outputs))
        self.assertTrue(all(len(text) <= 4_000 for text in outputs))


if __name__ == "__main__":
    unittest.main()
