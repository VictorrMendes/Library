from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("collections", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="wanttoread",
            name="status",
            field=models.CharField(
                choices=[
                    ("want_to_read", "Quero Ler"),
                    ("reading", "Estou Lendo"),
                    ("completed", "Lido"),
                    ("liked", "Gostei"),
                    ("dropped", "Abandonei"),
                ],
                default="want_to_read",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="wanttoread",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterModelOptions(
            name="wanttoread",
            options={"ordering": ["-updated_at"]},
        ),
    ]
