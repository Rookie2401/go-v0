from __future__ import annotations

import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server.translation.service import (
    EXTENSION_ORIGIN,
    MODEL_ID,
    MODEL_REVISION,
    InvalidRequest,
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

    def test_valid_translation_is_albanian_to_english_and_returns_model_metadata(self) -> None:
        body = {"text": "Mirëmëngjes.", "sourceLanguage": "sq", "targetLanguage": "en"}
        with urlopen(self.request("/translate", body)) as response:
            result = json.loads(response.read())
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], EXTENSION_ORIGIN)
        self.assertEqual(self.translator.inputs, ["Mirëmëngjes."])
        self.assertEqual(result, {"text": "Good morning.", "model": MODEL_ID, "revision": MODEL_REVISION})

    def test_bad_origin_and_token_are_rejected_before_inference(self) -> None:
        for request in (self.request("/health", method="GET", origin="https://example.com"), self.request("/health", method="GET", token="b" * 64)):
            with self.assertRaises(HTTPError) as error:
                urlopen(request)
            self.assertEqual(error.exception.code, 403)
        self.assertEqual(self.translator.inputs, [])

    def test_invalid_path_language_pair_and_extra_keys_are_rejected(self) -> None:
        for path, body in (
            ("/translate", {"text": "abc", "sourceLanguage": "en", "targetLanguage": "sq"}),
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
        self.assertEqual(result, {"ready": True, "model": MODEL_ID, "revision": MODEL_REVISION})

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


if __name__ == "__main__":
    unittest.main()
