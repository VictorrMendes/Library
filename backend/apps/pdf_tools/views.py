import os
import mimetypes

from django.http import HttpResponse, FileResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.library.models import MangaFile
from .models import PdfJob
from .serializers import (
    CompressRequestSerializer,
    MergeRequestSerializer,
    MetadataRequestSerializer,
    OcrRequestSerializer,
    PdfJobSerializer,
    RemovePasswordRequestSerializer,
    SplitRequestSerializer,
)
from .services import StirlingClient
from .tasks import run_ocr_task, run_pdf_to_epub_task


# ------------------------------------------------------------------ #
# Helpers                                                               #
# ------------------------------------------------------------------ #

def _get_pdf_manga_file(manga_file_id):
    """
    Return the MangaFile for the given pk, or raise ValueError if it does
    not exist or is not a PDF.
    """
    try:
        mf = MangaFile.objects.get(pk=manga_file_id)
    except MangaFile.DoesNotExist:
        raise ValueError(f"MangaFile #{manga_file_id} not found.")
    if mf.format != 'pdf':
        raise ValueError(
            f"MangaFile #{manga_file_id} is not a PDF (format={mf.format!r})."
        )
    return mf


def _pdf_response(content_bytes, filename='result.pdf'):
    response = HttpResponse(content_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def _zip_response(content_bytes, filename='result.zip'):
    response = HttpResponse(content_bytes, content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


# ------------------------------------------------------------------ #
# Synchronous views                                                     #
# ------------------------------------------------------------------ #

class CompressView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = CompressRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            mf = _get_pdf_manga_file(ser.validated_data['manga_file_id'])
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = StirlingClient().compress(
                mf.file_path,
                optimize_level=ser.validated_data['optimize_level'],
            )
        except Exception as exc:
            return Response(
                {'detail': f'Stirling-PDF error: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return _pdf_response(result, filename=f'compressed_{os.path.basename(mf.file_path)}')


class RepairView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        manga_file_id = request.data.get('manga_file_id')
        if not manga_file_id:
            return Response({'detail': 'manga_file_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            mf = _get_pdf_manga_file(manga_file_id)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = StirlingClient().repair(mf.file_path)
        except Exception as exc:
            return Response(
                {'detail': f'Stirling-PDF error: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return _pdf_response(result, filename=f'repaired_{os.path.basename(mf.file_path)}')


class RemovePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = RemovePasswordRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            mf = _get_pdf_manga_file(ser.validated_data['manga_file_id'])
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = StirlingClient().remove_password(
                mf.file_path,
                password=ser.validated_data.get('password', ''),
            )
        except Exception as exc:
            return Response(
                {'detail': f'Stirling-PDF error: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return _pdf_response(result, filename=f'unlocked_{os.path.basename(mf.file_path)}')


class MergeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = MergeRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ids = ser.validated_data['manga_file_ids']

        file_paths = []
        for mid in ids:
            try:
                mf = _get_pdf_manga_file(mid)
                file_paths.append(mf.file_path)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = StirlingClient().merge(file_paths)
        except Exception as exc:
            return Response(
                {'detail': f'Stirling-PDF error: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return _pdf_response(result, filename='merged.pdf')


class SplitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = SplitRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            mf = _get_pdf_manga_file(ser.validated_data['manga_file_id'])
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = StirlingClient().split(
                mf.file_path,
                page_ranges=ser.validated_data['page_numbers'],
            )
        except Exception as exc:
            return Response(
                {'detail': f'Stirling-PDF error: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return _zip_response(result, filename=f'split_{os.path.basename(mf.file_path)}.zip')


class UpdateMetadataView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = MetadataRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            mf = _get_pdf_manga_file(ser.validated_data['manga_file_id'])
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        metadata_fields = ('title', 'author', 'subject', 'keywords', 'producer', 'creator')
        metadata = {k: ser.validated_data[k] for k in metadata_fields if k in ser.validated_data}

        try:
            result = StirlingClient().update_metadata(mf.file_path, metadata)
        except Exception as exc:
            return Response(
                {'detail': f'Stirling-PDF error: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return _pdf_response(result, filename=f'meta_{os.path.basename(mf.file_path)}')


class ExtractImagesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        manga_file_id = request.data.get('manga_file_id')
        if not manga_file_id:
            return Response({'detail': 'manga_file_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            mf = _get_pdf_manga_file(manga_file_id)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        fmt = request.data.get('format', 'png')

        try:
            result = StirlingClient().extract_images(mf.file_path, fmt=fmt)
        except Exception as exc:
            return Response(
                {'detail': f'Stirling-PDF error: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return _zip_response(result, filename=f'images_{os.path.basename(mf.file_path)}.zip')


# ------------------------------------------------------------------ #
# Asynchronous views (Celery-backed)                                    #
# ------------------------------------------------------------------ #

class OcrView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = OcrRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            mf = _get_pdf_manga_file(ser.validated_data['manga_file_id'])
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        job = PdfJob.objects.create(
            user=request.user,
            manga_file=mf,
            operation='ocr',
            status='pending',
        )
        run_ocr_task.delay(job.id)

        return Response(
            {'job_id': job.id, 'status': job.status},
            status=status.HTTP_202_ACCEPTED,
        )


class PdfToEpubView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        manga_file_id = request.data.get('manga_file_id')
        if not manga_file_id:
            return Response({'detail': 'manga_file_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            mf = _get_pdf_manga_file(manga_file_id)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        job = PdfJob.objects.create(
            user=request.user,
            manga_file=mf,
            operation='pdf_to_epub',
            status='pending',
        )
        run_pdf_to_epub_task.delay(job.id)

        return Response(
            {'job_id': job.id, 'status': job.status},
            status=status.HTTP_202_ACCEPTED,
        )


# ------------------------------------------------------------------ #
# Job status / download                                                 #
# ------------------------------------------------------------------ #

class JobStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            job = PdfJob.objects.get(pk=pk, user=request.user)
        except PdfJob.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = PdfJobSerializer(job, context={'request': request})
        return Response(serializer.data)


class JobDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            job = PdfJob.objects.get(pk=pk, user=request.user)
        except PdfJob.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if job.status != 'done' or not job.result_path:
            return Response(
                {'detail': 'Result not available yet.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not os.path.isfile(job.result_path):
            return Response(
                {'detail': 'Result file missing on disk.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        content_type, _ = mimetypes.guess_type(job.result_path)
        content_type = content_type or 'application/octet-stream'
        filename = os.path.basename(job.result_path)

        fh = open(job.result_path, 'rb')
        response = FileResponse(fh, content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
