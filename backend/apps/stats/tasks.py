from celery import shared_task
from django.utils import timezone


@shared_task
def aggregate_reading_stats():
    from django.contrib.auth import get_user_model
    from apps.reader.models import ReadingProgress, ReadingSession
    from .models import UserStats, ReadingHistory

    User = get_user_model()
    today = timezone.now().date()

    for user in User.objects.all():
        stats, _ = UserStats.objects.get_or_create(user=user)

        progress_qs = ReadingProgress.objects.filter(user=user)
        stats.total_pages_read = sum(p.pages_read for p in progress_qs)
        stats.total_chapters_read = progress_qs.filter(pages_read__gt=0).count()
        stats.total_series_read = progress_qs.filter(pages_read__gt=0).values("series").distinct().count()

        sessions = ReadingSession.objects.filter(user=user, ended_at__isnull=False)
        stats.total_reading_time_minutes = sum(s.duration_minutes for s in sessions)
        stats.last_aggregated = timezone.now()
        stats.save()
