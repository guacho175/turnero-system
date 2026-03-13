import os  # Manejo de archivos
from django.conf import settings  # Lee rutas desde settings.py
from google_auth_oauthlib.flow import InstalledAppFlow  # Ejecuta OAuth en navegador
from google.oauth2.credentials import Credentials  # Lee/escribe token.json
from google.auth.transport.requests import Request  # Para refresh del token

SCOPES = [
    "https://www.googleapis.com/auth/calendar"  # Permite events + freebusy
]

def run_oauth_setup():
    # Ruta del credentials.json (cliente OAuth)
    credentials_path = getattr(settings, "GOOGLE_CREDENTIALS_FILE", None)
    if not credentials_path:
        raise RuntimeError("Falta settings.GOOGLE_CREDENTIALS_FILE")

    # Ruta del token.json (token OAuth guardado)
    token_path = getattr(settings, "GOOGLE_TOKEN_FILE", None)
    if not token_path:
        raise RuntimeError("Falta settings.GOOGLE_TOKEN_FILE")

    creds = None

    # Lee token existente si existe
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    # Si existe pero está expirado y tiene refresh_token, refresca y re-guardalo
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(token_path, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
        return str(token_path)

    # Si no hay token válido, genera uno nuevo con los scopes
    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), SCOPES)

        # Esto es exactamente el comportamiento "se abre Google y me autentifico"
        creds = flow.run_local_server(port=0)

        # Guarda token nuevo con scopes correctos
        with open(token_path, "w", encoding="utf-8") as f:
            f.write(creds.to_json())

    return str(token_path)
