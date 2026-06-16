import os
import logging

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
