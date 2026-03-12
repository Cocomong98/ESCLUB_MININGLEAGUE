"""Nexon Open API client for FC Online analytics workloads."""

from __future__ import annotations

import json
import os
import time
from typing import Any
from urllib.parse import quote

import requests


class NexonOpenApiError(RuntimeError):
    """Raised when Nexon Open API request/response handling fails."""


class NexonFconlineClient:
    """HTTP client with retry/backoff for Nexon FC Online Open API."""

    BASE_URL = "https://open.api.nexon.com"
    CDN_URL = "https://fco.dn.nexoncdn.co.kr"

    def __init__(
        self,
        api_key: str | None = None,
        *,
        timeout: int = 15,
        max_retries: int = 5,
    ) -> None:
        self.api_key = (api_key or os.environ.get("NEXON_OPEN_API_KEY", "")).strip()
        if not self.api_key:
            raise ValueError("NEXON_OPEN_API_KEY is not set")
        self.timeout = timeout
        self.max_retries = max_retries
        self.sess = requests.Session()

    @staticmethod
    def _retry_wait_seconds(attempt: int, response: requests.Response | None = None) -> float:
        if response is not None:
            retry_after = (response.headers.get("Retry-After") or "").strip()
            if retry_after:
                try:
                    retry_after_value = float(retry_after)
                    if retry_after_value > 0:
                        return min(retry_after_value, 60.0)
                except ValueError:
                    pass
        return float(min(2 ** attempt, 30))

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{self.BASE_URL}{path}"
        headers = {
            "x-nxopen-api-key": self.api_key,
            "Accept": "application/json",
        }
        last_err: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.sess.get(
                    url, headers=headers, params=params, timeout=self.timeout
                )
            except requests.RequestException as exc:
                last_err = exc
                if attempt < self.max_retries:
                    time.sleep(self._retry_wait_seconds(attempt))
                    continue
                break

            status_code = response.status_code
            text_snippet = (response.text or "").strip().replace("\n", " ")[:200]
            if status_code == 429 or 500 <= status_code <= 599:
                last_err = NexonOpenApiError(f"HTTP {status_code} {text_snippet or '(empty body)'}")
                if attempt < self.max_retries:
                    time.sleep(self._retry_wait_seconds(attempt, response))
                    continue
                break
            if status_code != 200:
                raise NexonOpenApiError(f"HTTP {status_code} {text_snippet or '(empty body)'}")

            try:
                return response.json()
            except ValueError:
                pass

            content_type = (response.headers.get("Content-Type") or "").lower()
            text_body = (response.text or "").strip()
            if (
                "application/json" in content_type
                or content_type.endswith("+json")
                or text_body.startswith("{")
                or text_body.startswith("[")
            ):
                try:
                    return json.loads(text_body)
                except ValueError:
                    pass
            return response.content

        raise NexonOpenApiError(f"Request failed after retries: {last_err or 'unknown'}")

    def get_ouid(self, nickname: str) -> str:
        data = self._get("/fconline/v1/id", params={"nickname": nickname})
        ouid = (data or {}).get("ouid")
        if not ouid:
            raise NexonOpenApiError(f"ouid not found for nickname={nickname}")
        return str(ouid)

    def get_user_basic(self, ouid: str) -> dict[str, Any]:
        payload = self._get("/fconline/v1/user/basic", params={"ouid": ouid})
        return payload if isinstance(payload, dict) else {}

    def get_user_match_ids(
        self, ouid: str, matchtype: int, offset: int = 0, limit: int = 100
    ) -> list[str]:
        payload = self._get(
            "/fconline/v1/user/match",
            params={
                "ouid": ouid,
                "matchtype": matchtype,
                "offset": offset,
                "limit": limit,
            },
        )
        if isinstance(payload, list):
            return [str(x) for x in payload]
        return []

    # Backward-compatible alias for previous scaffold signature.
    def get_match_ids(
        self, ouid: str, *, matchtype: int = 52, offset: int = 0, limit: int = 100
    ) -> list[str]:
        return self.get_user_match_ids(
            ouid=ouid, matchtype=matchtype, offset=offset, limit=limit
        )

    def get_match_detail(self, matchid: str) -> dict[str, Any]:
        payload = self._get("/fconline/v1/match-detail", params={"matchid": matchid})
        return payload if isinstance(payload, dict) else {}

    def get_ranker_stats(self, matchtype: int, players: list[dict[str, Any]]) -> Any:
        # players: [{"id": spid, "po": spposition}, ...]
        payload = json.dumps(players, separators=(",", ":"))
        encoded = quote(payload, safe="")
        return self._get(
            "/fconline/v1/ranker-stats",
            params={
                "matchtype": matchtype,
                "players": encoded,
            },
        )

    def get_meta_matchtype(self) -> Any:
        return self._get("/static/fconline/meta/matchtype.json")

    def get_meta_spid(self) -> Any:
        return self._get("/static/fconline/meta/spid.json")

    def get_meta_spposition(self) -> Any:
        return self._get("/static/fconline/meta/spposition.json")

    def get_meta_seasonid(self) -> Any:
        return self._get("/static/fconline/meta/seasonid.json")


# Existing scaffold imports this name; keep alias for compatibility.
NexonOpenApiClient = NexonFconlineClient
