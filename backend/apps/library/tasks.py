import os
from celery import shared_task
from django.utils import timezone


@shared_task
def cleanup_orphaned_files():
    """Remove MangaFile records whose physical file no longer exists on disk."""
    from .models import MangaFile, Chapter, Volume, Series, MediaError

    removed = 0
    for mf in MangaFile.objects.all():
        if not os.path.exists(mf.file_path):
            MediaError.objects.get_or_create(
                file_path=mf.file_path,
                defaults={
                    "extension": mf.extension,
                    "error_type": "missing",
                    "details": "Arquivo não encontrado durante cleanup automático.",
                    "series": mf.chapter.volume.series if mf.chapter_id else None,
                },
            )
            mf.delete()
            removed += 1

    # Prune empty chapters / volumes / series
    Chapter.objects.filter(files__isnull=True).delete()
    Volume.objects.filter(chapters__isnull=True).delete()

    return {"removed_files": removed, "timestamp": timezone.now().isoformat()}


@shared_task
def extract_dominant_color(series_id: int):
    """Extract dominant color from a series cover image using Pillow."""
    from .models import Series
    from io import BytesIO

    try:
        series = Series.objects.get(pk=series_id)
        if not series.cover_image:
            return

        with series.cover_image.open("rb") as f:
            img_bytes = f.read()

        from PIL import Image
        img = Image.open(BytesIO(img_bytes)).convert("RGB")
        img = img.resize((150, 150), Image.LANCZOS)

        # Quantize to 8 colors and pick the most saturated non-background one
        quantized = img.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
        palette_rgb = quantized.getpalette()[:8 * 3]
        colors = [
            (palette_rgb[i], palette_rgb[i + 1], palette_rgb[i + 2])
            for i in range(0, len(palette_rgb), 3)
        ]

        import colorsys
        best = None
        best_sat = -1.0
        for r, g, b in colors:
            _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s > best_sat and v > 0.15:
                best_sat = s
                best = (r, g, b)

        if best:
            hex_color = "#{:02x}{:02x}{:02x}".format(*best)
            Series.objects.filter(pk=series_id).update(dominant_color=hex_color)

    except Exception:
        pass
