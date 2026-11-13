from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import socket
from typing import Any, Dict, List
from urllib.parse import urlparse
from fastapi import HTTPException, status
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Webhook

log = logging.getLogger("atc.webhook")

BLOCKED_SSRF_HOSTS = {
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "169.254.169.254",
    "metadata.google.internal",
    "instance-data",
    "db",
    "backend",
    "frontend",
    "atc-vision-db",
    "atc-vision-backend",
    "atc-vision-frontend",
}

CGNAT_NETWORK = ipaddress.ip_network("100.64.0.0/10")


def is_ip_blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped

    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return True

    if isinstance(ip, ipaddress.IPv4Address) and ip in CGNAT_NETWORK:
        return True

    return False


def validate_webhook_url(url: str) -> str:
    cleaned = url.strip()
    try:
        parsed = urlparse(cleaned)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL de webhook inválida")

    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Protocolo do webhook deve ser HTTP ou HTTPS",
        )

    hostname = (parsed.hostname or "").lower().strip()
    if not hostname:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hostname ausente na URL do webhook")

    if (
        hostname in BLOCKED_SSRF_HOSTS
        or hostname.endswith(".local")
        or hostname.endswith(".internal")
        or hostname.endswith(".arpa")
        or hostname.endswith(".localhost")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Destino do webhook não permitido por política de segurança SSRF",
        )

    # 1. Direct IP check
    try:
        ip = ipaddress.ip_address(hostname)
        if is_ip_blocked(ip):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Destino do webhook não permitido por política de segurança SSRF (endereço privado/loopback/reservado)",
            )
        return cleaned
    except ValueError:
        pass

    # 2. Port validation & DNS Resolution check (resolve all IPv4 and IPv6 addresses)
    try:
        if parsed.port is not None:
            port = parsed.port
        else:
            port = 443 if parsed.scheme == "https" else 80
        if not (1 <= port <= 65535):
            raise ValueError(f"Port {port} out of range (1-65535)")
    except ValueError as port_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Porta da URL do webhook inválida: {port_err}",
        )

    try:
        addr_infos = socket.getaddrinfo(hostname, port, proto=socket.IPPROTO_TCP)
        for ai in addr_infos:
            sockaddr = ai[4]
            ip_str = sockaddr[0]
            try:
                ip = ipaddress.ip_address(ip_str)
                if is_ip_blocked(ip):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Destino do webhook não permitido por política de segurança SSRF (endereço privado/loopback resolvido via DNS)",
                    )
            except ValueError:
                continue
    except socket.gaierror:
        # When DNS resolution fails (e.g. offline test environment), check host structure
        if "." not in hostname or hostname.endswith(".local") or hostname.endswith(".internal"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Destino do webhook não permitido por política de segurança SSRF (host local ou não resolvível)",
            )
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("DNS resolution check failed for webhook host %s: %s", hostname, exc)

    return cleaned


async def trigger_webhooks(db: AsyncSession, event_name: str, payload: Dict[str, Any]) -> None:
    res = await db.execute(select(Webhook).where(Webhook.is_active.is_(True)))
    webhooks = res.scalars().all()

    active_for_event = [w for w in webhooks if event_name in (w.events or [])]
    if not active_for_event:
        return

    body_bytes = json.dumps(payload, default=str).encode("utf-8")

    async def _send(w: Webhook):
        try:
            # Revalidate immediately prior to dispatch (defense against DNS rebinding / TOCTOU)
            validate_webhook_url(w.target_url)
        except Exception as ssrf_err:
            log.warning("Blocked unsafe SSRF destination on dispatch for webhook %s (%s): %s", w.name, w.target_url, ssrf_err)
            return

        sig = hmac.new(w.secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        headers = {
            "Content-Type": "application/json",
            "X-ATC-Event": event_name,
            "X-ATC-Signature": f"sha256={sig}",
            "User-Agent": "ATCVision-Webhook/1.0",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
                resp = await client.post(w.target_url, content=body_bytes, headers=headers)
                log.info("Webhook %s (%s) response status: %s", w.name, w.target_url, resp.status_code)
        except Exception as exc:
            log.warning("Failed to deliver webhook %s (%s): %s", w.name, w.target_url, exc)

    for w in active_for_event:
        asyncio.create_task(_send(w))
