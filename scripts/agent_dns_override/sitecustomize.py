"""Local Agent DNS workaround for VPN fake-IP answers.

Only api.deepseek.com is affected, and HTTPS still validates the original
hostname. The launcher supplies the public IP through DEEPSEEK_RESOLVED_IP.
"""

import asyncio
import ipaddress
import os
import socket


_ip = os.getenv("DEEPSEEK_RESOLVED_IP")
if _ip:
    ipaddress.ip_address(_ip)
    _sync_getaddrinfo = socket.getaddrinfo
    _async_getaddrinfo = asyncio.BaseEventLoop.getaddrinfo

    def _resolve_sync(host, port, *args, **kwargs):
        if host in ("api.deepseek.com", b"api.deepseek.com"):
            host = _ip
        return _sync_getaddrinfo(host, port, *args, **kwargs)

    async def _resolve_async(self, host, port, *args, **kwargs):
        if host in ("api.deepseek.com", b"api.deepseek.com"):
            host = _ip
        return await _async_getaddrinfo(self, host, port, *args, **kwargs)

    socket.getaddrinfo = _resolve_sync
    asyncio.BaseEventLoop.getaddrinfo = _resolve_async
