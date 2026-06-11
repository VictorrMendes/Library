from django.db import models
from django.conf import settings


class ReadingProgress(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="progress"
    )
    chapter = models.ForeignKey(
        "library.Chapter", on_delete=models.CASCADE, related_name="progress"
    )
    series = models.ForeignKey(
        "library.Series", on_delete=models.CASCADE, related_name="progress"
    )
    library = models.ForeignKey(
        "library.Library", on_delete=models.CASCADE, related_name="progress"
    )
    pages_read = models.IntegerField(default=0)
    # For EPUB: CSS anchor ID of last position
    book_scroll_id = models.CharField(max_length=500, blank=True)
    total_reads = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reader_progress"
        unique_together = [("user", "chapter")]
        indexes = [
            models.Index(fields=["user", "series"]),
            models.Index(fields=["user", "library"]),
        ]

    def __str__(self):
        return f"{self.user.username} — Ch.{self.chapter_id} ({self.pages_read}p)"

    @property
    def is_completed(self):
        return self.pages_read >= self.chapter.pages


class ReadingSession(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reading_sessions"
    )
    series = models.ForeignKey(
        "library.Series", on_delete=models.CASCADE, related_name="reading_sessions"
    )
    chapter = models.ForeignKey(
        "library.Chapter", on_delete=models.CASCADE, related_name="reading_sessions"
    )
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    pages_read = models.IntegerField(default=0)

    class Meta:
        db_table = "reader_session"
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.user.username} — {self.series.name} @ {self.started_at:%Y-%m-%d %H:%M}"

    @property
    def duration_minutes(self):
        if self.ended_at:
            return int((self.ended_at - self.started_at).total_seconds() / 60)
        return 0


class Bookmark(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookmarks"
    )
    chapter = models.ForeignKey(
        "library.Chapter", on_delete=models.CASCADE, related_name="bookmarks"
    )
    page = models.IntegerField(default=0)
    # For EPUB bookmarks
    book_scroll_id = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reader_bookmark"
        unique_together = [("user", "chapter", "page")]
        ordering = ["chapter", "page"]

    def __str__(self):
        return f"{self.user.username} — Ch.{self.chapter_id} p.{self.page}"


class Annotation(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="annotations"
    )
    chapter = models.ForeignKey(
        "library.Chapter", on_delete=models.CASCADE, related_name="annotations"
    )
    # EPUB-only: selected text anchor
    book_scroll_id = models.CharField(max_length=500)
    highlighted_text = models.TextField(blank=True)
    note = models.TextField(blank=True)
    color = models.CharField(max_length=7, default="#facc15")
    created_at = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reader_annotation"
        ordering = ["book_scroll_id"]

    def __str__(self):
        return f"{self.user.username} — note on Ch.{self.chapter_id}"
