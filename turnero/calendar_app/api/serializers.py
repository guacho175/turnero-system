from __future__ import annotations

from datetime import date, datetime, timedelta
import re
from rest_framework import serializers


def _normalize_professional_key(raw_key: str | None, fallback_name: str | None = None) -> str:
    candidate = (raw_key or "").strip()
    if not candidate and fallback_name is not None:
        candidate = (fallback_name or "").strip()
    if not candidate:
        return "__none__"
    candidate = re.sub(r"[^a-z0-9]+", "_", candidate.lower())
    return candidate.strip("_") or "__none__"


class TimeWindowSerializer(serializers.Serializer):
    """Ventana de tiempo HH:MM a HH:MM para generación de slots."""
    start = serializers.CharField(
        max_length=5,
        help_text="Hora inicio HH:MM (ej: 09:00)"
    )
    end = serializers.CharField(
        max_length=5,
        help_text="Hora fin HH:MM (ej: 18:00)"
    )


class SlotCreateSerializer(serializers.Serializer):
    """
    Payload para generar slots en el CALENDARIO BD.
    Importante: el bucket NO va en el body, va en el PATH:
      POST /calendar/buckets/<bucket>/slots/generar
    """

    # A) Slot único exacto
    start = serializers.DateTimeField(required=False)
    end = serializers.DateTimeField(required=False)

    # B) Generación por rango de FECHAS
    range_start_date = serializers.DateField(required=False)
    range_end_date = serializers.DateField(required=False)
    slot_minutes = serializers.IntegerField(required=False, min_value=5)

    # Metadatos del slot
    service = serializers.CharField(required=False, allow_blank=True, max_length=120)
    summary_prefix = serializers.CharField(required=False, allow_blank=True, max_length=60, default="DISPONIBLE")
    professional_name = serializers.CharField(required=True, max_length=120, help_text="Nombre del profesional (obligatorio)")
    professional_key = serializers.CharField(required=False, allow_blank=True, max_length=120, help_text="Clave única del profesional (se genera de professional_name si no se envía)")

    # 1=lun ... 7=dom
    weekdays = serializers.ListField(
        child=serializers.IntegerField(min_value=1, max_value=7),
        required=False,
        allow_empty=True,
        help_text="Días de la semana: 1=lun, 2=mar, ..., 7=dom"
    )

    # Ventanas: [{"start":"09:00","end":"13:00"}, {"start":"14:00","end":"18:00"}]
    windows = TimeWindowSerializer(
        many=True,
        required=False,
        help_text="Ventanas de atención [{'start':'09:00','end':'18:00'}]"
    )

    # Bloqueos: [{"start":"13:00","end":"15:00"}]
    blocks = TimeWindowSerializer(
        many=True,
        required=False,
        help_text="Bloqueos horarios [{'start':'13:00','end':'14:00'}]"
    )

    def validate(self, data):
        single = ("start" in data) or ("end" in data)
        batch = ("range_start_date" in data) or ("range_end_date" in data)

        if single and batch:
            raise serializers.ValidationError("Usa start/end o range_start_date/range_end_date, no ambos.")

        # Caso A: slot único
        if single:
            if "start" not in data or "end" not in data:
                raise serializers.ValidationError("Para slot único debes enviar start y end.")
            start: datetime = data["start"]
            end: datetime = data["end"]
            if end <= start:
                raise serializers.ValidationError("end debe ser mayor que start.")
            return data

        # Caso B: por rango de fechas
        if batch:
            required = ["range_start_date", "range_end_date", "slot_minutes"]
            for k in required:
                if k not in data:
                    raise serializers.ValidationError(f"Falta {k} para creación por rango.")

            if data["range_end_date"] < data["range_start_date"]:
                raise serializers.ValidationError("range_end_date debe ser >= range_start_date.")

            # defaults
            if "weekdays" not in data or not data["weekdays"]:
                data["weekdays"] = [1, 2, 3, 4, 5, 6, 7]

            if "windows" not in data or not data["windows"]:
                data["windows"] = [{"start": "09:00", "end": "18:00"}]

            if "blocks" not in data or data["blocks"] is None:
                data["blocks"] = []

            def _parse_hhmm(s: str):
                if not isinstance(s, str) or len(s) != 5 or s[2] != ":":
                    raise serializers.ValidationError(f"Hora inválida '{s}'. Usa HH:MM (ej: 09:00).")
                hh = int(s[0:2])
                mm = int(s[3:5])
                if hh < 0 or hh > 23 or mm < 0 or mm > 59:
                    raise serializers.ValidationError(f"Hora inválida '{s}'.")
                return hh, mm

            def _validate_ranges(name: str, arr):
                for i, it in enumerate(arr):
                    if "start" not in it or "end" not in it:
                        raise serializers.ValidationError(f"{name}[{i}] debe tener start y end.")
                    sh, sm = _parse_hhmm(it["start"])
                    eh, em = _parse_hhmm(it["end"])
                    if (eh, em) <= (sh, sm):
                        raise serializers.ValidationError(f"{name}[{i}] end debe ser mayor que start.")

            _validate_ranges("windows", data["windows"])
            _validate_ranges("blocks", data["blocks"])
            return data

        raise serializers.ValidationError("Debes enviar start/end o range_start_date/range_end_date.")


class SlotsLibresQuerySerializer(serializers.Serializer):
    """
    Query params:
      GET /calendar/buckets/<bucket>/slots/libres?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&limit=100
    Reglas:
      - desde obligatorio
      - hasta opcional (si no viene, default: desde + 10 días)
      - limit opcional (default 100, max 250)
      - professional_key: obligatorio para el bot, opcional para admin interno
    """
    desde = serializers.DateField(required=True)
    hasta = serializers.DateField(required=False, allow_null=True)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=250, default=100)
    professional_name = serializers.CharField(required=False, allow_blank=True, max_length=120, help_text="Nombre del profesional (usa professional_key de preferencia)")
    professional_key = serializers.CharField(required=False, allow_blank=True, max_length=120, help_text="Clave única del profesional (OBLIGATORIO para el bot)")

    def validate(self, attrs):
        d: date = attrs["desde"]
        h = attrs.get("hasta", None)

        if h is None:
            attrs["hasta"] = d + timedelta(days=10)
        else:
            if h < d:
                raise serializers.ValidationError("hasta debe ser >= desde.")

        # professional_key: normalizar si viene, None si no
        raw_key = (attrs.get("professional_key") or "").strip()
        if raw_key:
            norm = re.sub(r"[^a-z0-9]+", "_", raw_key.lower()).strip("_")
            attrs["professional_key_norm"] = norm if norm else None
        else:
            attrs["professional_key_norm"] = None
        return attrs


class SlotReservarSerializer(serializers.Serializer):
    """
    Body:
      POST /calendar/buckets/<bucket>/slots/<event_id>/reservar

    Permite:
      - attendee_email (1) o attendees (muchos)
      - normaliza a attendees_norm
    """
    customer_name = serializers.CharField(max_length=120)
    professional_name = serializers.CharField(max_length=120, required=False, allow_blank=True, help_text="Nombre del profesional (usa professional_key de preferencia)")
    professional_key = serializers.CharField(max_length=120, required=True, help_text="Clave única del profesional (obligatorio)")
    customer_phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)

    attendee_email = serializers.EmailField(required=False, allow_blank=True)
    attendees = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        allow_empty=True
    )

    def validate(self, attrs):
        emails = []

        one = (attrs.get("attendee_email") or "").strip()
        if one:
            emails.append(one)

        many = attrs.get("attendees") or []
        for e in many:
            e = (e or "").strip()
            if e and e not in emails:
                emails.append(e)

        # professional_key es obligatorio, normalizar
        raw_key = (attrs.get("professional_key") or "").strip()
        norm = re.sub(r"[^a-z0-9]+", "_", raw_key.lower()).strip("_")
        if not norm:
            raise serializers.ValidationError("professional_key no puede quedar vacío después de normalizar.")
        attrs["professional_key_norm"] = norm
        attrs["attendees_norm"] = emails
        return attrs


class CalendarClearSerializer(serializers.Serializer):
    """
    Body:
      POST /calendar/calendars/limpiar
    """
    calendar_id = serializers.CharField(max_length=300)
    range_start_date = serializers.DateField(required=False, allow_null=True)
    range_end_date = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        rs = attrs.get("range_start_date")
        re = attrs.get("range_end_date")
        if rs and re and re < rs:
            raise serializers.ValidationError("range_end_date debe ser >= range_start_date.")
        return attrs


class CalendarClearBucketSerializer(serializers.Serializer):
    """
    VALIDADOR para POST /calendar/calendars/limpiar-bucket
    
    QUÉ VALIDA:
      - calendar_id: obligatorio, ID del calendario
      - bucket: obligatorio, nombre del bucket a limpiar
      - range_start_date: opcional, fecha inicio
      - range_end_date: opcional, fecha fin
    
    LÓGICA:
      - bucket se normaliza a minúsculas ("Medico" → "medico")
      - valida que end >= start
      - NO borra otros buckets, solo el especificado
    
    EJEMPLO:
      {
        "calendar_id": "tu@gmail.com",
        "bucket": "medico",
        "range_start_date": "2026-01-01",
        "range_end_date": "2026-12-31"
      }
      → Borra solo eventos con bucket=medico en ese rango
         No toca peluqueria, kinesiologia, etc.
    """
    calendar_id = serializers.CharField(max_length=300)
    bucket = serializers.CharField(max_length=120)
    range_start_date = serializers.DateField(required=False, allow_null=True)
    range_end_date = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        bucket = (attrs.get("bucket") or "").strip().lower()
        if not bucket:
            raise serializers.ValidationError("bucket no puede ser vacío.")
        attrs["bucket_norm"] = bucket  # Guardar normalizado para usar en view

        rs = attrs.get("range_start_date")
        re = attrs.get("range_end_date")
        if rs and re and re < rs:
            raise serializers.ValidationError("range_end_date debe ser >= range_start_date.")
        return attrs


class SyncBucketsSerializer(serializers.Serializer):
    """
    VALIDADOR para POST /calendar/buckets/sincronizar
    
    QUÉ VALIDA:
      Técnicamente no requiere parámetros (puede ser {} vacío)
      
    PARÁMETROS OPCIONALES:
      - silent: boolean (default False)
        Si true → modo silencioso (para integraciones automáticas)
    
    QUÉ HACE:
      - Lee Google Calendar BD
      - Extrae todos los buckets presentes
      - Borra registros de tabla.Bucket que ya no tienen eventos
    
    CASO DE USO:
      POST /calendar/buckets/sincronizar
      {}
      
      Respuesta:
      {
        "buckets_in_google": ["medico", "peluqueria"],
        "deleted_from_table": ["viejo_bucket"],
        "deleted_count": 1
      }
      
      → Tabla ahora está limpia y sincronizada
    """
    silent = serializers.BooleanField(required=False, default=False)
