import os
import requests
from django.conf import settings


def _stirling_url():
    return getattr(settings, 'STIRLING_URL', 'http://stirling-pdf:8080')


def _raise_for_status(response, operation):
    if response.status_code != 200:
        raise RuntimeError(
            f"Stirling-PDF [{operation}] returned HTTP {response.status_code}: "
            f"{response.text[:500]}"
        )


class StirlingClient:
    """
    Client for the Stirling-PDF REST API.

    All methods open the file from disk, POST it to the appropriate endpoint,
    and return the raw response bytes (PDF, EPUB, or ZIP depending on the
    operation).  Timeout is fixed at 300 s to cope with large files / OCR.
    """

    TIMEOUT = 300

    def __init__(self):
        self.base_url = _stirling_url().rstrip('/')

    # ------------------------------------------------------------------ #
    # Internal helpers                                                      #
    # ------------------------------------------------------------------ #

    def _post(self, path, files=None, data=None):
        url = f"{self.base_url}{path}"
        response = requests.post(url, files=files, data=data, timeout=self.TIMEOUT)
        _raise_for_status(response, path)
        return response.content

    @staticmethod
    def _open_file(file_path):
        """Return an open binary file handle.  Caller is responsible for closing."""
        return open(file_path, 'rb')

    # ------------------------------------------------------------------ #
    # Public API                                                            #
    # ------------------------------------------------------------------ #

    def compress(self, file_path, optimize_level=3):
        """Compress a PDF and return the compressed bytes."""
        with self._open_file(file_path) as fh:
            files = [('fileInput', (os.path.basename(file_path), fh, 'application/pdf'))]
            data = {'optimizeLevel': str(optimize_level)}
            return self._post('/api/v1/misc/compress-pdf', files=files, data=data)

    def ocr(self, file_path, languages='por,eng'):
        """Run OCR on a PDF and return the OCR-processed bytes."""
        with self._open_file(file_path) as fh:
            files = [('fileInput', (os.path.basename(file_path), fh, 'application/pdf'))]
            data = {'languages': languages}
            return self._post('/api/v1/misc/ocr-pdf', files=files, data=data)

    def repair(self, file_path):
        """Attempt to repair a corrupted PDF and return the repaired bytes."""
        with self._open_file(file_path) as fh:
            files = [('fileInput', (os.path.basename(file_path), fh, 'application/pdf'))]
            return self._post('/api/v1/misc/repair', files=files)

    def remove_password(self, file_path, password=''):
        """Remove password protection from a PDF and return the unlocked bytes."""
        with self._open_file(file_path) as fh:
            files = [('fileInput', (os.path.basename(file_path), fh, 'application/pdf'))]
            data = {'password': password}
            return self._post('/api/v1/security/remove-password', files=files, data=data)

    def pdf_to_epub(self, file_path):
        """Convert a PDF to EPUB and return the EPUB bytes."""
        with self._open_file(file_path) as fh:
            files = [('fileInput', (os.path.basename(file_path), fh, 'application/pdf'))]
            return self._post('/api/v1/convert/pdf/epub', files=files)

    def merge(self, file_paths):
        """
        Merge multiple PDFs into one and return the merged bytes.

        Stirling-PDF accepts multiple files under the same field name.
        """
        handles = []
        try:
            files = []
            for fp in file_paths:
                fh = open(fp, 'rb')
                handles.append(fh)
                files.append(('fileInput', (os.path.basename(fp), fh, 'application/pdf')))
            return self._post('/api/v1/general/merge-pdfs', files=files)
        finally:
            for fh in handles:
                try:
                    fh.close()
                except Exception:
                    pass

    def split(self, file_path, page_ranges):
        """
        Split a PDF at the given page numbers and return a ZIP of the parts.

        ``page_ranges`` should be a string like ``"1,5,10"``.
        """
        with self._open_file(file_path) as fh:
            files = [('fileInput', (os.path.basename(file_path), fh, 'application/pdf'))]
            data = {'pageNumbers': page_ranges}
            return self._post('/api/v1/general/split-pdf', files=files, data=data)

    def update_metadata(self, file_path, metadata_dict):
        """
        Update PDF metadata fields and return the modified bytes.

        ``metadata_dict`` may contain any of: author, title, subject,
        keywords, producer, creator.
        """
        with self._open_file(file_path) as fh:
            files = [('fileInput', (os.path.basename(file_path), fh, 'application/pdf'))]
            data = {k: v for k, v in metadata_dict.items() if v is not None}
            return self._post('/api/v1/misc/update-metadata', files=files, data=data)

    def extract_images(self, file_path, fmt='png'):
        """Extract all images from a PDF and return them as a ZIP archive."""
        with self._open_file(file_path) as fh:
            files = [('fileInput', (os.path.basename(file_path), fh, 'application/pdf'))]
            data = {'format': fmt}
            return self._post('/api/v1/misc/extract-images', files=files, data=data)
