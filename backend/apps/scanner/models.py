from django.db import models


class UploadJob(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        PROCESSING = "processing", "Processando"
        COMPLETED = "completed", "Concluído"
        FAILED = "failed", "Falhou"

    library = models.ForeignKey(
        "library.Library",
        on_delete=models.CASCADE,
        related_name="upload_jobs",
    )
    original_filename = models.CharField(max_length=500)
    temp_path = models.TextField()
    target_path = models.TextField(blank=True)
    series_name = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    error_message = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "scanner_upload_job"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"Upload [{self.original_filename}] — {self.status}"


class ScanJob(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        RUNNING = "running", "Executando"
        COMPLETED = "completed", "Concluído"
        FAILED = "failed", "Falhou"

    library = models.ForeignKey(
        "library.Library",
        on_delete=models.CASCADE,
        related_name="scan_jobs",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    celery_task_id = models.CharField(max_length=255, blank=True)
    files_added = models.IntegerField(default=0)
    files_removed = models.IntegerField(default=0)
    files_updated = models.IntegerField(default=0)
    error_message = models.TextField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "scanner_scan_job"
        ordering = ["-created_at"]

    def __str__(self):
        lib = self.library.name if self.library else "All"
        return f"Scan [{lib}] — {self.status} @ {self.created_at:%Y-%m-%d %H:%M}"

    @property
    def duration_seconds(self):
        if self.started_at and self.finished_at:
            return int((self.finished_at - self.started_at).total_seconds())
        return None
