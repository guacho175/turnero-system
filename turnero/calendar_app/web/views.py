from django.conf import settings
from django.shortcuts import render
from django.http import HttpResponseBase

from calendar_app.servicios.google_auth_web import get_calendar_service_or_redirect


def calendar_page(request):
    """
    Página principal (si la sigues usando).
    En la nueva arquitectura, el calendario BD es único.
    """
    svc = get_calendar_service_or_redirect(request, calendar_id=getattr(settings, "GOOGLE_CALENDAR_BD_ID", "primary"))
    if isinstance(svc, HttpResponseBase):
        return svc
    return render(
        request,
        "calendar_app/calendar.html",
        {
            "calendar_bd_id": getattr(settings, "GOOGLE_CALENDAR_BD_ID", ""),
            "buckets_endpoint": "/calendar/buckets/tabla",
        },
    )


def slot_generator_page(request):
    """
    Renderiza /calendar/ui/slots.

    La UI debe:
      1) Cargar buckets desde /calendar/buckets/tabla (o /google)
      2) Al generar, llamar POST /calendar/buckets/<bucket>/slots/generar
    """
    svc = get_calendar_service_or_redirect(request, calendar_id=getattr(settings, "GOOGLE_CALENDAR_BD_ID", "primary"))
    if isinstance(svc, HttpResponseBase):
        return svc
    return render(
        request,
        "calendar_app/slot_generator.html",
        {
            "buckets_endpoint": "/calendar/buckets/tabla",
            "slots_generar_base": "/calendar/buckets",  # la UI arma: /<bucket>/slots/generar
        },
    )


def clear_events_page(request):
    """
    Renderiza /calendar/ui/limpiar.

    Permite eliminar eventos de Google Calendar de dos formas:
      1) Limpiar todo un calendario
      2) Limpiar solo eventos de un bucket específico
    """
    svc = get_calendar_service_or_redirect(request, calendar_id=getattr(settings, "GOOGLE_CALENDAR_BD_ID", "primary"))
    if isinstance(svc, HttpResponseBase):
        return svc
    return render(
        request,
        "calendar_app/clear_events.html",
        {
            "calendars_limpiar_api": "/calendar/calendars/limpiar",
            "calendars_limpiar_bucket_api": "/calendar/calendars/limpiar-bucket",
        },
    )
