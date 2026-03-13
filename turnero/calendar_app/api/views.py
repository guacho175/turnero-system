from __future__ import annotations

import json
import logging
import uuid
import re
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo

from django.core.cache import cache
from django.conf import settings

from rest_framework import status, serializers
from django.http import HttpResponseBase
from rest_framework.response import Response
from rest_framework.views import APIView

# ✅ DOCS (drf-spectacular)
from drf_spectacular.utils import (
    extend_schema,
    inline_serializer,
    OpenApiParameter,
    OpenApiTypes,
)

from calendar_app.api.utils import (
    _parse_iso,
    _overlaps,
    _to_dt,
    _event_slot_meta,
    _extract_bucket,
    _is_available_slot_event,
)

from calendar_app.api.serializers import (
    SlotCreateSerializer,
    SlotsLibresQuerySerializer,
    SlotReservarSerializer,
    CalendarClearSerializer,
    CalendarClearBucketSerializer,
    SyncBucketsSerializer,
)

from calendar_app.servicios.google_calendar import GoogleCalendarService, GoogleEventCreate
from calendar_app.servicios.google_auth_web import get_calendar_service_or_redirect
from calendar_app.models import Bucket
from calendar_app.utils.datetime import isoformat_z

logger = logging.getLogger(__name__)


def _bd_calendar_id() -> str:
    cid = getattr(settings, "GOOGLE_CALENDAR_BD_ID", None)
    if not cid:
        raise RuntimeError("Falta settings.GOOGLE_CALENDAR_BD_ID (calendar BD).")
    return cid


def _cal_tz():
    return ZoneInfo(getattr(settings, "CALENDAR_TIMEZONE", "America/Santiago"))


def _normalize_professional_key(raw_key: str | None, fallback_name: str | None = None) -> str | None:
    """Normaliza clave de profesional. Retorna None si no hay valor válido."""
    candidate = (raw_key or "").strip()
    if not candidate and fallback_name is not None:
        candidate = (fallback_name or "").strip()
    if not candidate:
        return None
    candidate = re.sub(r"[^a-z0-9]+", "_", candidate.lower())
    candidate = candidate.strip("_") or None
    return candidate


def _slot_summary(slot_status: str, bucket: str, professional_name: str | None = None) -> str:
    """Construye summary legible "{STATUS} - {PROF?} - {BUCKET}"."""
    status_map = {"AVAILABLE": "DISPONIBLE", "RESERVED": "RESERVADO", "CANCELLED": "CANCELADO"}
    status_label = status_map.get((slot_status or "").upper(), slot_status or "")
    parts = [status_label.strip()]
    if professional_name:
        parts.append(professional_name)
    parts.append(bucket)
    return " - ".join([p for p in parts if p])


def _get_gc_service(request, calendar_id: str):
    svc = get_calendar_service_or_redirect(request, calendar_id=calendar_id)
    return svc


TURNERO_TAG = "TURNERO_MANAGED=1"
TURNERO_BUCKET_TAG_FMT = "TURNERO_BUCKET={bucket}"


def _find_managed_final_calendar_id(bucket_norm: str, request=None):
    """Busca en calendarList un calendario final gestionado por Turnero para el bucket."""
    if request is not None:
        svc = get_calendar_service_or_redirect(request, calendar_id="primary")
        if not isinstance(svc, GoogleCalendarService):
            return svc
    else:
        svc = GoogleCalendarService(calendar_id="primary")
    try:
        items = svc.list_calendars_all(max_results=250)
    except Exception as e:
        logger.warning("No se pudo listar calendars para buscar bucket %s: %s", bucket_norm, e)
        return None

    tag_bucket = TURNERO_BUCKET_TAG_FMT.format(bucket=bucket_norm)
    candidates = []
    for cal in items:
        desc = cal.get("description") or ""
        if TURNERO_TAG in desc and tag_bucket in desc:
            cid = cal.get("id")
            if cid:
                candidates.append(cid)

    if not candidates:
        return None

    if len(candidates) > 1:
        logger.warning(
            "Múltiples calendarios gestionados para bucket %s: %s. Usando primero ordenado.",
            bucket_norm, candidates
        )
    return sorted(candidates)[0]


def _ensure_bucket_calendar(bucket: str, request=None):
    """Garantiza que exista el calendar FINAL asociado al bucket."""
    bucket_norm = (bucket or "").strip().lower()
    if not bucket_norm:
        raise ValueError("bucket vacío")

    obj = Bucket.objects.filter(name=bucket_norm).first()
    if obj and obj.final_calendar_id:
        return obj

    # 1) intentar recuperar calendario gestionado existente en Google
    managed_id = _find_managed_final_calendar_id(bucket_norm, request=request)
    if isinstance(managed_id, Bucket):
        return managed_id
    if isinstance(managed_id, HttpResponseBase):
        return managed_id
    if managed_id:
        if obj:
            obj.final_calendar_id = managed_id
            obj.save(update_fields=["final_calendar_id"])
            return obj
        return Bucket.objects.create(name=bucket_norm, final_calendar_id=managed_id)

    # 2) crear calendario nuevo con tags en description (evita duplicar por nombre)
    if request is not None:
        svc = get_calendar_service_or_redirect(request, calendar_id="primary")
        if not isinstance(svc, GoogleCalendarService):
            return svc
    else:
        svc = GoogleCalendarService(calendar_id="primary")

    desc = f"{TURNERO_TAG}\n{TURNERO_BUCKET_TAG_FMT.format(bucket=bucket_norm)}\nCreado por Turnero"
    created = svc.create_calendar(name=bucket_norm, timezone=str(_cal_tz()), description=desc)
    final_id = created.get("id")
    if not final_id:
        raise RuntimeError("Google no devolvió id al crear calendario bucket.")

    if obj:
        obj.final_calendar_id = final_id
        obj.save(update_fields=["final_calendar_id"])
        return obj
    return Bucket.objects.create(name=bucket_norm, final_calendar_id=final_id)



def _cleanup_range(params: dict, tz) -> tuple[datetime, datetime]:
    """
    Helper para calcular rango de limpieza.
    
    QUÉ HACE:
      - Si params tiene range_start_date/range_end_date, las usa
      - Si no, usa rango amplio (±10 años) para capturar todos los eventos
      - Devuelve tupla (datetime_min, datetime_max) con timezone
    
    EJEMPLO:
      Limpias sin especificar fechas → borra TODO el calendario
      Especificas 2026-01-01 a 2026-02-28 → solo borra ese rango
    """
    now = datetime.now(tz=tz)
    rs = params.get("range_start_date")
    re_ = params.get("range_end_date")

    # Si no envía fechas, usa rango enorme (±10 años desde hoy)
    if not rs:
        rs = (now - timedelta(days=3650)).date()
    if not re_:
        re_ = (now + timedelta(days=3650)).date()

    # Convierte dates a datetimes con timezone
    tmin = datetime.combine(rs, datetime.min.time(), tzinfo=tz)
    tmax = datetime.combine(re_ + timedelta(days=1), datetime.min.time(), tzinfo=tz)
    return tmin, tmax


# =========================
# RESPONSES (DOC HELPERS)
# =========================

BucketsResponseSerializer = inline_serializer(
    name="BucketsResponse",
    fields={"buckets": serializers.ListField(child=serializers.CharField())},
)

# Serializer para el rango de fechas en respuestas de limpieza
RangeSerializer = inline_serializer(
    name="DateRange",
    fields={
        "from": serializers.CharField(help_text="Fecha/hora inicio ISO 8601"),
        "to": serializers.CharField(help_text="Fecha/hora fin ISO 8601"),
    },
)

CalendarClearResponseSerializer = inline_serializer(
    name="CalendarClearResponse",
    fields={
        "calendar_id": serializers.CharField(help_text="ID del calendario limpiado"),
        "deleted_count": serializers.IntegerField(help_text="Cantidad de eventos eliminados"),
        "sample_deleted_ids": serializers.ListField(child=serializers.CharField(), help_text="Muestra de IDs eliminados"),
        "range": RangeSerializer,
    },
)

CalendarClearBucketResponseSerializer = inline_serializer(
    name="CalendarClearBucketResponse",
    fields={
        "calendar_id": serializers.CharField(help_text="ID del calendario"),
        "bucket": serializers.CharField(help_text="Bucket filtrado"),
        "deleted_count": serializers.IntegerField(help_text="Cantidad de eventos eliminados"),
        "sample_deleted_ids": serializers.ListField(child=serializers.CharField(), help_text="Muestra de IDs eliminados"),
        "range": RangeSerializer,
    },
)

SyncBucketsResponseSerializer = inline_serializer(
    name="SyncBucketsResponse",
    fields={
        "synced_at": serializers.CharField(),
        "buckets_in_google": serializers.ListField(child=serializers.CharField()),
        "deleted_from_table": serializers.ListField(child=serializers.CharField()),
        "deleted_count": serializers.IntegerField(),
        "message": serializers.CharField(),
    },
)

SlotsGenerarResponseSerializer = inline_serializer(
    name="SlotsGenerarResponse",
    fields={
        "bucket": serializers.CharField(),
        "created_count": serializers.IntegerField(),
        "created_ids": serializers.ListField(child=serializers.CharField()),
    },
)

# Serializer detallado para el evento actualizado en BD
BdUpdatedSerializer = inline_serializer(
    name="BdUpdated",
    fields={
        "id": serializers.CharField(help_text="ID del evento en Google Calendar"),
        "summary": serializers.CharField(help_text="Nuevo summary del evento"),
    },
)

SlotReservarResponseSerializer = inline_serializer(
    name="SlotReservarResponse",
    fields={
        "bucket": serializers.CharField(help_text="Nombre del bucket"),
        "bd_event_id": serializers.CharField(help_text="ID del evento en calendario BD"),
        "final_calendar_id": serializers.CharField(help_text="ID del calendario final"),
        "final_event_id": serializers.CharField(help_text="ID del evento creado en calendario final"),
        "final_htmlLink": serializers.CharField(required=False, allow_blank=True, help_text="Link HTML al evento"),
        "bd_updated": BdUpdatedSerializer,
    },
)

# Serializer detallado para cada slot en la respuesta
SlotItemSerializer = inline_serializer(
    name="SlotItem",
    fields={
        "id": serializers.CharField(help_text="ID del evento en Google Calendar"),
        "summary": serializers.CharField(help_text="Resumen/título del slot"),
        "start": inline_serializer(
            name="SlotDateTime",
            fields={
                "dateTime": serializers.CharField(help_text="Fecha/hora ISO 8601"),
                "timeZone": serializers.CharField(required=False),
            },
        ),
        "end": inline_serializer(
            name="SlotDateTimeEnd",
            fields={
                "dateTime": serializers.CharField(help_text="Fecha/hora ISO 8601"),
                "timeZone": serializers.CharField(required=False),
            },
        ),
        "bucket": serializers.CharField(help_text="Nombre del bucket"),
        "slot_status": serializers.CharField(help_text="AVAILABLE o RESERVED"),
        "state": serializers.CharField(required=False, allow_null=True),
        "professional_key": serializers.CharField(required=False, allow_null=True),
        "professional_name": serializers.CharField(required=False, allow_null=True),
        "slot_uid": serializers.CharField(required=False, allow_null=True),
    },
)

SlotsLibresResponseSerializer = inline_serializer(
    name="SlotsLibresResponse",
    fields={
        "bucket": serializers.CharField(),
        "desde": serializers.CharField(help_text="Fecha inicio YYYY-MM-DD"),
        "hasta": serializers.CharField(help_text="Fecha fin YYYY-MM-DD"),
        "count": serializers.IntegerField(help_text="Cantidad de slots devueltos"),
        "slots": serializers.ListField(child=SlotItemSerializer),
    },
)


class BucketsDesdeTablaView(APIView):
    """GET /calendar/buckets/tabla"""

    @extend_schema(exclude=True)
    def get(self, request):
        buckets = list(Bucket.objects.order_by("name").values_list("name", flat=True))
        return Response({"buckets": buckets})


class BucketsDesdeGoogleView(APIView):
    """
    GET /calendar/buckets/google
    Escanea eventos del calendario BD en un rango razonable y extrae buckets únicos.
    """

    @extend_schema(responses={200: BucketsResponseSerializer})
    def get(self, request):
        bd_id = _bd_calendar_id()
        svc = _get_gc_service(request, bd_id)
        if not isinstance(svc, GoogleCalendarService):
            return svc

        now = datetime.now(tz=_cal_tz())
        tmin = now - timedelta(days=30)
        tmax = now + timedelta(days=180)

        events = svc.list_events(time_min=tmin, time_max=tmax, max_results=2500)
        uniq = set()
        for ev in events:
            b = (_extract_bucket(ev) or "").strip().lower()
            if b:
                uniq.add(b)

        return Response({"buckets": sorted(list(uniq))})


class CalendarioLimpiarView(APIView):
    """POST /calendar/calendars/limpiar"""

    @extend_schema(exclude=True)
    def post(self, request):
        in_ser = CalendarClearSerializer(data=request.data)
        in_ser.is_valid(raise_exception=True)
        data = in_ser.validated_data

        calendar_id = (data.get("calendar_id") or "").strip()
        if not calendar_id:
            return Response({"detail": "calendar_id inválido"}, status=status.HTTP_400_BAD_REQUEST)

        tz = _cal_tz()
        tmin, tmax = _cleanup_range(data, tz)

        svc = _get_gc_service(request, calendar_id)
        if not isinstance(svc, GoogleCalendarService):
            return svc

        events = svc.list_events_all(time_min=tmin, time_max=tmax, max_results=2500)

        deleted = []
        for ev in events:
            ev_id = ev.get("id")
            if not ev_id:
                continue
            svc.delete_event(ev_id)
            if len(deleted) < 200:
                deleted.append(ev_id)

        return Response(
            {
                "calendar_id": calendar_id,
                "deleted_count": len(events),
                "sample_deleted_ids": deleted,
                "range": {"from": tmin.isoformat(), "to": tmax.isoformat()},
            },
            status=status.HTTP_200_OK,
        )


class CalendarioLimpiarBucketView(APIView):
    """POST /calendar/calendars/limpiar-bucket"""

    @extend_schema(exclude=True)
    def post(self, request):
        in_ser = CalendarClearBucketSerializer(data=request.data)
        in_ser.is_valid(raise_exception=True)
        data = in_ser.validated_data

        calendar_id = (data.get("calendar_id") or "").strip()
        bucket_norm = data.get("bucket_norm")
        if not calendar_id:
            return Response({"detail": "calendar_id inválido"}, status=status.HTTP_400_BAD_REQUEST)

        tz = _cal_tz()
        tmin, tmax = _cleanup_range(data, tz)

        svc = _get_gc_service(request, calendar_id)
        if not isinstance(svc, GoogleCalendarService):
            return svc

        events = svc.list_events_all(time_min=tmin, time_max=tmax, max_results=2500)

        deleted = []
        deleted_count = 0
        for ev in events:
            meta = _event_slot_meta(ev)
            b = (meta.get("bucket") or "").strip().lower()
            if b != bucket_norm:
                continue
            ev_id = ev.get("id")
            if not ev_id:
                continue
            svc.delete_event(ev_id)
            deleted_count += 1
            if len(deleted) < 200:
                deleted.append(ev_id)

        return Response(
            {
                "calendar_id": calendar_id,
                "bucket": bucket_norm,
                "deleted_count": deleted_count,
                "sample_deleted_ids": deleted,
                "range": {"from": tmin.isoformat(), "to": tmax.isoformat()},
            },
            status=status.HTTP_200_OK,
        )


class SyncBucketsView(APIView):
    """POST /calendar/buckets/sincronizar"""

    @extend_schema(exclude=True)
    def post(self, request):
        in_ser = SyncBucketsSerializer(data=request.data)
        in_ser.is_valid(raise_exception=True)
        data = in_ser.validated_data
        _silent = data.get("silent", False)

        bd_id = _bd_calendar_id()
        svc = GoogleCalendarService(calendar_id=bd_id)

        now = datetime.now(tz=_cal_tz())
        tmin = now - timedelta(days=3650)
        tmax = now + timedelta(days=3650)

        events = svc.list_events_all(time_min=tmin, time_max=tmax, max_results=2500)

        buckets_en_google = set()
        for ev in events:
            b = (_extract_bucket(ev) or "").strip().lower()
            if b:
                buckets_en_google.add(b)

        todos_en_tabla = Bucket.objects.all()
        deleted_buckets = []
        for bucket_obj in todos_en_tabla:
            if bucket_obj.name not in buckets_en_google:
                deleted_buckets.append(bucket_obj.name)
                bucket_obj.delete()

        return Response(
            {
                "synced_at": datetime.now(tz=_cal_tz()).isoformat(),
                "buckets_in_google": sorted(list(buckets_en_google)),
                "deleted_from_table": deleted_buckets,
                "deleted_count": len(deleted_buckets),
                "message": f"Tabla sincronizada. Se eliminaron {len(deleted_buckets)} bucket(s) sin eventos.",
            },
            status=status.HTTP_200_OK,
        )


class SlotReservarView(APIView):
    """
    POST /calendar/buckets/<bucket>/slots/<event_id>/reservar
    - valida que event_id pertenezca al bucket (NO confiar en el bot)
    - si el slot TIENE profesional asignado, professional_name del request DEBE coincidir
    - si el slot NO tiene profesional (agenda genérica), se ignora el valor de professional_name
    - cambia slot en BD a RESERVADO (sin borrarlo)
    - crea evento confirmado en calendario FINAL del bucket (notificaciones)
    """

    @extend_schema(
        request=SlotReservarSerializer,
        responses={
            200: SlotReservarResponseSerializer,
            400: inline_serializer(name="BadRequest", fields={"detail": serializers.CharField()}),
            409: inline_serializer(name="Conflict", fields={"detail": serializers.CharField()}),
            502: inline_serializer(name="BadGateway", fields={"detail": serializers.CharField()}),
        },
    )
    def post(self, request, bucket: str, event_id: str):
        bucket_norm = (bucket or "").strip().lower()
        if not bucket_norm:
            return Response({"detail": "bucket inválido"}, status=status.HTTP_400_BAD_REQUEST)

        in_ser = SlotReservarSerializer(data=request.data)
        in_ser.is_valid(raise_exception=True)
        data = in_ser.validated_data
        attendees = data.get("attendees_norm") or []
        professional_key_req = data.get("professional_key_norm")

        bd_id = _bd_calendar_id()
        bd_svc = _get_gc_service(request, bd_id)
        if not isinstance(bd_svc, GoogleCalendarService):
            return bd_svc

        ev = bd_svc.get_event(event_id)
        meta = _event_slot_meta(ev)

        ev_bucket = (meta.get("bucket") or "").strip().lower()
        professional_key = _normalize_professional_key(meta.get("professional_key"), meta.get("professional_name"))
        if ev_bucket != bucket_norm:
            return Response(
                {"detail": "No agenda: el bucket no pertenece a esta cita.", "event_bucket": ev_bucket, "path_bucket": bucket_norm},
                status=status.HTTP_409_CONFLICT,
            )

        # Validar que professional_key del request coincida con el del slot
        if professional_key_req != professional_key:
            return Response(
                {
                    "detail": "No agenda: el profesional no coincide con el slot.",
                    "request_professional_key": professional_key_req,
                    "slot_professional_key": professional_key,
                },
                status=status.HTTP_409_CONFLICT,
            )

        if not _is_available_slot_event(meta):
            return Response({"detail": "Slot no disponible."}, status=status.HTTP_409_CONFLICT)

        bobj = _ensure_bucket_calendar(bucket_norm, request=request)
        if isinstance(bobj, HttpResponseBase):
            return bobj

        final_svc = _get_gc_service(request, bobj.final_calendar_id)
        if not isinstance(final_svc, GoogleCalendarService):
            return final_svc

        start = _parse_iso(ev["start"]["dateTime"])
        end = _parse_iso(ev["end"]["dateTime"])

        professional_name = meta.get("professional_name") or None
        slot_summary = _slot_summary("RESERVED", bucket_norm, professional_name)

        desc_lines = [f"Cliente: {data['customer_name']}"]
        if data.get("customer_phone"):
            desc_lines.append(f"Teléfono: {data['customer_phone']}")
        if data.get("notes"):
            desc_lines.append((data.get("notes") or "").strip())
        desc_final = "\n".join([ln for ln in desc_lines if ln]).strip() or None

        dto_final = GoogleEventCreate(
            summary=slot_summary,
            start=start,
            end=end,
            description=desc_final or None,
            location=None,
            attendees=attendees if attendees else None,
        )
        final_ev = final_svc.create_event(dto_final)
        final_event_id = (final_ev or {}).get("id")
        final_html_link = (final_ev or {}).get("htmlLink")
        final_calendar_id = bobj.final_calendar_id
        if not final_event_id:
            return Response({"detail": "No se pudo obtener final_event_id"}, status=status.HTTP_502_BAD_GATEWAY)

        existing_priv = (ev.get("extendedProperties") or {}).get("private") or {}
        now_iso = isoformat_z(datetime.now(tz=_cal_tz()))

        priv = {k: str(v) for k, v in existing_priv.items() if v is not None}
        priv.update(
            {
                "slot_kind": "SLOT",
                "bucket": bucket_norm,
                "slot_status": "RESERVED",
                "display_summary": slot_summary,
                "reserved_at": now_iso,
                "invitee_emails": json.dumps(attendees),
                "professional_key": professional_key,
            }
        )
        priv["final_event_id"] = str(final_event_id)
        priv["final_calendar_id"] = str(final_calendar_id)
        if final_html_link:
            priv["final_htmlLink"] = str(final_html_link)
        if professional_name:
            priv["professional_name"] = professional_name
        if not priv.get("slot_uid"):
            priv["slot_uid"] = str(uuid.uuid4())
        if not priv.get("created_at"):
            priv["created_at"] = now_iso

        patch_body = {
            "summary": slot_summary,
            "description": ev.get("description") or "Slot reservado",
            "attendees": attendees if attendees else None,
            "extendedProperties": {"private": priv},
        }
        patch_body = {k: v for k, v in patch_body.items() if v is not None}

        bd_updated = bd_svc.patch_event(event_id, patch_body, send_updates="none")

        return Response(
            {
                "bucket": bucket_norm,
                "bd_event_id": event_id,
                "final_calendar_id": bobj.final_calendar_id,
                "final_event_id": final_ev.get("id"),
                "final_htmlLink": final_ev.get("htmlLink"),
                "bd_updated": {"id": bd_updated.get("id"), "summary": bd_updated.get("summary")},
            },
            status=status.HTTP_200_OK,
        )


class SlotsGenerarView(APIView):
    """
    POST /calendar/buckets/<bucket>/slots/generar
    - Crea slots en calendario BD
    - Si bucket nuevo: crea calendario FINAL y lo guarda en tabla Bucket
    - Valida choques SOLO dentro del bucket
    - NUEVO: evita doble envío con lock por bucket
    """

    @extend_schema(exclude=True)
    def post(self, request, bucket: str):
        bucket_norm = (bucket or "").strip().lower()
        if not bucket_norm:
            return Response({"detail": "bucket inválido"}, status=status.HTTP_400_BAD_REQUEST)

        lock_key = f"slots_generar_lock:{bucket_norm}"
        got_lock = cache.add(lock_key, "1", timeout=120)
        if not got_lock:
            return Response(
                {"detail": "Ya hay una generación en proceso para este bucket. Espera y reintenta."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            in_ser = SlotCreateSerializer(data=request.data)
            in_ser.is_valid(raise_exception=True)
            data = in_ser.validated_data

            professional_name = (data.get("professional_name") or "").strip() or None
            professional_key = _normalize_professional_key(data.get("professional_key"), professional_name)
            
            if not professional_key:
                return Response(
                    {"detail": "professional_name es obligatorio para generar slots."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            ensured = _ensure_bucket_calendar(bucket_norm, request=request)
            if isinstance(ensured, HttpResponseBase):
                return ensured

            bd_id = _bd_calendar_id()
            svc = _get_gc_service(request, bd_id)
            if not isinstance(svc, GoogleCalendarService):
                return svc
            tz = _cal_tz()

            summary = _slot_summary("AVAILABLE", bucket_norm, professional_name)
            description_text = "Slot generado por sistema"

            def build_private_meta(summary_text: str) -> dict[str, str]:
                now_iso = isoformat_z(datetime.now(tz=_cal_tz()))
                base = {
                    "slot_kind": "SLOT",
                    "slot_uid": str(uuid.uuid4()),
                    "bucket": bucket_norm,
                    "slot_status": "AVAILABLE",
                    "created_at": now_iso,
                    "display_summary": summary_text,
                    "professional_key": professional_key,
                }
                if professional_name:
                    base["professional_name"] = professional_name
                return base

            created_ids = []

            if "start" in data:
                start = data["start"]
                end = data["end"]

                existing = svc.list_events(time_min=start, time_max=end, max_results=250)
                for ev in existing:
                    meta = _event_slot_meta(ev)
                    if (meta.get("bucket") or "").strip().lower() != bucket_norm:
                        continue
                    ev_prof_key = _normalize_professional_key(meta.get("professional_key"), meta.get("professional_name"))
                    if ev_prof_key != professional_key:
                        continue
                    evs = _parse_iso(ev["start"]["dateTime"])
                    eve = _parse_iso(ev["end"]["dateTime"])
                    if _overlaps(start, end, evs, eve):
                        return Response(
                            {"detail": "Choque detectado dentro del bucket.", "conflict_event": ev.get("id")},
                            status=status.HTTP_409_CONFLICT,
                        )

                dto = GoogleEventCreate(
                    summary=summary,
                    start=start,
                    end=end,
                    description=description_text,
                    location=None,
                    attendees=None,
                    extended_properties_private=build_private_meta(summary),
                    send_updates="none",
                )
                ev = svc.create_event(dto)
                created_ids.append(ev.get("id"))

                return Response(
                    {"bucket": bucket_norm, "created_count": len(created_ids), "created_ids": created_ids},
                    status=status.HTTP_201_CREATED,
                )

            rs: date = data["range_start_date"]
            re_: date = data["range_end_date"]
            slot_minutes = int(data["slot_minutes"])
            weekdays = data["weekdays"]
            windows = data["windows"]
            blocks = data["blocks"]

            range_start_dt = datetime.combine(rs, datetime.min.time(), tzinfo=tz)
            range_end_dt = datetime.combine(re_ + timedelta(days=1), datetime.min.time(), tzinfo=tz)

            existing_all = svc.list_events(time_min=range_start_dt, time_max=range_end_dt, max_results=2500)
            bucket_intervals = []
            for ev in existing_all:
                meta = _event_slot_meta(ev)
                if (meta.get("bucket") or "").strip().lower() != bucket_norm:
                    continue
                ev_prof_key = _normalize_professional_key(meta.get("professional_key"), meta.get("professional_name"))
                evs = _parse_iso(ev["start"]["dateTime"])
                eve = _parse_iso(ev["end"]["dateTime"])
                bucket_intervals.append((evs, eve, ev.get("id"), ev_prof_key))

            def overlaps_bucket(a, b, prof_key: str):
                for s, e, eid, pk in bucket_intervals:
                    if pk != prof_key:
                        continue
                    if _overlaps(a, b, s, e):
                        return eid
                return None

            day = rs
            while day <= re_:
                if (day.isoweekday() in weekdays):
                    for w in windows:
                        w_start = _to_dt(day, w["start"], tz)
                        w_end = _to_dt(day, w["end"], tz)

                        cursor = w_start
                        while cursor + timedelta(minutes=slot_minutes) <= w_end:
                            nxt = cursor + timedelta(minutes=slot_minutes)

                            blocked = False
                            for bl in blocks:
                                b1 = _to_dt(day, bl["start"], tz)
                                b2 = _to_dt(day, bl["end"], tz)
                                if _overlaps(cursor, nxt, b1, b2):
                                    blocked = True
                                    break

                            if not blocked:
                                conflict = overlaps_bucket(cursor, nxt, professional_key)
                                if not conflict:
                                    dto = GoogleEventCreate(
                                        summary=summary,
                                        start=cursor,
                                        end=nxt,
                                        description=description_text,
                                        location=None,
                                        attendees=None,
                                        extended_properties_private=build_private_meta(summary),
                                        send_updates="none",
                                    )
                                    ev = svc.create_event(dto)
                                    created_ids.append(ev.get("id"))
                                    bucket_intervals.append((cursor, nxt, ev.get("id"), professional_key))

                            cursor = nxt
                day += timedelta(days=1)

            return Response(
                {"bucket": bucket_norm, "created_count": len(created_ids), "created_ids": created_ids},
                status=status.HTTP_201_CREATED,
            )

        finally:
            cache.delete(lock_key)


class SlotsLibresView(APIView):
    """
    GET /calendar/buckets/<bucket>/slots/libres
    ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&limit=100
    &include_all=1 -> devuelve DISPONIBLE + RESERVADO (para calendario)
    """

    @extend_schema(
        parameters=[
            SlotsLibresQuerySerializer,
            OpenApiParameter(
                name="include_all",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Si es 1/true incluye AVAILABLE + RESERVED. Si no, solo AVAILABLE.",
            ),
        ],
        responses={200: SlotsLibresResponseSerializer},
    )
    def get(self, request, bucket: str):
        bucket_norm = (bucket or "").strip().lower()
        if not bucket_norm:
            return Response({"detail": "bucket inválido"}, status=status.HTTP_400_BAD_REQUEST)

        q = SlotsLibresQuerySerializer(data=request.query_params)
        q.is_valid(raise_exception=True)
        params = q.validated_data

        desde: date = params["desde"]
        hasta: date = params["hasta"]
        limit: int = params["limit"]
        professional_key_filter = params.get("professional_key_norm")

        include_all = request.query_params.get("include_all") in ("1", "true", "True")

        tz = _cal_tz()
        tmin = datetime.combine(desde, datetime.min.time(), tzinfo=tz)
        tmax = datetime.combine(hasta + timedelta(days=1), datetime.min.time(), tzinfo=tz)

        bd_id = _bd_calendar_id()
        svc = _get_gc_service(request, bd_id)
        if not isinstance(svc, GoogleCalendarService):
            return svc
        events = svc.list_events(time_min=tmin, time_max=tmax, max_results=2500)

        out = []
        for ev in events:
            meta = _event_slot_meta(ev)
            b = (meta.get("bucket") or "").strip().lower()
            if b != bucket_norm:
                continue

            meta_prof_key = _normalize_professional_key(meta.get("professional_key"), meta.get("professional_name"))
            # Filtrar por profesional si se especificó (obligatorio para bot, opcional para admin)
            if professional_key_filter and meta_prof_key != professional_key_filter:
                continue

            if not include_all and not _is_available_slot_event(meta):
                continue

            slot_status = (meta.get("slot_status") or "").upper()

            out.append(
                {
                    "id": ev.get("id"),
                    "summary": ev.get("summary"),
                    "start": ev.get("start"),
                    "end": ev.get("end"),
                    "bucket": bucket_norm,
                    "slot_status": slot_status,
                    "state": meta.get("state"),
                    "professional_key": meta_prof_key,
                    "professional_name": meta.get("professional_name"),
                    "slot_uid": meta.get("slot_uid"),
                }
            )

            if len(out) >= limit:
                break

        return Response(
            {
                "bucket": bucket_norm,
                "desde": str(desde),
                "hasta": str(hasta),
                "count": len(out),
                "slots": out,
            }
        )
