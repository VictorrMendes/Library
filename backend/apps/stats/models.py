from django.db import models
from django.conf import settings


class ReadingHistory(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reading_history"
    )
    series = models.ForeignKey(
        "library.Series", on_delete=models.CASCADE, related_name="reading_history"
    )
    chapter = models.ForeignKey(
        "library.Chapter",
        on_delete=models.SET_NULL,
        null=True,
        related_name="reading_history",
    )
    pages_read = models.IntegerField(default=0)
    read_at = models.DateField()

    class Meta:
        db_table = "stats_reading_history"
        ordering = ["-read_at"]
        indexes = [
            models.Index(fields=["user", "read_at"]),
            models.Index(fields=["user", "series"]),
        ]

    def __str__(self):
        return f"{self.user.username} — {self.series.name} @ {self.read_at}"


class UserStats(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="stats"
    )
    total_pages_read = models.BigIntegerField(default=0)
    total_chapters_read = models.IntegerField(default=0)
    total_series_read = models.IntegerField(default=0)
    total_reading_time_minutes = models.BigIntegerField(default=0)
    last_aggregated = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "stats_user_stats"

    def __str__(self):
        return f"Stats: {self.user.username}"

    @property
    def total_reading_hours(self):
        return round(self.total_reading_time_minutes / 60, 1)
