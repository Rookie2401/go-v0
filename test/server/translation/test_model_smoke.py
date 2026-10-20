from __future__ import annotations

import importlib.util
import os
import unittest
from pathlib import Path

from server.translation.service import LocalModelPool, MODEL_REGISTRY

ROOT = Path(__file__).resolve().parents[3]
MODEL_DIR = Path(os.environ.get("GO_TRANSLATION_MODEL_DIR", ROOT / "data" / "translation.local" / "model"))
HAS_RUNTIME = importlib.util.find_spec("torch") is not None and importlib.util.find_spec("transformers") is not None


@unittest.skipUnless(HAS_RUNTIME, "local model runtime is not installed")
class ModelSmokeTests(unittest.TestCase):
    def test_generated_sentence_runs_for_every_installed_language_model(self) -> None:
        translator = LocalModelPool(MODEL_DIR)
        examples = {
            "sq": "Unë po lexoj një libër.",
            "hi": "लड़की किताब पढ़ती है।",
            "es": "La niña lee un libro.",
            "de": "Das Mädchen liest ein Buch.",
            "th": "เด็กผู้หญิงอ่านหนังสือหนึ่งเล่ม",
            "nb": "Jenta leser en bok.",
            "nn": "Jenta les ei bok.",
        }
        for language, sentence in examples.items():
            _model_id, _revision, model_key, _source_model_code = MODEL_REGISTRY[language]
            model_dir = MODEL_DIR if model_key == "sq" else MODEL_DIR / model_key
            if not (model_dir / "pytorch_model.bin").is_file():
                self.fail(f"the explicitly installed local model for {language} is missing")
            with self.subTest(language=language):
                output, model_id, revision = translator.translate_pair(sentence, language)
                self.assertTrue(output.strip())
                self.assertLessEqual(len(output), 4_000)
                self.assertEqual((model_id, revision), MODEL_REGISTRY[language][:2])


if __name__ == "__main__":
    unittest.main()
