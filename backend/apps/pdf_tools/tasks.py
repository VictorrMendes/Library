import io
import os
import logging
import zipfile

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


def _ensure_output_dir():
    """Create the pdf_jobs output directory under MEDIA_ROOT if it does not exist."""
    output_dir = os.path.join(settings.MEDIA_ROOT, 'pdf_jobs')
    os.makedirs(output_dir, exist_ok=True)
    return output_dir


@shared_task(bind=True)
def run_ocr_task(self, job_id):
    """
    Run OCR on the MangaFile associated with a PdfJob.

    Saves the result to MEDIA_ROOT/pdf_jobs/<job_id>.pdf and updates the
    PdfJob status accordingly.
    """
    from apps.pdf_tools.models import PdfJob
    from apps.pdf_tools.services import StirlingClient

    try:
        job = PdfJob.objects.select_related('manga_file').get(pk=job_id)
    except PdfJob.DoesNotExist:
        logger.error("run_ocr_task: PdfJob #%s not found", job_id)
        return

    job.status = 'processing'
    job.save(update_fields=['status', 'updated_at'])

    try:
        file_path = job.manga_file.file_path
        languages = 'por,eng'

        client = StirlingClient()
        result_bytes = client.ocr(file_path, languages=languages)

        output_dir = _ensure_output_dir()
        output_path = os.path.join(output_dir, f'{job_id}.pdf')
        with open(output_path, 'wb') as fh:
            fh.write(result_bytes)

        job.status = 'done'
        job.result_path = output_path
        job.error_message = ''
        job.save(update_fields=['status', 'result_path', 'error_message', 'updated_at'])

    except Exception as exc:
        logger.exception("run_ocr_task: job #%s failed", job_id)
        job.status = 'failed'
        job.error_message = str(exc)
        job.save(update_fields=['status', 'error_message', 'updated_at'])


@shared_task(bind=True)
def run_pdf_to_epub_task(self, job_id):
    """
    Convert the MangaFile associated with a PdfJob from PDF to EPUB.

    Saves the result to MEDIA_ROOT/pdf_jobs/<job_id>.epub and updates the
    PdfJob status accordingly.
    """
    from apps.pdf_tools.models import PdfJob
    from apps.pdf_tools.services import StirlingClient

    try:
        job = PdfJob.objects.select_related('manga_file').get(pk=job_id)
    except PdfJob.DoesNotExist:
        logger.error("run_pdf_to_epub_task: PdfJob #%s not found", job_id)
        return

    job.status = 'processing'
    job.save(update_fields=['status', 'updated_at'])

    try:
        file_path = job.manga_file.file_path

        client = StirlingClient()
        result_bytes = client.pdf_to_epub(file_path)

        output_dir = _ensure_output_dir()
        output_path = os.path.join(output_dir, f'{job_id}.epub')
        with open(output_path, 'wb') as fh:
            fh.write(result_bytes)

        job.status = 'done'
        job.result_path = output_path
        job.error_message = ''
        job.save(update_fields=['status', 'result_path', 'error_message', 'updated_at'])

    except Exception as exc:
        logger.exception("run_pdf_to_epub_task: job #%s failed", job_id)
        job.status = 'failed'
        job.error_message = str(exc)
        job.save(update_fields=['status', 'error_message', 'updated_at'])


@shared_task(bind=True, max_retries=0)
def auto_process_new_pdf(self, manga_file_id):
    """
    Automatically post-process a newly scanned PDF:
      1. Detect text layer via pypdf; set has_text_layer.
      2. If no text layer → OCR via Stirling, replace file in place.
      3. If series has no cover → render first page via Stirling, save as cover.
      4. If file > 10 MB → compress via Stirling, replace in place (only when
         the result is at least 10 % smaller).
    All steps are best-effort; failures are logged but never bubble up.
    """
    from apps.library.models import MangaFile
    from apps.pdf_tools.services import StirlingClient

    try:
        mf = MangaFile.objects.select_related(
            'chapter__volume__series'
        ).get(pk=manga_file_id)
    except MangaFile.DoesNotExist:
        logger.error("auto_process_new_pdf: MangaFile #%s not found", manga_file_id)
        return

    file_path = mf.file_path

    # ── 1. Detect text layer ─────────────────────────────────────────────────
    has_text = None
    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        for page in reader.pages[:5]:
            text = page.extract_text() or ''
            if text.strip():
                has_text = True
                break
        if has_text is None:
            has_text = False
        mf.has_text_layer = has_text
        mf.save(update_fields=['has_text_layer'])
    except Exception as exc:
        logger.warning("auto_process_new_pdf: text-layer check failed for %s: %s", file_path, exc)

    client = StirlingClient()

    # ── 2. Auto-OCR if no text layer ─────────────────────────────────────────
    if has_text is False:
        try:
            result_bytes = client.ocr(file_path, languages='por,eng')
            with open(file_path, 'wb') as fh:
                fh.write(result_bytes)
            mf.has_text_layer = True
            mf.bytes = os.path.getsize(file_path)
            mf.save(update_fields=['has_text_layer', 'bytes'])
            logger.info("auto_process_new_pdf: OCR applied to %s", file_path)
        except Exception as exc:
            logger.warning("auto_process_new_pdf: OCR failed for %s: %s", file_path, exc)

    # ── 3. Auto cover extraction if series has no cover ──────────────────────
    series = mf.chapter.volume.series
    if not series.cover_image:
        try:
            zip_bytes = client.pdf_to_img(file_path, page_num=1, img_format='jpeg', dpi=150)
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                img_name = next(
                    (n for n in zf.namelist() if n.lower().endswith(('.jpg', '.jpeg', '.png'))),
                    None,
                )
                if img_name:
                    from PIL import Image
                    from django.core.files.base import ContentFile
                    img_data = zf.read(img_name)
                    img = Image.open(io.BytesIO(img_data))
                    img.thumbnail((512, 512))
                    buf = io.BytesIO()
                    img.save(buf, format='JPEG', quality=85)
                    series.cover_image.save(
                        f'auto_{series.pk}.jpg',
                        ContentFile(buf.getvalue()),
                        save=True,
                    )
                    logger.info("auto_process_new_pdf: cover set for series #%s", series.pk)
        except Exception as exc:
            logger.warning(
                "auto_process_new_pdf: cover extraction failed for series #%s: %s",
                series.pk, exc,
            )

    # ── 4. Auto-compress if > 10 MB ──────────────────────────────────────────
    try:
        file_size = os.path.getsize(file_path)
    except OSError:
        file_size = 0

    if file_size > 10 * 1024 * 1024:
        try:
            result_bytes = client.compress(file_path, optimize_level=3)
            if len(result_bytes) < file_size * 0.9:
                with open(file_path, 'wb') as fh:
                    fh.write(result_bytes)
                mf.bytes = os.path.getsize(file_path)
                mf.save(update_fields=['bytes'])
                logger.info("auto_process_new_pdf: compressed %s (%.1f MB → %.1f MB)",
                            file_path, file_size / 1e6, mf.bytes / 1e6)
        except Exception as exc:
            logger.warning("auto_process_new_pdf: compression failed for %s: %s", file_path, exc)
