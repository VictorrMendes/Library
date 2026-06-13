from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("library", "0002_add_dominant_color_rating_mediaerror"),
    ]

    operations = [
        migrations.CreateModel(
            name="EpubFont",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                ("file", models.FileField(upload_to="epub_fonts/")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "library_epub_font",
                "ordering": ["name"],
            },
        ),
    ]
