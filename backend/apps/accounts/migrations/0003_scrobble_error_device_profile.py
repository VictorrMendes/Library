from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_user_dashboard_scrobble"),
    ]

    operations = [
        migrations.CreateModel(
            name="ScrobbleError",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(max_length=20, choices=[("anilist", "AniList"), ("mal", "MyAnimeList")])),
                ("series_name", models.CharField(max_length=500)),
                ("anilist_id", models.IntegerField(blank=True, null=True)),
                ("mal_id", models.IntegerField(blank=True, null=True)),
                ("error_message", models.TextField()),
                ("attempted_at", models.DateTimeField(auto_now_add=True)),
                ("retry_count", models.IntegerField(default=0)),
                ("resolved", models.BooleanField(default=False)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="scrobble_errors",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "accounts_scrobble_error",
                "ordering": ["-attempted_at"],
            },
        ),
        migrations.CreateModel(
            name="DeviceProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("device_name", models.CharField(max_length=100)),
                ("reading_direction", models.CharField(blank=True, max_length=20)),
                ("reading_mode", models.CharField(blank=True, max_length=20)),
                ("scaling", models.CharField(blank=True, max_length=20)),
                ("book_font_size", models.IntegerField(blank=True, null=True)),
                ("book_font_family", models.CharField(blank=True, max_length=100)),
                ("book_line_spacing", models.FloatField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="device_profiles",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "accounts_device_profile",
                "ordering": ["device_name"],
                "unique_together": {("user", "device_name")},
            },
        ),
    ]
