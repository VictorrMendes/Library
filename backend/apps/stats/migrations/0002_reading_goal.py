from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("stats", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ReadingGoal",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("period", models.CharField(choices=[("monthly", "Mensal"), ("yearly", "Anual")], max_length=10)),
                ("metric", models.CharField(choices=[("pages", "Páginas"), ("chapters", "Capítulos")], max_length=10)),
                ("target", models.IntegerField()),
                ("year", models.IntegerField()),
                ("month", models.IntegerField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reading_goals",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "stats_reading_goal"},
        ),
        migrations.AlterUniqueTogether(
            name="readinggoal",
            unique_together={("user", "period", "metric", "year", "month")},
        ),
    ]
