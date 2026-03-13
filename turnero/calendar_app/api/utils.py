from __future__ import annotations

import json
import re
from datetime import datetime, time
from typing import Any, Dict

# bucket=... en description (modo legacy)
BUCKET_RE = re.compile(r"(?m)^\s*bucket\s*=\s*(.+?)\s*$")


def _desc_kv(desc: str) -> Dict[str, str]:
    """Parsea líneas 'k=v' desde description (legacy)."""
    out: Dict[str, str] = {}
    for line in (desc or "").splitlines():
        line = line.strip()
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def _parse_iso(dt_str: str) -> datetime:
    """Parse ISO8601 con soporte para sufijo 'Z'."""
    s = (dt_str or "").replace("Z", "+00:00")
    return datetime.fromisoformat(s)


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """True si [a_start,a_end) solapa con [b_start,b_end)."""
    return a_start < b_end and b_start < a_end


def _to_dt(base_date, hhmm: str, tzinfo):
    """Convierte base_date + 'HH:MM' en datetime tz-aware."""
    hh = int(hhmm[0:2])
    mm = int(hhmm[3:5])
    return datetime.combine(base_date, time(hh, mm), tzinfo=tzinfo)


def _is_available_slot_event(meta: Dict[str, Any]) -> bool:
    """True si meta representa un slot DISPONIBLE."""
    kind = (meta.get("slot_kind") or meta.get("type") or "").strip().upper()
    status = (meta.get("slot_status") or meta.get("state") or "").strip().upper()
    return kind == "SLOT" and status == "AVAILABLE"


def _extract_bucket(ev: Dict[str, Any]) -> str:
    """
    Prioridad:
      1) extendedProperties.private.bucket
      2) description (línea bucket=...)
    """
    ep = ev.get("extendedProperties") or {}
    priv = ep.get("private") or {}
    b = (priv.get("bucket") or "").strip()
    if b:
        return b

    desc = (ev.get("description") or "")
    m = BUCKET_RE.search(desc)
    return (m.group(1).strip() if m else "")


def _event_slot_meta(ev: Dict[str, Any]) -> Dict[str, Any]:
    """
    Devuelve metadata lógica del slot con fallback.

    Prioridad (fuente de verdad):
      1) extendedProperties.private.*
      2) description con formato legacy k=v (type/state/bucket)
    """

    def _norm_status(raw: str) -> str:
        r = (raw or "").strip()
        if not r:
            return ""
        r_up = r.upper()
        if r_up in ("AVAILABLE", "RESERVED", "CANCELLED"):
            return r_up
        if r_up in ("DISPONIBLE", "LIBRE"):
            return "AVAILABLE"
        if r_up in ("RESERVADO", "RESERVE", "RESERVED"):
            return "RESERVED"
        if r_up in ("CANCELADO", "CANCELED"):
            return "CANCELLED"
        return r_up

    ep = ev.get("extendedProperties") or {}
    priv = ep.get("private") or {}

    desc = ev.get("description") or ""
    meta_desc = _desc_kv(desc)

    slot_kind = (priv.get("slot_kind") or meta_desc.get("type") or "").strip()
    slot_status = _norm_status(priv.get("slot_status") or meta_desc.get("state") or "")
    bucket = (priv.get("bucket") or meta_desc.get("bucket") or "").strip()

    if not bucket:
        bucket = _extract_bucket(ev).strip()

    professional_name = (priv.get("professional_name") or meta_desc.get("professional_name") or "").strip()
    professional_key = (priv.get("professional_key") or meta_desc.get("professional_key") or "").strip() or "__none__"
    professional_key = professional_key.lower() or "__none__"
    slot_uid = (priv.get("slot_uid") or "").strip()
    display_summary = (priv.get("display_summary") or ev.get("summary") or "").strip()
    created_at = (priv.get("created_at") or "").strip()
    reserved_at = (priv.get("reserved_at") or "").strip()
    cancelled_at = (priv.get("cancelled_at") or "").strip()
    cancel_reason = (priv.get("cancel_reason") or "").strip()

    invitee_raw = (priv.get("invitee_emails") or "").strip()
    invitee_emails = []
    if invitee_raw:
        try:
            parsed = json.loads(invitee_raw)
            if isinstance(parsed, list):
                invitee_emails = [str(x) for x in parsed]
        except Exception:
            invitee_emails = []

    legacy_type = (meta_desc.get("type") or "").strip()
    legacy_state = _norm_status(meta_desc.get("state") or "")

    canonical_status = slot_status or legacy_state
    canonical_kind = slot_kind or legacy_type

    return {
        "slot_kind": canonical_kind,
        "slot_status": canonical_status,
        "bucket": bucket,
        "professional_key": professional_key,
        "professional_name": professional_name or None,
        "slot_uid": slot_uid or None,
        "display_summary": display_summary or None,
        "created_at": created_at or None,
        "reserved_at": reserved_at or None,
        "cancelled_at": cancelled_at or None,
        "cancel_reason": cancel_reason or None,
        "invitee_emails": invitee_emails,
        "invitee_emails_raw": invitee_raw or None,
        # Compat legacy
        "type": canonical_kind,
        "state": canonical_status.lower() if canonical_status else None,
    }
