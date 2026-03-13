from __future__ import annotations  # Permite usar anotaciones de tipos como strings

from dataclasses import dataclass  # Define DTOs simples e inmutables
from datetime import datetime  # Manejo de fechas y horas
from typing import Any, Dict, List, Optional  # Tipos para claridad y typing

from django.conf import settings  # Acceso a settings.py

from google.oauth2.credentials import Credentials  # Carga credenciales OAuth desde token.json
from google.auth.transport.requests import Request  # Para refresh del token
from googleapiclient.discovery import build  # Construye el cliente de Google Calendar API
from googleapiclient.errors import HttpError  # Manejo de errores HTTP de Google API

from calendar_app.utils.datetime import isoformat_z  # Convierte datetime a ISO 8601 UTC
from google.auth.exceptions import RefreshError

# legacy flow (console) existe en google_oauth_setup.py pero no se usa en web flow


@dataclass(frozen=True)
class GoogleEventCreate:
    """DTO para creación de eventos en Google Calendar"""

    summary: str                     # Título del evento
    start: datetime                  # Fecha/hora inicio
    end: datetime                    # Fecha/hora término
    description: Optional[str] = None  # Descripción opcional (solo texto humano)
    location: Optional[str] = None     # Ubicación opcional
    attendees: Optional[List[str]] = None  # Correos de invitados
    extended_properties_private: Optional[Dict[str, str]] = None  # extendedProperties.private
    extended_properties_shared: Optional[Dict[str, str]] = None   # extendedProperties.shared
    color_id: Optional[str] = None
    status: Optional[str] = None
    send_updates: str = "all"


class GoogleCalendarService:
    """Servicio que encapsula toda la interacción con Google Calendar"""

    def __init__(self, calendar_id: Optional[str] = None, credentials: Optional[Credentials] = None):
        # Usa el calendar_id entregado o el default configurado
        self.calendar_id = calendar_id or getattr(settings, "GOOGLE_CALENDAR_ID", "primary")
        self._provided_credentials = credentials

    # -------------------------
    # Autenticación / Cliente
    # -------------------------

    def _get_credentials(self) -> Credentials:
        if self._provided_credentials:
            return self._provided_credentials

        token_path = getattr(settings, "GOOGLE_TOKEN_FILE", None)
        if not token_path:
            raise RuntimeError("GOOGLE_TOKEN_FILE no está configurado.")

        try:
            creds = Credentials.from_authorized_user_file(str(token_path))
        except FileNotFoundError:
            raise RuntimeError("AUTH_REQUIRED: falta token.json")
        except ValueError:
            raise RuntimeError("AUTH_REQUIRED: token.json inválido")

        try:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                with open(str(token_path), "w", encoding="utf-8") as f:
                    f.write(creds.to_json())
        except RefreshError as e:
            raise RuntimeError(f"AUTH_REQUIRED: no se pudo refrescar token ({e})")

        if not creds or not creds.valid:
            raise RuntimeError("AUTH_REQUIRED: token inválido")

        return creds

    def _client(self):
        # Construye el cliente Google Calendar API v3
        creds = self._get_credentials()
        return build("calendar", "v3", credentials=creds, cache_discovery=False)

    # -------------------------
    # Operaciones Calendar
    # -------------------------

    def list_events(
        self,
        time_min: Optional[datetime] = None,
        time_max: Optional[datetime] = None,
        max_results: int = 50,
    ) -> List[Dict[str, Any]]:
        # Lista eventos del calendario
        svc = self._client()

        params: Dict[str, Any] = {
            "calendarId": self.calendar_id,
            "singleEvents": True,
            "orderBy": "startTime",
            "maxResults": max_results,
        }

        # Filtro por fecha mínima
        if time_min:
            params["timeMin"] = isoformat_z(time_min)

        # Filtro por fecha máxima
        if time_max:
            params["timeMax"] = isoformat_z(time_max)

        try:
            # Ejecuta llamada events.list
            res = svc.events().list(**params).execute()
            return res.get("items", [])
        except HttpError as e:
            raise RuntimeError(
                f"Google Calendar list_events falló ({self.calendar_id}): {e}"
            ) from e

    def list_events_all(
        self,
        time_min: Optional[datetime] = None,
        time_max: Optional[datetime] = None,
        max_results: int = 2500,
    ) -> List[Dict[str, Any]]:
        # Lista todos los eventos paginando si es necesario
        svc = self._client()

        params: Dict[str, Any] = {
            "calendarId": self.calendar_id,
            "singleEvents": True,
            "orderBy": "startTime",
            "maxResults": max_results,
        }

        if time_min:
            params["timeMin"] = isoformat_z(time_min)

        if time_max:
            params["timeMax"] = isoformat_z(time_max)

        items: List[Dict[str, Any]] = []
        page_token: Optional[str] = None

        try:
            while True:
                if page_token:
                    params["pageToken"] = page_token
                res = svc.events().list(**params).execute()
                items.extend(res.get("items", []))
                page_token = res.get("nextPageToken")
                if not page_token:
                    break
            return items
        except HttpError as e:
            raise RuntimeError(
                f"Google Calendar list_events_all falló ({self.calendar_id}): {e}"
            ) from e

    def list_calendars_all(self, max_results: int = 250):
        """Lista todos los calendarios del usuario (calendarList) con paginación."""
        svc = self._client()

        params: Dict[str, Any] = {
            "maxResults": max_results,
        }

        items: List[Dict[str, Any]] = []
        page_token: Optional[str] = None

        try:
            while True:
                if page_token:
                    params["pageToken"] = page_token
                res = svc.calendarList().list(**params).execute()
                items.extend(res.get("items", []))
                page_token = res.get("nextPageToken")
                if not page_token:
                    break
            return items
        except HttpError as e:
            raise RuntimeError(
                f"Google Calendar list_calendars_all falló: {e}"
            ) from e

    def create_event(self, payload: GoogleEventCreate) -> Dict[str, Any]:
        # Crea un evento en Google Calendar
        svc = self._client()

        body: Dict[str, Any] = {
            "summary": payload.summary,
            "description": payload.description,
            "location": payload.location,
            "start": {"dateTime": isoformat_z(payload.start)},
            "end": {"dateTime": isoformat_z(payload.end)},
        }

        # Agrega invitados si existen
        if payload.attendees:
            body["attendees"] = [{"email": email} for email in payload.attendees]

        if payload.extended_properties_private or payload.extended_properties_shared:
            ep: Dict[str, Any] = {}
            if payload.extended_properties_private:
                ep["private"] = {k: str(v) for k, v in payload.extended_properties_private.items() if v is not None}
            if payload.extended_properties_shared:
                ep["shared"] = {k: str(v) for k, v in payload.extended_properties_shared.items() if v is not None}
            body["extendedProperties"] = ep

        if payload.color_id:
            body["colorId"] = payload.color_id

        if payload.status:
            body["status"] = payload.status

        # Elimina campos None
        body = {k: v for k, v in body.items() if v is not None}

        try:
            # Inserta evento y envía correos a invitados
            return svc.events().insert(
                calendarId=self.calendar_id,
                body=body,
                sendUpdates=payload.send_updates or "all",
            ).execute()
        except HttpError as e:
            raise RuntimeError(
                f"Google Calendar create_event falló ({self.calendar_id}): {e}"
            ) from e

    def freebusy(self, time_min: datetime, time_max: datetime) -> Dict[str, Any]:
        # Consulta bloques ocupados (free/busy)
        svc = self._client()

        body = {
            "timeMin": isoformat_z(time_min),
            "timeMax": isoformat_z(time_max),
            "items": [{"id": self.calendar_id}],
        }

        try:
            # Ejecuta freeBusy.query (requiere scopes adecuados)
            return svc.freebusy().query(body=body).execute()
        except HttpError as e:
            raise RuntimeError(
                f"Google Calendar freebusy falló ({self.calendar_id}): {e}"
            ) from e

    def get_event(self, event_id: str) -> Dict[str, Any]:
        # Obtiene un evento por ID
        svc = self._client()

        try:
            return svc.events().get(
                calendarId=self.calendar_id,
                eventId=event_id,
            ).execute()
        except HttpError as e:
            raise RuntimeError(
                f"Google Calendar get_event falló ({self.calendar_id}, {event_id}): {e}"
            ) from e

    def patch_event(self, event_id: str, body: Dict[str, Any], send_updates: str = "all") -> Dict[str, Any]:
        # Actualiza parcialmente un evento existente
        svc = self._client()

        # Normaliza attendees si vienen como lista de strings
        attendees = body.get("attendees")
        if attendees and isinstance(attendees, list) and attendees and isinstance(attendees[0], str):
            body["attendees"] = [{"email": email} for email in attendees]

        # Forza valores string en extendedProperties.private/shared
        ep = body.get("extendedProperties")
        if ep:
            if "private" in ep and isinstance(ep["private"], dict):
                ep["private"] = {k: str(v) for k, v in ep["private"].items() if v is not None}
            if "shared" in ep and isinstance(ep["shared"], dict):
                ep["shared"] = {k: str(v) for k, v in ep["shared"].items() if v is not None}

        try:
            return svc.events().patch(
                calendarId=self.calendar_id,
                eventId=event_id,
                body=body,
                sendUpdates=send_updates,
            ).execute()
        except HttpError as e:
            raise RuntimeError(
                f"Google Calendar patch_event falló ({self.calendar_id}, {event_id}): {e}"
            ) from e

    def delete_event(self, event_id: str) -> None:
        # Elimina un evento por ID
        svc = self._client()

        try:
            svc.events().delete(
                calendarId=self.calendar_id,
                eventId=event_id,
                sendUpdates="none",
            ).execute()
        except HttpError as e:
            raise RuntimeError(
                f"Google Calendar delete_event falló ({self.calendar_id}, {event_id}): {e}"
            ) from e


    def create_calendar(self, name: str, timezone: str = "America/Santiago", description: Optional[str] = None) -> Dict[str, Any]:
        """
        Crea un Google Calendar nuevo y retorna el recurso creado (incluye 'id').
        Requiere scope: https://www.googleapis.com/auth/calendar
        """
        svc = self._client()
        body = {"summary": name, "timeZone": timezone}
        if description:
            body["description"] = description

        try:
            return svc.calendars().insert(body=body).execute()
        except HttpError as e:
            raise RuntimeError(f"Google Calendar create_calendar falló: {e}") from e

