from django.db import models


class Bucket(models.Model):
    """
    Mapeo persistente:
      bucket (agenda lógica) -> calendar_id FINAL (Google Calendar)
    El calendario BD es único y NO se guarda acá.
    """
    name = models.CharField(max_length=80, unique=True)
    final_calendar_id = models.CharField(max_length=255, unique=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} -> {self.final_calendar_id}"
