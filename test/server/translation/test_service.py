from __future__ import annotations

import json
import io
import threading
import unittest
from contextlib import redirect_stdout
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server.translation.service import (
    EXTENSION_ORIGIN,
    MODEL_ID,
    MODEL_REVISION,
    MODEL_REGISTRY,
    InvalidRequest,
    LocalModelPool,
    create_handler,
    validate_payload,
)

TOKEN = "a" * 64


class FakeTranslator:
    def __init__(self) -> None:
        self.inputs: list[str] = []

    def translate(self, text: str) -> str:
        self.inputs.append(text)
        return "Good morning."

    def translate_pair(self, text: str, source_language: str) -> tuple[str, str, str]:
        self.inputs.append(text)
        model_id, revision, _model_key, _source_model_code = MODEL_REGISTRY[source_language]
        return "Good morning.", model_id, revision


class ServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.translator = FakeTranslator()
        handler = create_handler(TOKEN, self.translator, allowed_host=None)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join(timeout=2)

    def request(self, path: str, payload: object | None = None, *, origin: str = EXTENSION_ORIGIN, token: str = TOKEN, method: str = "POST") -> Request:
        data = None if payload is None else json.dumps(payload).encode()
        headers = {"Origin": origin, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        return Request(f"{self.url}{path}", data=data, headers=headers, method=method)

    def test_valid_translation_language_pair_and_model_metadata(self) -> None:
        for language, (model_id, revision, _model_key, _source_model_code) in MODEL_REGISTRY.items():
            body = {"text": "Example sentence.", "sourceLanguage": language, "targetLanguage": "en"}
            with urlopen(self.request("/translate", body)) as response:
                result = json.loads(response.read())
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers["Access-Control-Allow-Origin"], EXTENSION_ORIGIN)
            self.assertEqual(result, {"text": "Good morning.", "sourceLanguage": language,
                                      "targetLanguage": "en", "model": model_id, "revision": revision})
        self.assertEqual(len(self.translator.inputs), len(MODEL_REGISTRY))

    def test_bad_origin_and_token_are_rejected_before_inference(self) -> None:
        for request in (self.request("/health", method="GET", origin="https://example.com"), self.request("/health", method="GET", token="b" * 64)):
            with self.assertRaises(HTTPError) as error:
                urlopen(request)
            self.assertEqual(error.exception.code, 403)
        self.assertEqual(self.translator.inputs, [])

    def test_invalid_path_language_pair_and_extra_keys_are_rejected(self) -> None:
        for path, body in (
            ("/translate", {"text": "abc", "sourceLanguage": "en", "targetLanguage": "sq"}),
            ("/translate", {"text": "abc", "sourceLanguage": "no", "targetLanguage": "en"}),
            ("/translate", {"text": "abc", "sourceLanguage": "sq", "targetLanguage": "en", "prompt": "ignored"}),
        ):
            with self.assertRaises(HTTPError):
                urlopen(self.request(path, body))
        with self.assertRaises(HTTPError):
            urlopen(self.request("/other", method="GET"))
        self.assertEqual(self.translator.inputs, [])

    def test_health_returns_only_safe_model_metadata(self) -> None:
        with urlopen(self.request("/health", method="GET")) as response:
            result = json.loads(response.read())
        self.assertEqual(result, {"ready": True, "model": MODEL_ID, "revision": MODEL_REVISION,
                                  "supportedSourceLanguages": list(MODEL_REGISTRY), "targetLanguage": "en"})

    def test_request_log_hook_never_writes_source_text(self) -> None:
        handler = create_handler(TOKEN, self.translator)
        captured = io.StringIO()
        with redirect_stdout(captured):
            handler.log_message(None, "%s", "synthetic private source text")
        self.assertEqual(captured.getvalue(), "")

    def test_payload_rejects_empty_or_overlong_text_without_truncating(self) -> None:
        with self.assertRaises(InvalidRequest):
            validate_payload({"text": "  ", "sourceLanguage": "sq", "targetLanguage": "en"})
        with self.assertRaises(InvalidRequest):
            validate_payload({"text": "x" * 2001, "sourceLanguage": "sq", "targetLanguage": "en"})
        with self.assertRaises(InvalidRequest):
            validate_payload({"text": "hello\x00world", "sourceLanguage": "sq", "targetLanguage": "en"})

    def test_busy_service_rejects_parallel_inference(self) -> None:
        lock = self.server.RequestHandlerClass.inference_lock
        lock.acquire()
        try:
            body = {"text": "Mirëmëngjes.", "sourceLanguage": "sq", "targetLanguage": "en"}
            with self.assertRaises(HTTPError) as error:
                urlopen(self.request("/translate", body))
            self.assertEqual(error.exception.code, 503)
            self.assertEqual(json.loads(error.exception.read()), {"error": "translation-busy"})
            self.assertEqual(self.translator.inputs, [])
        finally:
            lock.release()

    def test_bokmal_and_nynorsk_map_to_one_documented_multilingual_model(self) -> None:
        self.assertEqual(MODEL_REGISTRY["nb"][:3], MODEL_REGISTRY["nn"][:3])
        self.assertEqual(MODEL_REGISTRY["nb"][3], "nob")
        self.assertEqual(MODEL_REGISTRY["nn"][3], "nno")
        self.assertEqual(MODEL_REGISTRY["nb"][0], "Helsinki-NLP/opus-mt-tc-big-gmq-en")

    def test_model_pool_loads_only_requested_installed_snapshot_and_retains_one(self) -> None:
        class Stub:
            def __init__(self, path: object) -> None:
                self.path = path
            def translate(self, text: str) -> str:
                return text

        from pathlib import Path
        import tempfile
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            gmq_key = MODEL_REGISTRY["nb"][2]
            for key in ("sq", "hi", gmq_key):
                folder = root if key == "sq" else root / key
                folder.mkdir(parents=True, exist_ok=True)
                (folder / "config.json").write_text("{}")
                (folder / "pytorch_model.bin").write_bytes(b"stub")
            loaded: list[str] = []
            def loader(path: Path) -> Stub:
                loaded.append(path.name)
                return Stub(path)
            pool = LocalModelPool(root, loader=loader)
            self.assertEqual(set(pool.installed_languages()), {"sq", "hi", "nb", "nn"})
            self.assertEqual(pool.translate_pair("one", "sq")[0], "one")
            self.assertEqual(pool.translate_pair("two", "hi")[0], "two")
            self.assertEqual(pool.translate_pair("three", "nb")[0], "three")
            self.assertEqual(pool.translate_pair("four", "nn")[0], "four")
            self.assertEqual(loaded, [root.name, "hi", gmq_key])
            self.assertEqual(len(pool._resident), 1)
            with self.assertRaises(FileNotFoundError):
                pool.translate_pair("text", "th")
            self.assertEqual(loaded, [root.name, "hi", gmq_key])


if __name__ == "__main__":
    unittest.main()
