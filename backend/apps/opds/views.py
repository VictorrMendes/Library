"""
OPDS 1.2 feed for e-reader app discovery.
Supports Bearer (JWT) and HTTP Basic auth.
"""
import base64
from django.http import HttpResponse
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from apps.library.models import Library
from apps.accounts.models import User

OPDS_NS = 'xmlns="http://www.w3.org/2005/Atom"'
DCT_NS = 'xmlns:dc="http://purl.org/dc/terms/"'
OPDS_MT = "application/atom+xml;profile=opds-catalog"
OPDS_IMG = "http://opds-spec.org/image"
OPDS_ACQ = "http://opds-spec.org/acquisition"


def _get_user(request):
    auth = request.META.get("HTTP_AUTHORIZATION", "")
    if auth.startswith("Bearer "):
        from rest_framework_simplejwt.tokens import AccessToken
        try:
            token = AccessToken(auth[7:])
            return User.objects.get(id=token["user_id"])
        except Exception:
            return None
    if auth.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth[6:]).decode()
            username, password = decoded.split(":", 1)
            user = User.objects.get(username=username)
            if user.check_password(password):
                return user
        except Exception:
            pass
    return None


def _xml_response(content: str) -> HttpResponse:
    return HttpResponse(
        f'<?xml version="1.0" encoding="UTF-8"?>\n{content}',
        content_type=f"{OPDS_MT};charset=UTF-8",
    )


def _unauthorized():
    resp = HttpResponse("Unauthorized", status=401)
    resp["WWW-Authenticate"] = 'Basic realm="Biblioteca OPDS"'
    return resp


def _lib_entry(lib, base, opds_mt):
    subsection = f"{opds_mt};kind=navigation"
    return (
        f"\n  <entry>"
        f"\n    <title>{lib.name}</title>"
        f"\n    <id>tag:biblioteca,library:{lib.id}</id>"
        f"\n    <updated>{lib.last_scanned or lib.created_at}</updated>"
        f"\n    <content type=\"text\">"
        f"{lib.series.count()} séries</content>"
        f"\n    <link type=\"{subsection}\" rel=\"subsection\""
        f"\n          href=\"{base}/library/{lib.id}\"/>"
        f"\n  </entry>"
    )


@method_decorator(csrf_exempt, name="dispatch")
class OpdsCatalogView(View):
    def get(self, request):
        user = _get_user(request)
        if not user:
            return _unauthorized()

        base = request.build_absolute_uri("/opds")
        libraries = (
            Library.objects.all()
            if user.is_admin
            else user.libraries.all()
        )
        nav_type = f"{OPDS_MT};kind=navigation"
        updated = (
            libraries.first().created_at
            if libraries.exists()
            else "2024-01-01T00:00:00Z"
        )
        entries = "".join(_lib_entry(lib, base, OPDS_MT) for lib in libraries)

        xml = (
            f"<feed {OPDS_NS} {DCT_NS}>"
            f"\n  <id>tag:biblioteca,opds:root</id>"
            f"\n  <title>Biblioteca</title>"
            f"\n  <updated>{updated}</updated>"
            f"\n  <link type=\"{nav_type}\" rel=\"start\""
            f" href=\"{base}/\"/>"
            f"\n  <link type=\"{nav_type}\" rel=\"self\""
            f" href=\"{base}/\"/>"
            f"{entries}"
            f"\n</feed>"
        )
        return _xml_response(xml)


@method_decorator(csrf_exempt, name="dispatch")
class OpdsLibraryView(View):
    def get(self, request, library_id):
        user = _get_user(request)
        if not user:
            return _unauthorized()

        accessible = (
            Library.objects.all()
            if user.is_admin
            else user.libraries.all()
        )
        try:
            library = accessible.get(id=library_id)
        except Library.DoesNotExist:
            return HttpResponse("Not Found", status=404)

        base = request.build_absolute_uri("/opds")
        series_qs = (
            library.series
            .select_related("metadata")
            .order_by("sort_name")
        )

        entries = ""
        for s in series_qs[:100]:
            cover = (
                request.build_absolute_uri(s.cover_image.url)
                if s.cover_image else ""
            )
            try:
                summary = (s.metadata.summary or "")[:300]
            except Exception:
                summary = ""
            cover_tag = (
                f"\n    <link type=\"image/jpeg\""
                f" rel=\"{OPDS_IMG}\" href=\"{cover}\"/>"
                if cover else ""
            )
            title = s.localized_name or s.name
            dl_href = f"{base}/series/{s.id}/download"
            entries += (
                f"\n  <entry>"
                f"\n    <title>{title}</title>"
                f"\n    <id>tag:biblioteca,series:{s.id}</id>"
                f"\n    <updated>{s.last_modified}</updated>"
                f"\n    <content type=\"text\">{summary}</content>"
                f"{cover_tag}"
                f"\n    <link type=\"application/epub+zip\""
                f" rel=\"{OPDS_ACQ}\""
                f"\n          href=\"{dl_href}\"/>"
                f"\n  </entry>"
            )

        nav_type = f"{OPDS_MT};kind=navigation"
        acq_type = f"{OPDS_MT};kind=acquisition"
        updated = library.last_scanned or library.created_at
        xml = (
            f"<feed {OPDS_NS} {DCT_NS}>"
            f"\n  <id>tag:biblioteca,opds:library:{library_id}</id>"
            f"\n  <title>{library.name}</title>"
            f"\n  <updated>{updated}</updated>"
            f"\n  <link type=\"{nav_type}\" rel=\"start\""
            f" href=\"{base}/\"/>"
            f"\n  <link type=\"{acq_type}\" rel=\"self\""
            f" href=\"{base}/library/{library_id}\"/>"
            f"{entries}"
            f"\n</feed>"
        )
        return _xml_response(xml)
