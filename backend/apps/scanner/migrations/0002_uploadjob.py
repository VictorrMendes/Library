from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("library", "0001_initial"),
        ("scanner", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="UploadJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("original_filename", models.CharField(max_length=500)),
                ("temp_path", models.TextField()),
                ("target_path", models.TextField(blank=True)),
                ("series_name", models.CharField(blank=True, max_length=500)),
                ("status", models.CharField(
                    choices=[
                        ("pending", "Pendente"),
                        ("processing", "Processando"),
                        ("completed", "Concluído"),
                        ("failed", "Falhou"),
                    ],
                    default="pending",
                    max_length=20,
                )),
                ("error_message", models.TextField(blank=True)),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("library", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="upload_jobs",
                    to="library.library",
                )),
            ],
            options={"db_table": "scanner_upload_job", "ordering": ["-uploaded_at"]},
        ),
    ]
