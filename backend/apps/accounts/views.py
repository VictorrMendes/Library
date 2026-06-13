import secrets
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, status, permissions
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    ChangePasswordSerializer,
    UpdatePreferencesSerializer,
    ScrobbleCredentialSerializer,
)
from .models import ApiKey, ScrobbleCredential, ScrobbleError, DeviceProfile

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        is_first = not User.objects.exists()
        user = serializer.save()
        if is_first:
            user.role = "admin"
            user.save(update_fields=["role"])


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        self.request.user.last_active = timezone.now()
        self.request.user.save(update_fields=["last_active"])
        return self.request.user


class ChangePasswordView(generics.GenericAPIView):
    serializer_class = ChangePasswordSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request.user.set_password(
            serializer.validated_data["new_password"]
        )
        request.user.save(update_fields=["password"])
        return Response({"detail": "Senha alterada com sucesso."})


class UpdatePreferencesView(generics.UpdateAPIView):
    serializer_class = UpdatePreferencesSerializer
    http_method_names = ["patch"]

    def get_object(self):
        return self.request.user


# ─── Admin: user management ──────────────────────────────────────────────────

class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        if not self.request.user.is_admin:
            return User.objects.filter(pk=self.request.user.pk)
        return User.objects.all().order_by("username")


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserSerializer
    queryset = User.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        if instance == request.user:
            return Response(
                {"detail": "Não é possível deletar a própria conta."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── API Keys ─────────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
def api_keys(request):
    if request.method == "GET":
        keys = ApiKey.objects.filter(user=request.user, is_active=True)
        data = [
            {"id": k.id, "label": k.label, "created_at": k.created_at}
            for k in keys
        ]
        return Response(data)

    label = request.data.get("label", "OPDS")
    key = ApiKey.objects.create(
        user=request.user,
        key=secrets.token_urlsafe(32),
        label=label,
    )
    return Response(
        {"id": key.id, "key": key.key, "label": key.label},
        status=201,
    )


@api_view(["DELETE"])
def revoke_api_key(request, pk):
    ApiKey.objects.filter(user=request.user, pk=pk).update(
        is_active=False
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Scrobble Credentials ──────────────────────────────────────────────────────

@api_view(["GET", "POST"])
def scrobble_credentials(request):
    if request.method == "GET":
        creds = ScrobbleCredential.objects.filter(user=request.user, is_active=True)
        data = [{"id": c.id, "provider": c.provider, "created_at": c.created_at} for c in creds]
        return Response(data)

    serializer = ScrobbleCredentialSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    provider = serializer.validated_data["provider"]
    ScrobbleCredential.objects.update_or_create(
        user=request.user,
        provider=provider,
        defaults={
            "access_token": serializer.validated_data["access_token"],
            "is_active": True,
        },
    )
    return Response({"detail": "Credencial salva."}, status=201)


@api_view(["DELETE"])
def revoke_scrobble_credential(request, provider):
    ScrobbleCredential.objects.filter(user=request.user, provider=provider).update(is_active=False)
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Device Profiles ─────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
def device_profiles(request):
    if request.method == "GET":
        profiles = DeviceProfile.objects.filter(user=request.user)
        data = [
            {
                "id": p.id,
                "device_name": p.device_name,
                "reading_direction": p.reading_direction,
                "reading_mode": p.reading_mode,
                "scaling": p.scaling,
                "book_font_size": p.book_font_size,
                "book_font_family": p.book_font_family,
                "book_line_spacing": p.book_line_spacing,
                "updated_at": p.updated_at,
            }
            for p in profiles
        ]
        return Response(data)

    device_name = request.data.get("device_name", "").strip()
    if not device_name:
        return Response({"detail": "device_name required."}, status=400)
    profile, _ = DeviceProfile.objects.update_or_create(
        user=request.user,
        device_name=device_name,
        defaults={
            k: v for k, v in {
                "reading_direction": request.data.get("reading_direction", ""),
                "reading_mode": request.data.get("reading_mode", ""),
                "scaling": request.data.get("scaling", ""),
                "book_font_size": request.data.get("book_font_size"),
                "book_font_family": request.data.get("book_font_family", ""),
                "book_line_spacing": request.data.get("book_line_spacing"),
            }.items() if v is not None
        },
    )
    return Response({"id": profile.id, "device_name": profile.device_name}, status=201)


@api_view(["DELETE"])
def delete_device_profile(request, pk):
    DeviceProfile.objects.filter(user=request.user, pk=pk).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Scrobble Errors ─────────────────────────────────────────────────────────

@api_view(["GET"])
def scrobble_errors(request):
    errors = ScrobbleError.objects.filter(user=request.user, resolved=False)[:50]
    data = [
        {
            "id": e.id,
            "provider": e.provider,
            "series_name": e.series_name,
            "error_message": e.error_message,
            "attempted_at": e.attempted_at,
            "retry_count": e.retry_count,
        }
        for e in errors
    ]
    return Response(data)


@api_view(["POST"])
def resolve_scrobble_error(request, pk):
    ScrobbleError.objects.filter(user=request.user, pk=pk).update(resolved=True)
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Backup ──────────────────────────────────────────────────────────────────

@api_view(["GET"])
def backup_database(request):
    if not request.user.is_admin:
        return Response(status=status.HTTP_403_FORBIDDEN)
    import subprocess
    import sys
    from django.conf import settings
    from django.http import HttpResponse
    try:
        result = subprocess.run(
            [
                sys.executable, "manage.py", "dumpdata",
                "--natural-foreign", "--natural-primary", "--indent=2",
                "--exclude=contenttypes", "--exclude=auth.permission",
            ],
            capture_output=True,
            text=True,
            cwd=str(settings.BASE_DIR),
            timeout=120,
        )
        if result.returncode != 0:
            return Response({"detail": result.stderr[:500]}, status=500)
        response = HttpResponse(result.stdout, content_type="application/json")
        response["Content-Disposition"] = (
            'attachment; filename="biblioteca_backup.json"'
        )
        return response
    except Exception as e:
        return Response({"detail": str(e)}, status=500)


# ─── Version check ───────────────────────────────────────────────────────────

@api_view(["GET"])
def check_version(request):
    import urllib.request
    import json as _json
    CURRENT_VERSION = "1.0.0"
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/victorrmendes/biblioteca/releases/latest",
            headers={"Accept": "application/vnd.github.v3+json", "User-Agent": "biblioteca-app"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = _json.loads(resp.read())
        return Response({
            "current_version": CURRENT_VERSION,
            "latest_version": data.get("tag_name", "unknown"),
            "release_url": data.get("html_url", ""),
            "published_at": data.get("published_at", ""),
            "up_to_date": data.get("tag_name", "") == CURRENT_VERSION,
        })
    except Exception:
        return Response({"current_version": CURRENT_VERSION, "latest_version": None})


# ─── Progress export/import ───────────────────────────────────────────────────

@api_view(["GET"])
def export_progress(request):
    from apps.reader.models import ReadingProgress, Bookmark
    from django.http import JsonResponse

    progress = list(
        ReadingProgress.objects.filter(user=request.user).values(
            "series_id", "chapter_id", "pages_read", "last_modified"
        )
    )
    bookmarks = list(
        Bookmark.objects.filter(user=request.user).values(
            "chapter_id", "page", "created_at"
        )
    )

    for item in progress:
        if item.get("last_modified"):
            item["last_modified"] = item["last_modified"].isoformat()
    for item in bookmarks:
        if item.get("created_at"):
            item["created_at"] = item["created_at"].isoformat()

    payload = {
        "version": 1,
        "user": request.user.username,
        "exported_at": timezone.now().isoformat(),
        "progress": progress,
        "bookmarks": bookmarks,
    }

    response = JsonResponse(payload)
    response["Content-Disposition"] = (
        f'attachment; filename="biblioteca_progress_{request.user.username}.json"'
    )
    return response


@api_view(["GET"])
def export_annotations(request):
    from apps.reader.models import Annotation
    from django.http import JsonResponse
    series_id = request.GET.get("series_id")
    qs = Annotation.objects.filter(user=request.user).select_related(
        "chapter__volume__series"
    )
    if series_id:
        qs = qs.filter(chapter__volume__series_id=series_id)
    data = [
        {
            "series": ann.chapter.volume.series.name,
            "chapter_id": ann.chapter_id,
            "book_scroll_id": ann.book_scroll_id,
            "highlighted_text": ann.highlighted_text,
            "note": ann.note,
            "color": ann.color,
            "created_at": ann.created_at.isoformat(),
        }
        for ann in qs
    ]
    payload = {
        "version": 1,
        "user": request.user.username,
        "exported_at": timezone.now().isoformat(),
        "annotations": data,
    }
    response = JsonResponse(payload)
    response["Content-Disposition"] = (
        f'attachment; filename="annotations_{request.user.username}.json"'
    )
    return response
