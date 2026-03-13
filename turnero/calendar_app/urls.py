from django.urls import path

from calendar_app.web import views as web_views
from calendar_app.api import views as api_views
from calendar_app.servicios.google_auth_web import start_oauth_flow, oauth_callback, oauth_status

urlpatterns = [
    # UI (templates)
    path("", web_views.calendar_page, name="calendar_page"),
    path("ui/slots", web_views.slot_generator_page, name="slot_generator_page"),
    path("ui/limpiar", web_views.clear_events_page, name="clear_events_page"),

    # OAuth web flow
    path("oauth2/start", start_oauth_flow, name="oauth_start"),
    path("oauth2/callback", oauth_callback, name="oauth_callback"),
    path("oauth2/status", oauth_status, name="oauth_status"),

    # API (nuevos endpoints)
    path("buckets/google", api_views.BucketsDesdeGoogleView.as_view(), name="buckets_google"),
    path("buckets/tabla", api_views.BucketsDesdeTablaView.as_view(), name="buckets_tabla"),
    path("buckets/sincronizar", api_views.SyncBucketsView.as_view(), name="buckets_sincronizar"),

    path("buckets/<str:bucket>/slots/generar", api_views.SlotsGenerarView.as_view(), name="slots_generar"),
    path("buckets/<str:bucket>/slots/libres", api_views.SlotsLibresView.as_view(), name="slots_libres"),
    path("buckets/<str:bucket>/slots/<str:event_id>/reservar", api_views.SlotReservarView.as_view(), name="slot_reservar"),

    path("calendars/limpiar", api_views.CalendarioLimpiarView.as_view(), name="calendars_limpiar"),
    path("calendars/limpiar-bucket", api_views.CalendarioLimpiarBucketView.as_view(), name="calendars_limpiar_bucket"),
]
