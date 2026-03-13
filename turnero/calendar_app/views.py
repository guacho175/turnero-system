# calendar_app/views.py
"""
Fachada de vistas de la app calendar_app.

- Mantiene un punto de entrada estable para urls.py
- Las implementaciones reales viven en:
  - calendar_app.web.views (HTML)
  - calendar_app.api.views (JSON)
"""

# UI (HTML)
from calendar_app.web.views import calendar_page as calendar_ui
from calendar_app.web.views import slot_generator_page as slot_generator_ui

