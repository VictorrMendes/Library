import re
import shutil
import uuid
from pathlib import Path

from django.conf import settings
from django.utils import timezone
from rest_framework import generics, permissions, serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import ScanJob, UploadJob
from .tasks import (
    _parse_comicinfo,
    _sanitize_dirname,
    _series_name_from_epub,
    _series_name_from_filename,
    scan_all_libraries,
    scan_library,
)


class ScanJobSerializer(serializers.ModelSerializer):
    duration_seconds = serializers.IntegerField(read_only=True)

    class Meta:
        model = ScanJob
        fields = [
            "id", "library_id", "status", "files_added",
            "files_removed", "files_updated", "error_message",
            "started_at", "finished_at", "created_at", "duration_seconds",
        ]


class UploadJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = UploadJob
        fields = [
            "id", "library_id", "original_filename",
            "series_name", "target_path", "status",
            "error_message", "uploaded_at", "processed_at",
        ]


class ScanJobListView(generics.ListAPIView):
    serializer_class = ScanJobSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ScanJob.objects.order_by("-created_at")
        library_id = self.request.query_params.get("library_id")
        if library_id:
            qs = qs.filter(library_id=library_id)
        return qs[:50]


class UploadJobListView(generics.ListAPIView):
    serializer_class = UploadJobSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return UploadJob.objects.order_by("-uploaded_at")[:100]


class UploadJobDetailView(generics.RetrieveAPIView):
    serializer_class = UploadJobSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = UploadJob.objects.all()


ALLOWED_EXTENSIONS = {".cbz", ".cbr", ".cb7", ".zip", ".epub", ".pdf"}


@api_view(["POST"])
def upload_file(request):
    from apps.library.models import Library

    library_id = request.data.get("library_id")
    file = request.FILES.get("file")

    if not file or not library_id:
        return Response(
            {"detail": "Os campos 'file' e 'library_id' são obrigatórios."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ext = Path(file.name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        return Response(
            {"detail": f"Formato '{ext}' não suportado. Use: {allowed}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        library = Library.objects.get(pk=library_id)
    except Library.DoesNotExist:
        return Response({"detail": "Biblioteca não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    if not library.folder_paths:
        return Response(
            {"detail": "Biblioteca sem pasta configurada. Configure uma pasta antes de enviar arquivos."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ── Save uploaded file to staging area ────────────────────────────────────
    staging_dir = Path(settings.UPLOADS_ROOT) / "pending" / str(uuid.uuid4())
    staging_dir.mkdir(parents=True, exist_ok=True)
    dest = staging_dir / file.name
    with open(dest, "wb") as f:
        for chunk in file.chunks():
            f.write(chunk)

    job = UploadJob.objects.create(
        library=library,
        original_filename=file.name,
        temp_path=str(dest),
        status=UploadJob.Status.PROCESSING,
    )

    # ── Process synchronously (file move is fast; only scan is async) ─────────
    try:
        series_name = None
        if ext in (".cbz", ".cbr", ".zip", ".cb7"):
            info = _parse_comicinfo(str(dest))
            series_name = info.get("title") or info.get("Series")
        if ext == ".epub":
            series_name = _series_name_from_epub(str(dest))
        if not series_name:
            series_name = _series_name_from_filename(dest.name)

        safe_series = _sanitize_dirname(series_name)
        base = Path(library.folder_paths[0])
        target_dir = base / safe_series
        target_dir.mkdir(parents=True, exist_ok=True)

        safe_filename = re.sub(r"[\x00/\\]", "_", dest.name)
        target = target_dir / safe_filename
        if target.exists():
            stem, suffix = Path(safe_filename).stem, Path(safe_filename).suffix
            counter = 1
            while target.exists():
                target = target_dir / f"{stem}_{counter}{suffix}"
                counter += 1

        shutil.move(str(dest), str(target))
        try:
            dest.parent.rmdir()
        except Exception:
            pass

        job.status = UploadJob.Status.COMPLETED
        job.target_path = str(target)
        job.series_name = series_name
        job.processed_at = timezone.now()
        job.save()

        scan_library.delay(library.id)

    except Exception as exc:
        job.status = UploadJob.Status.FAILED
        job.error_message = str(exc)
        job.processed_at = timezone.now()
        job.save()

    return Response(UploadJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


@api_view(["POST"])
def scan_all(request):
    if not request.user.is_admin:
        return Response(status=status.HTTP_403_FORBIDDEN)
    scan_all_libraries.delay()
    return Response({"detail": "Scan de todas as bibliotecas iniciado."})
