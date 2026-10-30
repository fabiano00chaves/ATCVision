from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("atc.security")


class SecurityHeadersMiddleware:
    """
    Pure ASGI Middleware that enforces Cloudflare headers, request tracing,
    and HTTP security headers (OWASP ASVS 4.0 L3 & Cloudflare proxy standards).
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        # Extract request headers
        headers_dict = {k.lower(): v for k, v in scope.get("headers", [])}

        cf_ray = headers_dict.get(b"cf-ray", b"").decode("latin-1").strip()
        cf_ip = headers_dict.get(b"cf-connecting-ip", b"").decode("latin-1").strip()
        xff = headers_dict.get(b"x-forwarded-for", b"").decode("latin-1").strip()
        cf_visitor = headers_dict.get(b"cf-visitor", b"").decode("latin-1").strip()
        xf_proto = headers_dict.get(b"x-forwarded-proto", b"").decode("latin-1").strip()

        client_ip = cf_ip or (
            xff.split(",")[0].strip()
            if xff
            else (scope.get("client", [""])[0] if scope.get("client") else "unknown")
        )

        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["client_ip"] = client_ip
        scope["state"]["cf_ray"] = cf_ray or None
        scope["state"]["cf_connecting_ip"] = cf_ip or None
        scope["state"]["cf_visitor"] = cf_visitor or None
        scope["state"]["x_forwarded_proto"] = xf_proto or None

        async def send_with_security_headers(message: Any) -> None:
            if message.get("type") == "http.response.start":
                resp_headers = list(message.get("headers", []))

                def set_header(name_b: bytes, val_b: bytes) -> None:
                    nonlocal resp_headers
                    resp_headers = [(k, v) for k, v in resp_headers if k.lower() != name_b.lower()]
                    resp_headers.append((name_b, val_b))

                set_header(b"x-content-type-options", b"nosniff")
                set_header(b"x-frame-options", b"SAMEORIGIN")
                set_header(b"referrer-policy", b"strict-origin-when-cross-origin")
                set_header(b"strict-transport-security", b"max-age=31536000; includeSubDomains; preload")
                set_header(b"permissions-policy", b"camera=(), microphone=(), geolocation=()")
                set_header(
                    b"content-security-policy",
                    b"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://vision.fk.adm.br; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self';",
                )
                if cf_ray:
                    set_header(b"cf-ray", cf_ray.encode("latin-1"))

                message["headers"] = resp_headers
            await send(message)

        await self.app(scope, receive, send_with_security_headers)
