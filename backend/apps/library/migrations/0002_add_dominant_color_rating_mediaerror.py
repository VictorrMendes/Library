from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("library", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # dominant_color on Series
        migrations.AddField(
            model_name="series",
            name="dominant_color",
            field=models.CharField(blank=True, max_length=7),
        ),
        # SeriesRating model
        migrations.CreateModel(
            name="SeriesRating",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("score", models.FloatField()),
                ("review", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "series",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ratings",
                        to="library.series",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="series_ratings",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "library_series_rating",
                "ordering": ["-created_at"],
                "unique_together": {("series", "user")},
            },
        ),
        # MediaError model
        migrations.CreateModel(
            name="MediaError",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file_path", models.TextField()),
                ("extension", models.CharField(blank=True, max_length=20)),
                (
                    "error_type",
                    models.CharField(
                        choices=[
                            ("corrupt", "Arquivo Corrompido"),
                            ("missing", "Arquivo Ausente"),
                            ("unreadable", "Não Legível"),
                            ("other", "Outro"),
                        ],
                        default="other",
                        max_length=20,
                    ),
                ),
                ("details", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("resolved", models.BooleanField(default=False)),
                (
                    "series",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="media_errors",
                        to="library.series",
                    ),
                ),
            ],
            options={
                "db_table": "library_media_error",
                "ordering": ["-created_at"],
            },
        ),
    ]
