"""Klijent za javni API Sudskog registra (MPUDT).

Što radi:
  - dohvaća OAuth2 token (client credentials) i drži ga u memoriji;
  - ponavlja zahtjeve s odgodom kod 429/5xx i mrežnih grešaka;
  - nudi get() i paginate() koji uvijek rade nad istim snapshotom.

Tajne se čitaju iz varijabli okoline (GitHub Actions) ili iz .env (lokalno).
Token i vjerodajnice se nikad ne ispisuju ni ne logiraju.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Iterator

import requests
from dotenv import dotenv_values

log = logging.getLogger("sudreg")

BASE_URL = "https://sudreg-data.gov.hr/api/javni"
TOKEN_URL = "https://sudreg-data.gov.hr/api/oauth/token"

# Zaglavlja odgovora koja nas zanimaju (nazivi iz OpenAPI specifikacije).
HEADERS_OF_INTEREST = (
    "X-Snapshot-Id",
    "X-Total-Count",
    "X-Timestamp",
    "X-Log-Id",
    "X-Seconds-Elapsed",
    "X-Rows-Returned",
)

RETRY_STATUSES = {429, 500, 502, 503, 504}
# Token traje 6 h; obnovi ga malo prije isteka da zahtjev ne padne usred stranice.
TOKEN_SAFETY_MARGIN_S = 120


class SudregError(Exception):
    """Greška API-ja. Poruka sadrži URL i X-Log-Id (za upit službi), nikad token."""

    def __init__(self, message: str, status: int | None = None, log_id: str | None = None):
        super().__init__(message)
        self.status = status
        self.log_id = log_id


def _load_credentials() -> tuple[str, str]:
    """Vjerodajnice iz okoline, a ako ih nema, iz .env u korijenu repozitorija.

    interpolate=False jer se vjerodajnice šalju DOSLOVNO (smiju sadržavati $ i slično).
    """
    cid = os.environ.get("SUDREG_CLIENT_ID")
    secret = os.environ.get("SUDREG_CLIENT_SECRET")
    if not (cid and secret):
        env_path = Path(__file__).resolve().parent.parent / ".env"
        values = dotenv_values(env_path, interpolate=False)
        cid = cid or values.get("SUDREG_CLIENT_ID")
        secret = secret or values.get("SUDREG_CLIENT_SECRET")
    if not (cid and secret):
        raise SudregError(
            "Nedostaju SUDREG_CLIENT_ID / SUDREG_CLIENT_SECRET "
            "(postavi ih u .env ili kao varijable okoline)."
        )
    return cid, secret


class SudregClient:
    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        base_url: str = BASE_URL,
        token_url: str = TOKEN_URL,
        timeout: float = 120.0,
        max_retries: int = 5,
    ):
        if client_id and client_secret:
            self._cid, self._secret = client_id, client_secret
        else:
            self._cid, self._secret = _load_credentials()
        self.base_url = base_url.rstrip("/")
        self.token_url = token_url
        self.timeout = timeout
        self.max_retries = max_retries
        self._session = requests.Session()
        self._token: str | None = None
        self._token_expires_at = 0.0

    # ---------------------------------------------------------------- token

    def _fetch_token(self) -> None:
        # requests šalje (id, secret) kao HTTP Basic, što je ono što API traži.
        for attempt in range(self.max_retries):
            try:
                r = self._session.post(
                    self.token_url,
                    auth=(self._cid, self._secret),
                    data={"grant_type": "client_credentials"},
                    timeout=self.timeout,
                )
            except requests.RequestException as e:
                log.warning("Token: mrežna greška (%s), pokušaj %d", type(e).__name__, attempt + 1)
                time.sleep(2**attempt)
                continue
            if r.status_code in RETRY_STATUSES:
                log.warning("Token: HTTP %d, pokušaj %d", r.status_code, attempt + 1)
                time.sleep(2**attempt)
                continue
            if r.status_code != 200:
                # Tijelo odgovora tokena ne sadrži naše tajne, ali ga ipak skraćujemo.
                raise SudregError(
                    f"Token nije dobiven: HTTP {r.status_code} {r.text[:200]!r}", status=r.status_code
                )
            body = r.json()
            self._token = body["access_token"]
            self._token_expires_at = time.time() + int(body.get("expires_in", 21600))
            log.info("Token dobiven, vrijedi %s s", body.get("expires_in"))
            return
        raise SudregError("Token nije dobiven nakon ponovljenih pokušaja.")

    def _ensure_token(self) -> str:
        if self._token is None or time.time() > self._token_expires_at - TOKEN_SAFETY_MARGIN_S:
            self._fetch_token()
        assert self._token is not None
        return self._token

    def token_ok(self) -> int:
        """Dohvati token (ako treba) i vrati preostalo trajanje u sekundama. Sam token se ne vraća."""
        self._ensure_token()
        return int(self._token_expires_at - time.time())

    # ------------------------------------------------------------------ get

    def get(self, endpoint: str, params: dict | None = None) -> tuple[object, dict]:
        """GET na endpoint. Vraća (JSON, zaglavlja) gdje su zaglavlja samo ona iz HEADERS_OF_INTEREST."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        refreshed_after_401 = False
        last_problem = ""
        for attempt in range(self.max_retries):
            token = self._ensure_token()
            try:
                r = self._session.get(
                    url,
                    params=params,
                    headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                    timeout=self.timeout,
                )
            except requests.RequestException as e:
                last_problem = f"mrežna greška {type(e).__name__}"
                log.warning("%s: %s, pokušaj %d", url, last_problem, attempt + 1)
                time.sleep(2**attempt)
                continue

            log_id = r.headers.get("X-Log-Id")

            if r.status_code == 401 and not refreshed_after_401:
                # Token je možda istekao ranije od očekivanog: jednom ga obnovi i ponovi.
                log.warning("%s: 401, obnavljam token (X-Log-Id=%s)", url, log_id)
                refreshed_after_401 = True
                self._token = None
                continue

            if r.status_code in RETRY_STATUSES:
                last_problem = f"HTTP {r.status_code}"
                wait = 2**attempt
                if r.status_code == 429 and r.headers.get("Retry-After", "").isdigit():
                    wait = max(wait, int(r.headers["Retry-After"]))
                log.warning("%s: HTTP %d (X-Log-Id=%s), čekam %d s", url, r.status_code, log_id, wait)
                time.sleep(wait)
                continue

            if r.status_code != 200:
                raise SudregError(
                    f"GET {r.url} -> HTTP {r.status_code} X-Log-Id={log_id} tijelo={r.text[:300]!r}",
                    status=r.status_code,
                    log_id=log_id,
                )

            headers = {k: r.headers[k] for k in HEADERS_OF_INTEREST if k in r.headers}
            return r.json(), headers

        raise SudregError(f"GET {url} nije uspio nakon {self.max_retries} pokušaja ({last_problem}).")

    # ------------------------------------------------------------- paginate

    def paginate(
        self,
        endpoint: str,
        params: dict | None = None,
        snapshot_id: int | str | None = None,
        limit: int = 1000,
    ) -> Iterator[list[dict]]:
        """Generator stranica (lista redaka) po offset/limit, sve nad ISTIM snapshotom.

        Ako snapshot_id nije zadan, uzima se onaj iz prve stranice pa se fiksira za ostale.
        Zaustavljamo se po X-Total-Count (a ne na grešku "nema podataka" iza zadnjeg retka).
        """
        params = dict(params or {})
        offset = 0
        while True:
            page_params = {**params, "offset": offset, "limit": limit}
            if snapshot_id is not None:
                page_params["snapshot_id"] = snapshot_id
            data, headers = self.get(endpoint, page_params)
            if not isinstance(data, list):
                raise SudregError(
                    f"{endpoint}: očekivan JSON niz, dobiven {type(data).__name__} "
                    f"(ključevi: {list(data)[:5] if isinstance(data, dict) else '-'})"
                )
            if snapshot_id is None:
                snapshot_id = headers.get("X-Snapshot-Id")
            if not data:
                return
            yield data
            offset += len(data)
            total = headers.get("X-Total-Count")
            if total is not None and offset >= int(total):
                return
