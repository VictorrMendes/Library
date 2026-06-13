import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("biblioteca")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "scan-all-libraries-daily": {
        "task": "apps.scanner.tasks.scan_all_libraries",
        "schedule": crontab(hour=3, minute=0),
    },
    "aggregate-stats-daily": {
        "task": "apps.stats.tasks.aggregate_reading_stats",
        "schedule": crontab(hour=4, minute=0),
    },
    "cleanup-db-weekly": {
        "task": "apps.library.tasks.cleanup_orphaned_files",
        "schedule": crontab(day_of_week=0, hour=2, minute=0),
    },
    "retry-scrobble-errors-hourly": {
        "task": "apps.stats.tasks.retry_scrobble_errors",
        "schedule": crontab(minute=30),
    },
}
