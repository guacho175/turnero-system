from django.contrib import admin
from .models import Bucket


@admin.register(Bucket)
class BucketAdmin(admin.ModelAdmin):
    list_display = ("name", "final_calendar_id", "is_active", "created_at")
    search_fields = ("name", "final_calendar_id")
    list_filter = ("is_active",)
