from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reader', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='annotation',
            name='book_scroll_id',
            field=models.CharField(blank=True, max_length=500),
        ),
    ]
