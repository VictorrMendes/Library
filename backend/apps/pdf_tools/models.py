from django.db import models
from django.conf import settings


class PdfJob(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('done', 'Done'),
        ('failed', 'Failed'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='pdf_jobs',
    )
    manga_file = models.ForeignKey(
        'library.MangaFile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    operation = models.CharField(max_length=50)  # 'ocr', 'pdf_to_epub'
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    result_path = models.CharField(max_length=1000, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pdf_tools_pdfjob'
        ordering = ['-created_at']

    def __str__(self):
        return f"PdfJob #{self.pk} [{self.operation}] — {self.status}"
