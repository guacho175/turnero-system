from __future__ import annotations

import logging
import os
import secrets
from typing import Dict, Optional

from django.conf import settings
from django.http import HttpResponseRedirect, JsonResponse
from django.urls import reverse

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from google.auth.exceptions import RefreshError

from calendar_app.servicios.google_calendar import GoogleCalendarService

logger = logging.getLogger(__name__)

DEFAULT_SCOPES = getattr(
    settings,
    "GOOGLE_OAUTH_SCOPES",
    ["https://www.googleapis.com/auth/calendar"],
)


def _token_path() -> str:
    token_path = getattr(settings, "GOOGLE_TOKEN_FILE", None)
    if not token_path:
        raise RuntimeError("GOOGLE_TOKEN_FILE no está configurado")
    os.makedirs(os.path.dirname(token_path), exist_ok=True)
    return str(token_path)


def _credentials_path() -> str:
    credentials_path = getattr(settings, "GOOGLE_CREDENTIALS_FILE", None)
    if not credentials_path:
        raise RuntimeError("GOOGLE_CREDENTIALS_FILE no está configurado")
    return str(credentials_path)


def _load_credentials(scopes=None) -> Optional[Credentials]:
    scopes = scopes or DEFAULT_SCOPES
    token_path = _token_path()
    if not os.path.exists(token_path):
        return None
    try:
        creds = Credentials.from_authorized_user_file(token_path, scopes)
    except Exception:
        return None
    if not creds:
        return None
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            with open(token_path, "w", encoding="utf-8") as f:
                f.write(creds.to_json())
        except RefreshError:
            return None
    if not creds.valid:
        return None
    return creds


def _build_flow(state: str) -> Flow:
    redirect_uri = getattr(settings, "GOOGLE_OAUTH_REDIRECT_URI", None)
    if not redirect_uri:
        raise RuntimeError("Falta GOOGLE_OAUTH_REDIRECT_URI en settings")
    flow = Flow.from_client_secrets_file(
        _credentials_path(), scopes=DEFAULT_SCOPES, redirect_uri=redirect_uri
    )
    return flow


def get_calendar_service_or_redirect(request, calendar_id: Optional[str] = None, next_url: Optional[str] = None):
    """Devuelve GoogleCalendarService listo o un redirect a /oauth2/start si falta autorización."""
    creds = _load_credentials()
    if creds:
        return GoogleCalendarService(calendar_id=calendar_id, credentials=creds)

    # No token válido -> redirige a OAuth
    if next_url is None:
        next_url = request.get_full_path()
    params = f"?next={next_url}" if next_url else ""
    return HttpResponseRedirect(reverse("oauth_start") + params)


def start_oauth_flow(request):
    """Inicia el flujo OAuth con Google. Robusto ante fallos de sesión."""
    # CSRF-like state
    state = secrets.token_urlsafe(32)
    next_param = request.GET.get("next") or request.GET.get("redirect") or "/calendar/"
    
    # Guardar en sesión con múltiples garantías
    request.session["oauth_state"] = state
    request.session["oauth_next"] = next_param
    request.session.modified = True  # Forzar que Django reconozca el cambio
    
    # Forzar persistencia inmediata antes del redirect externo
    try:
        request.session.save()
    except Exception as e:
        logger.warning(f"[OAuth] Error guardando sesión: {e}")
    
    # Verificar que se guardó correctamente
    session_key = request.session.session_key
    logger.info(f"[OAuth] START - session_key={session_key}, state={state[:16]}...")

    flow = _build_flow(state)
    auth_url, _ = flow.authorization_url(
        state=state,
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    
    logger.info(f"[OAuth] Redirigiendo a Google OAuth")
    return HttpResponseRedirect(auth_url)


def oauth_callback(request):
    """Callback de Google OAuth. Maneja errores de state con re-auth automático."""
    state_session = request.session.get("oauth_state")
    state_returned = request.GET.get("state")
    session_key = request.session.session_key
    
    logger.info(f"[OAuth] CALLBACK - session_key={session_key}")
    logger.info(f"[OAuth] state_session={state_session[:16] if state_session else 'NONE'}...")
    logger.info(f"[OAuth] state_returned={state_returned[:16] if state_returned else 'NONE'}...")
    
    # Verificar error de Google
    error = request.GET.get("error")
    if error:
        logger.error(f"[OAuth] Google retornó error: {error}")
        return HttpResponseRedirect(f"/calendar/?auth=google_error&detail={error}")
    
    # Verificar code
    code = request.GET.get("code")
    if not code:
        logger.error("[OAuth] Falta code en callback")
        return HttpResponseRedirect("/calendar/?auth=missing_code")
    
    # Validar state - si falla, re-iniciar flujo automáticamente
    if not state_session or state_session != state_returned:
        logger.warning(f"[OAuth] State mismatch - redirigiendo a re-auth")
        # En lugar de fallar, re-intentar el flujo completo
        return HttpResponseRedirect(reverse("oauth_start") + "?retry=state_mismatch")
    
    # Intercambiar code por tokens
    flow = _build_flow(state_session)
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        logger.error(f"[OAuth] Error en fetch_token: {e}")
        # Si el code es inválido/expirado, re-iniciar flujo
        return HttpResponseRedirect(reverse("oauth_start") + "?retry=invalid_grant")
    
    # Guardar credenciales
    creds = flow.credentials
    token_path = _token_path()
    try:
        with open(token_path, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
        logger.info(f"[OAuth] Token guardado exitosamente en {token_path}")
    except Exception as e:
        logger.error(f"[OAuth] Error guardando token: {e}")
        return HttpResponseRedirect("/calendar/?auth=token_save_error")
    
    # Limpiar sesión y redirigir
    next_url = request.session.pop("oauth_next", "/calendar/")
    request.session.pop("oauth_state", None)
    request.session.modified = True
    
    logger.info(f"[OAuth] Flujo completado, redirigiendo a {next_url}")
    return HttpResponseRedirect(next_url or "/calendar/")


def oauth_status(request):
    """Devuelve estado del token sin exponer secretos."""
    if request.user.is_authenticated and not request.user.is_staff:
        return JsonResponse({"detail": "forbidden"}, status=403)
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "forbidden"}, status=403)
    diag = token_diagnostics()
    return JsonResponse(diag)


def token_diagnostics() -> Dict[str, object]:
    creds = _load_credentials()

    if not creds:
        return {
            "token_exists": False,
            "token_valid": False,
            "token_expired": None,
            "has_refresh_token": None,
            "token_path": _token_path(),
        }

    return {
        "token_exists": True,
        "token_valid": creds.valid,
        "token_expired": creds.expired,
        "has_refresh_token": bool(creds.refresh_token),
        "token_path": _token_path(),
    }
