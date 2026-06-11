import uuid
from pathlib import Path

from django.conf import settings
from rest_framework import generics, permissions, serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import ScanJob, UploadJob
from .tasks import process_upload, scan_all_libraries


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
    library_id = request.data.get("library_id")
    file = request.FILES.get("file")

    if not file or not library_id:
        return Response(
            {"detail": "Os campos 'file' e 'library_id' são obrigatórios."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ext = Path(file.name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(ALLOWED_EXTENSIONS)
        return Response(
            {"detail": f"Formato '{ext}' não suportado. Use: {allowed}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    staging_dir = Path(settings.UPLOADS_ROOT) / "pending" / str(uuid.uuid4())
    staging_dir.mkdir(parents=True, exist_ok=True)

    dest = staging_dir / file.name
    with open(dest, "wb") as f:
        for chunk in file.chunks():
            f.write(chunk)

    job = UploadJob.objects.create(
        library_id=library_id,
        original_filename=file.name,
        temp_path=str(dest),
    )

    process_upload.delay(job.id)

    return Response(
        UploadJobSerializer(job).data,
        status=status.HTTP_202_ACCEPTED,
    )


@api_view(["POST"])
def scan_all(request):
    if not request.user.is_admin:
        return Response(status=status.HTTP_403_FORBIDDEN)
    scan_all_libraries.delay()
    return Response({"detail": "Scan de todas as bibliotecas iniciado."})
