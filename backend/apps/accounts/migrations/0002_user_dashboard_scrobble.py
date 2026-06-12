from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="dashboard_sections",
            field=models.JSONField(
                default=list,
                help_text="Ordered list of section keys visible on dashboard",
            ),
        ),
        migrations.CreateModel(
            name="ScrobbleCredential",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(
                    choices=[("anilist", "AniList"), ("mal", "MyAnimeList")],
                    max_length=20,
                )),
                ("access_token", models.TextField()),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="scrobble_credentials",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "db_table": "accounts_scrobble_credential",
                "unique_together": {("user", "provider")},
            },
        ),
    ]
