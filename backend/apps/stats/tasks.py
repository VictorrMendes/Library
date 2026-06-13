from celery import shared_task
from django.utils import timezone


@shared_task
def retry_scrobble_errors():
    """Retry unresolved scrobble errors (up to 3 times)."""
    from apps.accounts.models import ScrobbleError, ScrobbleCredential
    errors = ScrobbleError.objects.filter(resolved=False, retry_count__lt=3)
    for err in errors:
        creds = {
            c.provider: c.access_token
            for c in ScrobbleCredential.objects.filter(user=err.user, is_active=True)
        }
        token = creds.get(err.provider)
        if not token:
            continue
        try:
            import urllib.request
            import json as _json
            if err.provider == "anilist" and err.anilist_id:
                mutation = "mutation ($id: Int, $p: Int) { SaveMediaListEntry(mediaId: $id, progress: $p) { id } }"
                payload = _json.dumps({"query": mutation, "variables": {"id": err.anilist_id, "p": 1}}).encode()
                req = urllib.request.Request(
                    "https://graphql.anilist.co",
                    data=payload,
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
                    method="POST",
                )
                urllib.request.urlopen(req, timeout=10)
                err.resolved = True
                err.save(update_fields=["resolved"])
        except Exception:
            err.retry_count += 1
            err.save(update_fields=["retry_count"])


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
