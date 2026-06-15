from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class VocabularyEntry(models.Model):
    STATUS_CHOICES = [
        ("new", "New"),
        ("learning", "Learning"),
        ("known", "Known"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="vocabulary")
    word = models.CharField(max_length=200)
    translation = models.CharField(max_length=500)
    phonetic = models.CharField(max_length=100, blank=True)
    definition = models.CharField(max_length=1000, blank=True)
    example = models.CharField(max_length=1000, blank=True)
    context_sentence = models.TextField(blank=True)  # the sentence where word appeared
    source_series_name = models.CharField(max_length=300, blank=True)
    direction = models.CharField(max_length=10, default="en-pt")  # en-pt or pt-en
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="new")
    review_count = models.IntegerField(default=0)
    ease_factor = models.FloatField(default=2.5)  # SM-2 ease factor
    interval_days = models.IntegerField(default=1)  # SM-2 interval
    next_review_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("user", "word", "direction")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.username}: {self.word}"
