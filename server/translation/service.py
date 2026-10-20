from __future__ import annotations

import hmac
import json
import secrets
import threading
import os
import gc
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from collections import OrderedDict
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
MODEL_CATALOG_PATH = ROOT / "packages" / "golearn-extension" / "src" / "translation" / "models.json"
_catalog_json = json.loads(MODEL_CATALOG_PATH.read_text(encoding="utf-8"))
# Shared with the extension's provider registry so model IDs and revisions
# cannot silently diverge between client validation and local inference.
MODEL_REGISTRY = {
    language: (item["id"], item["revision"], item["id"].rsplit("/", 1)[-1].removeprefix("opus-mt-").removesuffix("-en"), item["modelSource"])
    for language, item in _catalog_json.items()
}
MODEL_ID, MODEL_REVISION, _MODEL_KEY, _MODEL_SOURCE = MODEL_REGISTRY["sq"]
HOST = "127.0.0.1"
PORT = 8792
EXTENSION_ORIGIN = "chrome-extension://ckjmiefophlhjlobnidnclkiimbjalfo"
MAX_BODY_BYTES = 16_384
MAX_TEXT_CHARS = 2_000
MAX_OUTPUT_CHARS = 4_000
MAX_MODEL_TOKENS = 512


class InvalidRequest(ValueError):
    pass


class LocalTranslator:
    """Loads only local files; model inference never has a network fallback."""

    def __init__(self, model_dir: Path):
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        import torch

        torch.set_num_threads(min(4, max(1, os.cpu_count() or 1)))
        self._torch = torch
        self._tokenizer = AutoTokenizer.from_pretrained(str(model_dir), local_files_only=True, trust_remote_code=False)
        self._model = AutoModelForSeq2SeqLM.from_pretrained(str(model_dir), local_files_only=True, trust_remote_code=False)
        self._model.eval()

    def translate(self, text: str) -> str:
        encoded = self._tokenizer(text, return_tensors="pt", truncation=False)
        if encoded["input_ids"].shape[-1] > MAX_MODEL_TOKENS:
            raise InvalidRequest("input exceeds the model token limit")
        with self._torch.inference_mode():
            generated = self._model.generate(**encoded, max_new_tokens=256, num_beams=4)
        return self._tokenizer.decode(generated[0], skip_special_tokens=True)


class LocalModelPool:
    """Load the requested installed model on demand; keep at most one resident."""

    def __init__(self, models_root: Path, *, loader: Callable[[Path], Any] = LocalTranslator):
        self.models_root = models_root
        self.loader = loader
        self._resident: OrderedDict[tuple[str, str], Any] = OrderedDict()

    def _model(self, source_language: str) -> Any:
        model_id, revision, model_key, _model_source = MODEL_REGISTRY[source_language]
        cache_key = (model_id, revision)
        model_dir = self.models_root if model_key == "sq" else self.models_root / model_key
        # Fail before importing ML packages when this user's setup did not
        # explicitly install the requested snapshot.
        if not (model_dir / "config.json").is_file() or not (model_dir / "pytorch_model.bin").is_file():
            raise FileNotFoundError("local model is not installed")
        if cache_key not in self._resident:
            self._resident.clear()
            gc.collect()
            self._resident[cache_key] = self.loader(model_dir)
        return self._resident[cache_key]

    def translate_pair(self, text: str, source_language: str) -> tuple[str, str, str]:
        model_id, revision, _model_key, _model_source = MODEL_REGISTRY[source_language]
        return self._model(source_language).translate(text), model_id, revision

    def installed_languages(self) -> list[str]:
        installed: list[str] = []
        for language, (_model_id, _revision, model_key, _source_code) in MODEL_REGISTRY.items():
            model_dir = self.models_root if model_key == "sq" else self.models_root / model_key
            if (model_dir / "config.json").is_file() and (model_dir / "pytorch_model.bin").is_file():
                installed.append(language)
        return installed


def _json_no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise InvalidRequest("duplicate JSON key")
        result[key] = value
    return result


def validate_payload(payload: Any) -> str:
    if not isinstance(payload, dict) or set(payload) != {"text", "sourceLanguage", "targetLanguage"}:
        raise InvalidRequest("invalid request shape")
    text = payload["text"]
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_CHARS:
        raise InvalidRequest("invalid text")
    if any(unicodedata.category(char) == "Cc" for char in text):
        raise InvalidRequest("control characters are not accepted")
    if payload["sourceLanguage"] not in MODEL_REGISTRY or payload["targetLanguage"] != "en":
        raise InvalidRequest("unsupported language pair")
    return text


def create_handler(token: str, translator: Any, *, allowed_origin: str = EXTENSION_ORIGIN, allowed_host: str | None = f"{HOST}:{PORT}") -> type[BaseHTTPRequestHandler]:
    if not isinstance(token, str) or len(token) < 64 or any(c not in "0123456789abcdef" for c in token):
        raise ValueError("translation service token must be 32 or more random bytes in lowercase hex")

    class Handler(BaseHTTPRequestHandler):
        server_version = "GoLocalTranslation/1"
        sys_version = ""
        inference_lock = threading.Lock()

        def setup(self) -> None:
            super().setup()
            self.connection.settimeout(5)

        def log_message(self, fmt: str, *args: Any) -> None:
            # Requests contain selected source text; do not log paths, headers, or body.
            return

        def _send(self, status: int, payload: dict[str, Any], *, cors: bool = False) -> None:
            data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if cors:
                self.send_header("Access-Control-Allow-Origin", allowed_origin)
                self.send_header("Vary", "Origin")
            self.end_headers()
            self.wfile.write(data)

        def _origin_ok(self) -> bool:
            return self.headers.get("Origin") == allowed_origin

        def _authorized(self) -> bool:
            supplied = self.headers.get("Authorization", "")
            prefix = "Bearer "
            return supplied.startswith(prefix) and hmac.compare_digest(supplied[len(prefix):], token)

        def _host_ok(self) -> bool:
            expected = allowed_host or f"{self.server.server_address[0]}:{self.server.server_address[1]}"
            return self.headers.get("Host", "") == expected

        def do_OPTIONS(self) -> None:
            requested_headers = {x.strip().lower() for x in self.headers.get("Access-Control-Request-Headers", "").split(",") if x.strip()}
            if (self.path != "/translate" or not self._origin_ok() or not self._host_ok()
                    or self.headers.get("Access-Control-Request-Method") != "POST"
                    or not requested_headers.issubset({"authorization", "content-type"})
                    or "authorization" not in requested_headers or "content-type" not in requested_headers):
                self._send(403, {"error": "forbidden"})
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Max-Age", "300")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self) -> None:
            parts = urlsplit(self.path)
            if (parts.path != "/health" or parts.query or not self._host_ok()
                    or not self._origin_ok() or not self._authorized()):
                self._send(403, {"error": "forbidden"})
                return
            installed = translator.installed_languages() if hasattr(translator, "installed_languages") else list(MODEL_REGISTRY)
            self._send(200, {"ready": True, "model": MODEL_ID, "revision": MODEL_REVISION,
                             "supportedSourceLanguages": installed, "targetLanguage": "en"}, cors=True)

        def do_POST(self) -> None:
            parts = urlsplit(self.path)
            if (parts.path != "/translate" or parts.query or not self._host_ok()
                    or not self._origin_ok() or not self._authorized()):
                self._send(403, {"error": "forbidden"})
                return
            if self.headers.get("Transfer-Encoding"):
                self._send(400, {"error": "invalid-request"}, cors=True)
                return
            if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
                self._send(415, {"error": "unsupported-media-type"}, cors=True)
                return
            raw_length = self.headers.get("Content-Length", "")
            if not raw_length.isascii() or not raw_length.isdecimal():
                self._send(400, {"error": "invalid-request"}, cors=True)
                return
            length = int(raw_length)
            if length > MAX_BODY_BYTES:
                self.close_connection = True
                self._send(413, {"error": "payload-too-large"}, cors=True)
                return
            try:
                raw = self.rfile.read(length)
                if len(raw) != length:
                    raise InvalidRequest("truncated body")
                payload = json.loads(raw.decode("utf-8"), object_pairs_hook=_json_no_duplicates)
                text = validate_payload(payload)
            except (UnicodeDecodeError, json.JSONDecodeError, InvalidRequest, RecursionError):
                self._send(400, {"error": "invalid-request"}, cors=True)
                return
            if not self.inference_lock.acquire(blocking=False):
                self._send(503, {"error": "translation-busy"}, cors=True)
                return
            try:
                source_language = payload["sourceLanguage"]
                if hasattr(translator, "translate_pair"):
                    translated, model_id, revision = translator.translate_pair(text, source_language)
                else:
                    # Backward-compatible test/local adapter for the original Albanian-only interface.
                    if source_language != "sq":
                        self._send(503, {"error": "translation-unavailable"}, cors=True)
                        return
                    model_id, revision, _model_key, _model_source = MODEL_REGISTRY["sq"]
                    translated = translator.translate(text)
                if not isinstance(translated, str) or not translated.strip() or len(translated) > MAX_OUTPUT_CHARS:
                    self._send(503, {"error": "translation-unavailable"}, cors=True)
                    return
                self._send(200, {"text": translated.strip(), "sourceLanguage": source_language,
                                 "targetLanguage": "en", "model": model_id, "revision": revision}, cors=True)
            except InvalidRequest:
                self._send(400, {"error": "input-too-long"}, cors=True)
            except Exception:
                self._send(503, {"error": "translation-unavailable"}, cors=True)
            finally:
                self.inference_lock.release()

    return Handler


def load_config(config_path: Path) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict) or set(config) != {"token"}:
        raise ValueError("service config is invalid")
    token = config["token"]
    if not isinstance(token, str) or len(token) < 64 or any(c not in "0123456789abcdef" for c in token):
        raise ValueError("service config is invalid")
    return config


def serve(config_path: Path, models_root: Path) -> None:
    config = load_config(config_path)
    translator = LocalModelPool(models_root)
    server = ThreadingHTTPServer((HOST, PORT), create_handler(config["token"], translator))
    server.daemon_threads = True
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()


def make_test_token() -> str:
    return secrets.token_hex(32)
