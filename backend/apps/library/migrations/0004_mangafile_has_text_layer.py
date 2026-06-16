from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("library", "0003_epub_font"),
    ]

    operations = [
        migrations.AddField(
            model_name="mangafile",
            name="has_text_layer",
            field=models.BooleanField(blank=True, null=True),
        ),
    ]
