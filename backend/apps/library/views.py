from rest_framework import viewsets, filters, permissions
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as df
from django.db.models import Subquery, OuterRef, Sum, IntegerField, Value, F
from django.db.models.functions import Coalesce
from .models import (
    Library, Series, SeriesRelation, Volume, Chapter,
    Genre, Tag, Person, SeriesRating, MediaError, EpubFont,
)
from .serializers import (
    LibrarySerializer,
    SeriesListSerializer,
    SeriesDetailSerializer,
    SeriesMetadataSerializer,
    SeriesRelationSerializer,
    VolumeSerializer,
    ChapterSerializer,
    GenreSerializer,
    TagSerializer,
    PersonSerializer,
    PersonDetailSerializer,
    SeriesRatingSerializer,
    MediaErrorSerializer,
)


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "admin"


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.role == "admin"


class LibraryViewSet(viewsets.ModelViewSet):
    serializer_class = LibrarySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Library.objects.all()

    def perform_create(self, serializer):
        import re
        from pathlib import Path
        from django.conf import settings

        folder_paths = serializer.validated_data.get("folder_paths", [])
        if not folder_paths:
            name = serializer.validated_data.get("name", "biblioteca")
            safe = re.sub(r"[^\w\s-]", "", name, flags=re.UNICODE).strip()
            safe = re.sub(r"[\s]+", "_", safe).lower()
            safe = safe or "biblioteca"
            auto_path = Path(settings.LIBRARY_ROOT) / safe
            auto_path.mkdir(parents=True, exist_ok=True)
            serializer.save(folder_paths=[str(auto_path)])
        else:
            serializer.save()

    @action(detail=True, methods=["post"])
    def scan(self, request, pk=None):
        if request.user.role != "admin":
            return Response(
                {"detail": "Apenas administradores podem iniciar scans."},
                status=403,
            )
        from apps.scanner.tasks import scan_library
        library = self.get_object()
        task = scan_library.delay(library.id)
        return Response({"task_id": task.id, "detail": "Scan iniciado."})


class SeriesFilter(df.FilterSet):
    library = df.NumberFilter(field_name="library_id")
    genre = df.CharFilter(
        field_name="metadata__genres__normalized", lookup_expr="icontains"
    )
    tag = df.CharFilter(
        field_name="metadata__tags__normalized", lookup_expr="icontains"
    )
    status = df.CharFilter(field_name="metadata__publication_status")
    language = df.CharFilter(field_name="metadata__language")
    year = df.NumberFilter(field_name="metadata__release_year")
    reading_status = df.CharFilter(method="filter_reading_status")

    class Meta:
        model = Series
        fields = [
            "library", "genre", "tag", "status",
            "language", "year", "reading_status",
        ]

    def filter_reading_status(self, queryset, name, value):
        if value == "in_progress":
            return queryset.filter(
                user_pages_read__gt=0, user_pages_read__lt=F("pages")
            )
        elif value == "completed":
            return queryset.filter(
                user_pages_read__gte=F("pages"), pages__gt=0
            )
        elif value == "not_started":
            return queryset.filter(user_pages_read=0)
        return queryset


class SeriesViewSet(viewsets.ModelViewSet):
    filter_backends = [
        DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter
    ]
    filterset_class = SeriesFilter
    search_fields = [
        "name", "localized_name", "original_name", "metadata__summary"
    ]
    ordering_fields = ["sort_name", "created_at", "last_modified", "pages"]
    ordering = ["sort_name"]

    def get_queryset(self):
        from apps.reader.models import ReadingProgress
        user = self.request.user
        accessible = Library.objects.all()
        user_progress_sq = (
            ReadingProgress.objects
            .filter(user=user, series=OuterRef("pk"))
            .values("series")
            .annotate(total=Sum("pages_read"))
            .values("total")
        )
        qs = (
            Series.objects.filter(library__in=accessible)
            .select_related("metadata")
            .prefetch_related(
                "metadata__genres", "metadata__tags", "metadata__people",
                "relations__target",
            )
            .annotate(
                user_pages_read=Coalesce(
                    Subquery(
                        user_progress_sq, output_field=IntegerField()
                    ),
                    Value(0),
                )
            )
        )
        # Age restriction: filter out series above the user's configured limit
        if user.age_restriction and user.age_restriction > 0:
            if user.age_restriction_include_unknowns:
                qs = qs.filter(metadata__age_rating__lte=user.age_restriction)
            else:
                qs = qs.filter(
                    metadata__age_rating__gt=0,
                    metadata__age_rating__lte=user.age_restriction,
                )
        return qs

    def get_serializer_class(self):
        if self.action == "retrieve":
            return SeriesDetailSerializer
        return SeriesListSerializer

    @action(detail=True, methods=["get"])
    def volumes(self, request, pk=None):
        series = self.get_object()
        volumes = series.volumes.prefetch_related(
            "chapters__files"
        ).order_by("min_number")
        return Response(VolumeSerializer(volumes, many=True).data)

    @action(detail=True, methods=["patch"], url_path="metadata")
    def update_metadata(self, request, pk=None):
        series = self.get_object()
        serializer = SeriesMetadataSerializer(
            series.metadata, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(
        detail=True, methods=["post"], url_path="scan"
    )
    def scan(self, request, pk=None):
        from apps.scanner.tasks import scan_series
        series = self.get_object()
        task = scan_series.delay(series.id)
        return Response({"task_id": task.id, "detail": "Scan iniciado."})

    @action(detail=True, methods=["get"], url_path="fetch-metadata")
    def fetch_metadata(self, request, pk=None):
        import json as _json
        import urllib.request
        import urllib.parse
        series = self.get_object()
        title = series.name
        library_type = series.library.type if series.library else "manga"
        result = {"sources": []}

        def _get(url, params=None, timeout=8):
            if params:
                url = f"{url}?{urllib.parse.urlencode(params)}"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Biblioteca/1.0"})
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    return _json.loads(r.read())
            except Exception:
                return None

        def _post_json(url, payload, timeout=8):
            data = _json.dumps(payload).encode()
            try:
                req = urllib.request.Request(
                    url, data=data,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    return _json.loads(r.read())
            except Exception:
                return None

        # ── AniList (manga / manhwa / comic) ────────────────────────────────────
        if library_type in ("manga", "comic", "image"):
            al_query = """
            query ($search: String) {
              Media(search: $search, type: MANGA) {
                id title { romaji english }
                description(asHtml: false)
                genres
                tags { name rank isMediaSpoiler }
                averageScore popularity status
                staff(perPage: 8) { edges { role node { name { full } } } }
                startDate { year }
                coverImage { large medium }
              }
            }
            """
            al = _post_json("https://graphql.anilist.co", {"query": al_query, "variables": {"search": title}})
            media = (al or {}).get("data", {}).get("Media")
            if media:
                desc = (media.get("description") or "")
                for tag in ("<br>", "<br/>", "<i>", "</i>", "<b>", "</b>"):
                    desc = desc.replace(tag, " " if tag == "<br>" or tag == "<br/>" else "")
                result["summary"] = desc.strip()
                result["genres"] = media.get("genres", [])
                result["tags"] = [
                    t["name"] for t in (media.get("tags") or [])
                    if not t.get("isMediaSpoiler") and t.get("rank", 0) >= 60
                ]
                result["anilist_id"] = media["id"]
                result["anilist_score"] = media.get("averageScore")
                result["anilist_popularity"] = media.get("popularity")
                status_map = {
                    "FINISHED": "completed", "RELEASING": "ongoing",
                    "NOT_YET_RELEASED": "ongoing", "CANCELLED": "cancelled", "HIATUS": "hiatus",
                }
                result["publication_status"] = status_map.get(media.get("status", ""), "unknown")
                if (media.get("startDate") or {}).get("year"):
                    result["release_year"] = media["startDate"]["year"]
                result["authors"] = [
                    {"name": e["node"]["name"]["full"], "role": "writer" if "Story" in (e.get("role") or "") else "penciller"}
                    for e in ((media.get("staff") or {}).get("edges") or [])
                    if (e.get("role") or "") in ("Story", "Art", "Story & Art", "Story & Art (by volume)")
                ]
                cover = media.get("coverImage") or {}
                result["cover_url"] = cover.get("large") or cover.get("medium") or ""
                result["sources"].append("anilist")

        # ── Google Books (books / light novels / fallback) ──────────────────────
        if not result.get("summary") or library_type in ("book", "light_novel"):
            gb = _get(
                "https://www.googleapis.com/books/v1/volumes",
                params={"q": title, "maxResults": 3, "printType": "books"},
            )
            if gb:
                items = gb.get("items", [])
                if items:
                    vi = items[0]["volumeInfo"]
                    if not result.get("summary"):
                        result["summary"] = vi.get("description", "")
                    if not result.get("language"):
                        result["language"] = vi.get("language", "")
                    if not result.get("release_year"):
                        yr = vi.get("publishedDate", "")[:4]
                        result["release_year"] = int(yr) if yr.isdigit() else None
                    if not result.get("genres"):
                        result["genres"] = vi.get("categories", [])
                    if not result.get("authors"):
                        result["authors"] = [{"name": a, "role": "writer"} for a in vi.get("authors", [])]
                    if not result.get("publisher"):
                        result["publisher"] = vi.get("publisher", "")
                    if not result.get("cover_url"):
                        img = vi.get("imageLinks") or {}
                        result["cover_url"] = img.get("thumbnail", "").replace("http://", "https://")
                    isbn_list = vi.get("industryIdentifiers", [])
                    result.setdefault("isbn", next(
                        (i["identifier"] for i in isbn_list if i["type"] == "ISBN_13"), ""
                    ))
                    result["sources"].append("google_books")

        # ── Open Library (fallback) ──────────────────────────────────────────────
        if not result.get("summary"):
            ol = _get(
                "https://openlibrary.org/search.json",
                params={"title": title, "limit": 1,
                        "fields": "key,title,author_name,first_publish_year,publisher,subject,language"},
            )
            if ol:
                docs = ol.get("docs", [])
                if docs:
                    d = docs[0]
                    if not result.get("authors"):
                        result["authors"] = [{"name": a, "role": "writer"} for a in d.get("author_name", [])]
                    if not result.get("release_year"):
                        result["release_year"] = d.get("first_publish_year")
                    if not result.get("publisher"):
                        pubs = d.get("publisher", [])
                        result["publisher"] = pubs[0] if pubs else ""
                    if not result.get("genres"):
                        result["genres"] = (d.get("subject") or [])[:10]
                    langs = d.get("language", [])
                    if not result.get("language") and langs:
                        result["language"] = langs[0]
                    result["sources"].append("open_library")

        return Response(result)

    @action(detail=True, methods=["post"], url_path="apply-metadata")
    def apply_metadata(self, request, pk=None):
        """Persist fetched metadata (genres, authors, tags, fields) to the database."""
        from .models import SeriesMetadata as SM
        series = self.get_object()
        d = request.data

        meta, _ = SM.objects.get_or_create(series=series)

        if d.get("summary") and not meta.summary_locked:
            meta.summary = d["summary"]
        if d.get("language") and not meta.language_locked:
            meta.language = d["language"]
        if d.get("release_year") and not meta.release_year_locked:
            meta.release_year = int(d["release_year"])
        if d.get("publisher"):
            meta.publisher = d["publisher"]
        if d.get("publication_status") and not meta.publication_status_locked:
            meta.publication_status = d["publication_status"]
        meta.save()

        if d.get("genres") and not meta.genres_locked:
            for name in (d["genres"] or [])[:15]:
                if not name or not str(name).strip():
                    continue
                genre, _ = Genre.objects.get_or_create(name=str(name).strip())
                meta.genres.add(genre)

        if d.get("tags"):
            for name in (d["tags"] or [])[:25]:
                if not name or not str(name).strip():
                    continue
                tag, _ = Tag.objects.get_or_create(name=str(name).strip())
                meta.tags.add(tag)

        if d.get("authors") and not meta.people_locked:
            for author in (d["authors"] or [])[:10]:
                if isinstance(author, dict):
                    name = (author.get("name") or "").strip()
                    role = author.get("role") or "writer"
                else:
                    name = str(author).strip()
                    role = "writer"
                if not name:
                    continue
                person, _ = Person.objects.get_or_create(
                    normalized=name.lower(),
                    role=role,
                    defaults={"name": name},
                )
                meta.people.add(person)

        if d.get("anilist_id") and not series.anilist_id:
            series.anilist_id = int(d["anilist_id"])
            series.save(update_fields=["anilist_id"])

        return Response({"ok": True})

    @action(detail=True, methods=["get", "post"], url_path="relations")
    def relations(self, request, pk=None):
        series = self.get_object()
        if request.method == "GET":
            rels = series.relations.select_related("target")
            return Response(SeriesRelationSerializer(rels, many=True, context={"request": request}).data)
        # POST — create relation
        serializer = SeriesRelationSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        try:
            rel = SeriesRelation.objects.create(
                series=series,
                target_id=serializer.validated_data["target_id"],
                relation_type=serializer.validated_data["relation_type"],
            )
        except Exception as e:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(str(e))
        return Response(SeriesRelationSerializer(rel, context={"request": request}).data, status=201)

    @action(detail=True, methods=["delete"], url_path=r"relations/(?P<relation_id>\d+)")
    def delete_relation(self, request, pk=None, relation_id=None):
        series = self.get_object()
        SeriesRelation.objects.filter(series=series, pk=relation_id).delete()
        return Response(status=204)

    @action(
        detail=True, methods=["post"], url_path="cover",
        parser_classes=[MultiPartParser],
    )
    def upload_cover(self, request, pk=None):
        series = self.get_object()
        cover = request.FILES.get("cover")
        if not cover:
            return Response(
                {"detail": "Arquivo não enviado."}, status=400
            )
        series.cover_image.delete(save=False)
        series.cover_image = cover
        series.save(update_fields=["cover_image"])
        return Response({"cover_image": request.build_absolute_uri(
            series.cover_image.url
        )})

    @action(detail=True, methods=["get"], url_path="anilist-metadata")
    def anilist_metadata(self, request, pk=None):
        series = self.get_object()
        if not series.anilist_id:
            return Response({"detail": "Nenhum ID AniList configurado."}, status=400)
        try:
            data = _fetch_anilist(series.anilist_id)
            return Response(data)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=503)


class VolumeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = VolumeSerializer

    def get_queryset(self):
        return Volume.objects.filter(
            series__library__in=self._accessible_libraries()
        ).prefetch_related("chapters")

    def _accessible_libraries(self):
        user = self.request.user
        return Library.objects.all()


class ChapterViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ChapterSerializer

    def get_queryset(self):
        return Chapter.objects.filter(
            volume__series__library__in=self._accessible_libraries()
        ).prefetch_related("files")

    def _accessible_libraries(self):
        user = self.request.user
        return Library.objects.all()


class GenreViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Genre.objects.all()
    serializer_class = GenreSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]


class TagViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]


class PersonViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Person.objects.all()
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ["name"]
    filterset_fields = ["role"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return PersonDetailSerializer
        return PersonSerializer

    @action(detail=True, methods=["get"], url_path="series")
    def series(self, request, pk=None):
        person = self.get_object()
        from .serializers import SeriesListSerializer
        qs = Series.objects.filter(
            metadata__people=person
        ).select_related("metadata").distinct()
        return Response(SeriesListSerializer(qs, many=True, context={"request": request}).data)


class SeriesRatingViewSet(viewsets.ModelViewSet):
    serializer_class = SeriesRatingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = SeriesRating.objects.select_related("user")
        series_id = self.request.query_params.get("series_id")
        if series_id:
            qs = qs.filter(series_id=series_id)
        return qs

    def perform_create(self, serializer):
        series_id = self.request.data.get("series_id")
        SeriesRating.objects.filter(
            series_id=series_id, user=self.request.user
        ).delete()
        serializer.save(user=self.request.user, series_id=series_id)

    def perform_update(self, serializer):
        serializer.save()

    def get_object(self):
        obj = super().get_object()
        if obj.user != self.request.user and not self.request.user.is_admin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied
        return obj


class MediaErrorViewSet(viewsets.ModelViewSet):
    serializer_class = MediaErrorSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["error_type", "resolved", "series"]
    search_fields = ["file_path"]

    def get_queryset(self):
        return MediaError.objects.select_related("series")

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve(self, request, pk=None):
        error = self.get_object()
        error.resolved = True
        error.save(update_fields=["resolved"])
        return Response({"detail": "Marcado como resolvido."})

    @action(detail=False, methods=["post"], url_path="resolve-all")
    def resolve_all(self, request):
        MediaError.objects.filter(resolved=False).update(resolved=True)
        return Response({"detail": "Todos os erros marcados como resolvidos."})


def epub_toc(request, chapter_id):
    """Return EPUB table of contents for a chapter as JSON."""
    import zipfile
    import json
    import xml.etree.ElementTree as ET
    from django.http import JsonResponse
    from apps.library.models import Chapter

    try:
        chapter = Chapter.objects.get(pk=chapter_id)
    except Chapter.DoesNotExist:
        return JsonResponse({"error": "Chapter not found"}, status=404)

    epub_file = chapter.files.filter(format="epub").first()
    if not epub_file:
        return JsonResponse({"toc": []})

    toc = []
    try:
        with zipfile.ZipFile(epub_file.file_path) as zf:
            names = zf.namelist()

            # Try NCX first (EPUB2)
            ncx_path = next((n for n in names if n.endswith(".ncx")), None)
            if ncx_path:
                ncx = ET.fromstring(zf.read(ncx_path))
                ns = {"ncx": "http://www.daisy.org/z3986/2005/ncx/"}
                for nav_point in ncx.findall(".//ncx:navPoint", ns):
                    label = nav_point.findtext(".//ncx:navLabel/ncx:text", default="", namespaces=ns)
                    content = nav_point.find("ncx:content", ns)
                    src = content.get("src", "") if content is not None else ""
                    order = nav_point.get("playOrder", "0")
                    toc.append({"label": label.strip(), "src": src, "order": int(order)})
                toc.sort(key=lambda x: x["order"])

            # Try nav.xhtml (EPUB3)
            if not toc:
                nav_path = next(
                    (n for n in names if "nav" in n.lower() and n.endswith((".xhtml", ".html"))),
                    None
                )
                if nav_path:
                    nav_html = zf.read(nav_path).decode("utf-8", errors="replace")
                    import re
                    items = re.findall(r'<a[^>]+href="([^"]+)"[^>]*>([^<]+)<', nav_html)
                    toc = [{"label": label.strip(), "src": src, "order": i}
                           for i, (src, label) in enumerate(items)]
    except Exception:
        pass

    return JsonResponse({"toc": toc})


def scan_stream(request):
    """SSE endpoint: streams scan job updates to the client."""
    import json
    import time
    from django.http import StreamingHttpResponse, HttpResponse
    from rest_framework_simplejwt.tokens import UntypedToken
    from rest_framework_simplejwt.exceptions import TokenError
    from apps.scanner.models import ScanJob

    token = request.COOKIES.get("access_token")
    if not token:
        return HttpResponse(status=401)
    try:
        UntypedToken(token)
    except TokenError:
        return HttpResponse(status=401)

    def event_generator():
        seen_ids = set()
        yield "retry: 5000\n\n"
        tick = 0
        while True:
            try:
                jobs = list(
                    ScanJob.objects.select_related("library")
                    .order_by("-id")[:20]
                )
                for job in reversed(jobs):
                    if job.id not in seen_ids:
                        seen_ids.add(job.id)
                        data = json.dumps({
                            "id": job.id,
                            "library_id": job.library_id,
                            "library_name": job.library.name if job.library else "",
                            "status": job.status,
                            "files_added": job.files_added,
                            "started_at": job.started_at.isoformat() if job.started_at else None,
                        })
                        yield f"data: {data}\n\n"
                    elif job.status in ("completed", "failed"):
                        data = json.dumps({
                            "id": job.id,
                            "library_id": job.library_id,
                            "library_name": job.library.name if job.library else "",
                            "status": job.status,
                            "files_added": job.files_added,
                        })
                        yield f"data: {data}\n\n"
                # SSE comment heartbeat every ~20 iterations (80 s) keeps the
                # connection alive through Cloudflare and other proxies that
                # close idle connections after ~100 s.
                tick += 1
                if tick % 20 == 0:
                    yield ": heartbeat\n\n"
            except Exception:
                pass
            time.sleep(4)

    response = StreamingHttpResponse(
        event_generator(),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


# ─── AniList metadata ─────────────────────────────────────────────────────────

def _fetch_anilist(anilist_id):
    import urllib.request
    import json as _json
    query = """
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id averageScore meanScore popularity favourites
        genres
        tags { name rank }
        recommendations(perPage: 6) {
          nodes {
            mediaRecommendation {
              id
              title { romaji english }
              coverImage { medium }
            }
          }
        }
        relations {
          nodes { id type title { romaji } }
        }
      }
    }
    """
    payload = _json.dumps({"query": query, "variables": {"id": anilist_id}}).encode()
    req = urllib.request.Request(
        "https://graphql.anilist.co",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = _json.loads(resp.read())
    return data.get("data", {}).get("Media", {})


# ─── EpubFont ViewSet ─────────────────────────────────────────────────────────

class EpubFontViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser]
    queryset = EpubFont.objects.all()

    def get_serializer_class(self):
        from rest_framework import serializers as drf_serializers

        class EpubFontSerializer(drf_serializers.ModelSerializer):
            file_url = drf_serializers.SerializerMethodField()

            class Meta:
                model = EpubFont
                fields = ["id", "name", "file_url", "created_at"]

            def get_file_url(self, obj):
                request = self.context.get("request")
                if obj.file and request:
                    return request.build_absolute_uri(obj.file.url)
                return None

        return EpubFontSerializer

    def create(self, request, *args, **kwargs):
        if not request.user.is_admin:
            return Response({"detail": "Admin only."}, status=403)
        name = request.data.get("name", "")
        file = request.FILES.get("file")
        if not file or not name:
            return Response({"detail": "name and file required."}, status=400)
        ext = file.name.rsplit(".", 1)[-1].lower()
        if ext not in ("ttf", "otf", "woff", "woff2"):
            return Response({"detail": "Only ttf/otf/woff/woff2 allowed."}, status=400)
        font = EpubFont.objects.create(name=name, file=file)
        return Response({"id": font.id, "name": font.name}, status=201)

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_admin:
            return Response({"detail": "Admin only."}, status=403)
        return super().destroy(request, *args, **kwargs)
