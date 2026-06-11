from django.db import models
from django.conf import settings


class Collection(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="collections"
    )
    title = models.CharField(max_length=255)
    summary = models.TextField(blank=True)
    cover_image = models.ImageField(upload_to="collection_covers/", blank=True, null=True)
    is_promoted = models.BooleanField(default=False)
    series = models.ManyToManyField(
        "library.Series", blank=True, related_name="collections"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "collections_collection"
        ordering = ["title"]

    def __str__(self):
        return self.title


class ReadingList(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reading_lists"
    )
    title = models.CharField(max_length=255)
    summary = models.TextField(blank=True)
    cover_image = models.ImageField(upload_to="readinglist_covers/", blank=True, null=True)
    is_promoted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "collections_reading_list"
        ordering = ["title"]

    def __str__(self):
        return self.title


class ReadingListItem(models.Model):
    reading_list = models.ForeignKey(
        ReadingList, on_delete=models.CASCADE, related_name="items"
    )
    chapter = models.ForeignKey(
        "library.Chapter", on_delete=models.CASCADE, related_name="reading_list_items"
    )
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "collections_reading_list_item"
        ordering = ["order"]
        unique_together = [("reading_list", "chapter")]

    def __str__(self):
        return f"{self.reading_list.title} #{self.order}"


class WantToRead(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="want_to_read"
    )
    series = models.ForeignKey(
        "library.Series", on_delete=models.CASCADE, related_name="want_to_read"
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "collections_want_to_read"
        unique_together = [("user", "series")]
        ordering = ["-added_at"]

    def __str__(self):
        return f"{self.user.username} → {self.series.name}"


class SmartFilter(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="smart_filters"
    )
    name = models.CharField(max_length=255)
    # JSON with filter criteria: genres, tags, status, age_rating, etc.
    criteria = models.JSONField(default=dict)
    sort_by = models.CharField(max_length=50, default="sort_name")
    sort_asc = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "collections_smart_filter"
        ordering = ["name"]

    def __str__(self):
        return f"{self.owner.username} — {self.name}"
