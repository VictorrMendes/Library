import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="VocabularyEntry",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("word", models.CharField(max_length=200)),
                ("translation", models.CharField(max_length=500)),
                ("phonetic", models.CharField(blank=True, max_length=100)),
                ("definition", models.CharField(blank=True, max_length=1000)),
                ("example", models.CharField(blank=True, max_length=1000)),
                ("context_sentence", models.TextField(blank=True)),
                ("source_series_name", models.CharField(blank=True, max_length=300)),
                ("direction", models.CharField(default="en-pt", max_length=10)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("new", "New"),
                            ("learning", "Learning"),
                            ("known", "Known"),
                        ],
                        default="new",
                        max_length=20,
                    ),
                ),
                ("review_count", models.IntegerField(default=0)),
                ("ease_factor", models.FloatField(default=2.5)),
                ("interval_days", models.IntegerField(default=1)),
                ("next_review_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_reviewed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="vocabulary",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "unique_together": {("user", "word", "direction")},
            },
        ),
    ]
