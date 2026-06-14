import os
import re
import mimetypes
import posixpath
import threading
import zipfile
from pathlib import Path
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
import ebooklib
from ebooklib import epub as epub_lib
from apps.library.models import Chapter
from .models import ReadingProgress, ReadingSession, Bookmark, Annotation
from .serializers import (
    ReadingProgressSerializer,
    UpdateProgressSerializer,
    BookmarkSerializer,
    AnnotationSerializer,
)


# ─── EPUB in-memory cache ────────────────────────────────────────────────────
# ebooklib opens and reads the entire EPUB correctly regardless of internal
# directory structure. We call it once per file and cache everything in
# memory so subsequent page/resource requests are instant.

_epub_lock = threading.Lock()
_epub_cache: dict = {}  # {file_path: (mtime, spine_data, resource_map)}


def _load_epub(file_path):
    """Load EPUB once per process; return (spine_data, resource_map).

    spine_data  — list of {'name': str, 'content': bytes} in reading order
    resource_map — dict {file_name: bytes} for all items (images, CSS, fonts)
    """
    try:
        mtime = os.path.getmtime(file_path)
    except OSError:
        raise Http404

    with _epub_lock:
        cached = _epub_cache.get(file_path)
        if cached and cached[0] == mtime:
            return cached[1], cached[2]

    try:
        book = epub_lib.read_epub(file_path)
    except Exception:
        raise Http404

    spine_data = []
    for item_id, _ in book.spine:
        item = book.get_item_with_id(item_id)
        if item is None:
            continue
        t = item.get_type()
        name = item.file_name
        ext = name.rsplit(".", 1)[-1].lower()
        if t == ebooklib.ITEM_DOCUMENT or ext in ("html", "xhtml", "htm"):
            try:
                content = item.get_content()
            except Exception:
                content = b""
            spine_data.append({"name": name, "content": content})

    resource_map: dict = {}
    for item in book.get_items():
        try:
            resource_map[item.file_name] = item.get_content()
        except Exception:
            resource_map[item.file_name] = b""

    with _epub_lock:
        _epub_cache[file_path] = (mtime, spine_data, resource_map)

    return spine_data, resource_map


def _resolve_epub_path(doc_path, rel_url):
    """Resolve a relative URL in an EPUB page to its path from the EPUB root.
    """
    if not rel_url:
        return None
    if '#' in rel_url:
        rel_url = rel_url.split('#')[0]
    if not rel_url:
        return None
    if rel_url.startswith(('http://', 'https://', 'data:', '/')):
        return None
    base_dir = posixpath.dirname(doc_path)
    resolved = posixpath.normpath(posixpath.join(base_dir, rel_url))
    return resolved.lstrip('/')


# ─── Reader API ──────────────────────────────────────────────────────────────

@api_view(["GET"])
def chapter_images(request, chapter_id):
    """Return format info and page URLs for a chapter."""
    chapter = get_object_or_404(Chapter, pk=chapter_id)
    manga_file = chapter.files.first()
    if not manga_file:
        raise Http404

    if manga_file.format == "epub":
        total_pages = 0
        if os.path.exists(manga_file.file_path):
            try:
                spine_data, _ = _load_epub(manga_file.file_path)
                total_pages = len(spine_data)
            except Exception:
                total_pages = 0
        return Response({
            "format": "epub",
            "total_pages": total_pages,
            "book_page_base_url": (
                f"/api/reader/chapter/{chapter_id}/book-page/"
            ),
        })

    if manga_file.format == "pdf":
        return Response({
            "format": "pdf",
            "total_pages": chapter.pages,
            "pdf_url": f"/api/reader/chapter/{chapter_id}/pdf/",
        })

    pages = [
        f"/api/reader/chapter/{chapter_id}/image/{i}/"
        for i in range(chapter.pages)
    ]
    return Response({
        "format": "images",
        "total_pages": chapter.pages,
        "pages": pages,
    })


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def chapter_image(request, chapter_id, page):
    """Serve a single page image extracted from the archive."""
    chapter = get_object_or_404(Chapter, pk=chapter_id)
    manga_file = chapter.files.first()
    if not manga_file or not os.path.exists(manga_file.file_path):
        raise Http404

    file_path = manga_file.file_path
    ext = manga_file.extension.lower()

    try:
        if ext in (".cbz", ".zip"):
            with zipfile.ZipFile(file_path) as zf:
                images = sorted(
                    [n for n in zf.namelist() if not n.endswith("/")],
                    key=lambda x: x.lower(),
                )
                if page >= len(images):
                    raise Http404
                image_data = zf.read(images[page])
                return HttpResponse(
                    image_data,
                    content_type=_guess_content_type(images[page]),
                )
        elif ext in (".cbr", ".rar"):
            try:
                import rarfile
                with rarfile.RarFile(file_path) as rf:
                    images = sorted(
                        [n.filename for n in rf.infolist() if not n.isdir()],
                        key=lambda x: x.lower(),
                    )
                    if page >= len(images):
                        raise Http404
                    with rf.open(images[page]) as f:
                        image_data = f.read()
                    return HttpResponse(
                        image_data,
                        content_type=_guess_content_type(images[page]),
                    )
            except Exception:
                raise Http404
        elif ext in (".cb7", ".7z"):
            import py7zr
            with py7zr.SevenZipFile(file_path, mode="r") as z7:
                files = z7.readall()
                images = sorted(
                    [n for n in files.keys() if not n.endswith("/")],
                    key=lambda x: x.lower(),
                )
                if page >= len(images):
                    raise Http404
                bio = files[images[page]]
                try:
                    image_data = bio.read()
                except Exception:
                    image_data = bio.getvalue()
                return HttpResponse(
                    image_data,
                    content_type=_guess_content_type(images[page]),
                )
        elif ext in (".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"):
            return FileResponse(open(file_path, "rb"))
    except (KeyError, IndexError):
        raise Http404

    raise Http404


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def chapter_download(request, chapter_id):
    """Serve the raw EPUB file."""
    chapter = get_object_or_404(Chapter, pk=chapter_id)
    manga_file = chapter.files.first()
    if not manga_file or not os.path.exists(manga_file.file_path):
        raise Http404
    if manga_file.format != "epub":
        raise Http404
    return FileResponse(
        open(manga_file.file_path, "rb"),
        content_type="application/epub+zip",
    )


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def chapter_book_page(request, chapter_id):
    """
    Serve a single HTML page extracted from an EPUB.
    Images and CSS hrefs are rewritten to use the book-resource endpoint.
    X-Frame-Options is removed so the page can be embedded in an iframe.
    """
    chapter = get_object_or_404(Chapter, pk=chapter_id)
    manga_file = chapter.files.first()
    if not manga_file or not os.path.exists(manga_file.file_path):
        raise Http404
    if manga_file.format != "epub":
        raise Http404

    try:
        page_num = int(request.GET.get("page", 0))
    except (ValueError, TypeError):
        page_num = 0

    spine_data, _ = _load_epub(manga_file.file_path)

    if page_num < 0 or page_num >= len(spine_data):
        raise Http404

    page = spine_data[page_num]
    doc_path = page["name"]
    content = page["content"].decode("utf-8", errors="replace")

    resource_base = f"/api/reader/chapter/{chapter_id}/book-resource/"

    def make_absolute(url):
        resolved = _resolve_epub_path(doc_path, url)
        return f"{resource_base}?file={resolved}" if resolved else url

    content = re.sub(
        r'src=(["\'])([^"\']+)\1',
        lambda m: f'src={m.group(1)}{make_absolute(m.group(2))}{m.group(1)}',
        content,
    )
    content = re.sub(
        r'href=(["\'])([^"\']*\.css[^"\']*)\1',
        lambda m: f'href={m.group(1)}{make_absolute(m.group(2))}{m.group(1)}',
        content,
    )

    # ── Reader customisation CSS ─────────────────────────────────────────────
    try:
        font_size = max(10, min(40, int(request.GET.get("font_size", 16))))
    except (ValueError, TypeError):
        font_size = 16
    try:
        line_spacing = max(1.0, min(3.0, float(request.GET.get("line_spacing", 1.6))))
    except (ValueError, TypeError):
        line_spacing = 1.6

    font_family_map = {
        "sans": "system-ui, -apple-system, 'Segoe UI', sans-serif",
        "serif": "Georgia, 'Times New Roman', Times, serif",
        "mono": "'Courier New', Courier, Lucida Console, monospace",
    }
    font_family = font_family_map.get(
        request.GET.get("font_family", "sans"), font_family_map["sans"]
    )

    theme_css_map = {
        "dark":  ("background:#1a1a1a!important;color:#e4e2f0!important;",
                  "border-color:#333!important;"),
        "black": ("background:#000!important;color:#f0f0f0!important;",
                  "border-color:#222!important;"),
        "white": ("background:#fff!important;color:#111!important;",
                  "border-color:#ccc!important;"),
        "paper": ("background:#f5e6c9!important;color:#3a2e1a!important;",
                  "border-color:#c8b89a!important;"),
    }
    body_colors, misc_colors = theme_css_map.get(
        request.GET.get("theme", "dark"), theme_css_map["dark"]
    )

    style_block = (
        "<style id='__reader_custom'>"
        f"html,body{{margin:0!important;padding:0!important;{body_colors}}}"
        f"body{{font-family:{font_family}!important;"
        f"font-size:{font_size}px!important;"
        f"line-height:{line_spacing}!important;"
        "max-width:820px!important;margin:0 auto!important;"
        "padding:1.25rem 1.75rem 4rem!important;"
        "word-break:break-word!important;}}"
        f"hr,table,blockquote{{color:inherit!important;{misc_colors}}}"
        "img{max-width:100%!important;height:auto!important;}"
        "a{color:#7c9cf0!important;}"
        "</style>"
    )

    if "</head>" in content:
        content = content.replace("</head>", f"{style_block}</head>", 1)
    elif "<body" in content:
        content = re.sub(r"(<body[^>]*>)", r"\1" + style_block, content, count=1)
    else:
        content = style_block + content

    response = HttpResponse(content, content_type="text/html; charset=utf-8")
    response['X-Frame-Options'] = 'ALLOWALL'
    return response


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def chapter_book_resource(request, chapter_id):
    """Serve an image, CSS, or font from within an EPUB file."""
    file_key = request.GET.get("file", "").strip()
    if not file_key:
        raise Http404

    chapter = get_object_or_404(Chapter, pk=chapter_id)
    manga_file = chapter.files.first()
    if not manga_file or not os.path.exists(manga_file.file_path):
        raise Http404
    if manga_file.format != "epub":
        raise Http404

    _, resource_map = _load_epub(manga_file.file_path)

    data = resource_map.get(file_key)
    if data is None:
        raise Http404

    content_type, _ = mimetypes.guess_type(file_key)
    if not content_type:
        content_type = "application/octet-stream"

    return HttpResponse(data, content_type=content_type)


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def chapter_pdf(request, chapter_id):
    chapter = get_object_or_404(Chapter, pk=chapter_id)
    manga_file = chapter.files.filter(format="pdf").first()
    if not manga_file:
        return Response(
            {"detail": f"No PDF file for chapter {chapter_id}"},
            status=404,
        )
    if not os.path.exists(manga_file.file_path):
        return Response(
            {"detail": f"PDF not found on disk: {manga_file.file_path}"},
            status=404,
        )
    return FileResponse(
        open(manga_file.file_path, "rb"),
        content_type="application/pdf",
    )


def _guess_content_type(filename):
    ext = Path(filename).suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".avif": "image/avif",
    }.get(ext, "image/jpeg")


# ─── Progress ────────────────────────────────────────────────────────────────

@api_view(["GET"])
def continue_point(request, series_id):
    """Return the chapter and page to resume reading."""
    from apps.library.models import Series
    series = get_object_or_404(Series, pk=series_id)
    progress = (
        ReadingProgress.objects.filter(user=request.user, series=series)
        .exclude(pages_read=0)
        .order_by("-last_modified")
        .first()
    )
    if not progress:
        first_chapter = Chapter.objects.filter(
            volume__series=series
        ).order_by("volume__min_number", "sort_order").first()
        if not first_chapter:
            return Response({"chapter_id": None, "pages_read": 0})
        return Response({"chapter_id": first_chapter.id, "pages_read": 0})

    return Response({
        "chapter_id": progress.chapter_id,
        "pages_read": progress.pages_read,
        "book_scroll_id": progress.book_scroll_id,
    })


@api_view(["POST"])
def update_progress(request):
    serializer = UpdateProgressSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    chapter = get_object_or_404(Chapter, pk=data["chapter_id"])
    progress, _ = ReadingProgress.objects.get_or_create(
        user=request.user,
        chapter=chapter,
        defaults={
            "series": chapter.series,
            "library": chapter.library,
        },
    )
    old_pages = progress.pages_read
    progress.pages_read = data["pages_read"]
    if "book_scroll_id" in data:
        progress.book_scroll_id = data["book_scroll_id"]
    # Only count a completion when transitioning incomplete → complete.
    # Guard pages > 0: EPUB chapters are stored with pages=0 in the DB.
    newly_complete = (
        chapter.pages > 0
        and progress.pages_read >= chapter.pages
        and old_pages < chapter.pages
    )
    if newly_complete:
        progress.total_reads += 1
    progress.save()

    pages_delta = max(0, progress.pages_read - old_pages)
    _update_reading_session(request.user, chapter, progress.pages_read, pages_delta)

    if newly_complete:
        _trigger_scrobble(request.user, chapter)

    return Response(ReadingProgressSerializer(progress).data)


def _update_reading_session(user, chapter, pages_read, pages_delta):
    from datetime import timedelta
    from apps.stats.models import ReadingHistory
    now = timezone.now()
    threshold = now - timedelta(minutes=30)
    session = (
        ReadingSession.objects
        .filter(user=user, chapter=chapter, started_at__gte=threshold)
        .order_by("-started_at")
        .first()
    )
    if session:
        session.pages_read = pages_read
        session.ended_at = now
        session.save(update_fields=["pages_read", "ended_at"])
    else:
        ReadingSession.objects.create(
            user=user,
            series=chapter.series,
            chapter=chapter,
            pages_read=pages_read,
            ended_at=now,
        )
    if pages_delta > 0:
        today = now.date()
        hist, _ = ReadingHistory.objects.get_or_create(
            user=user,
            series=chapter.series,
            chapter=chapter,
            read_at=today,
            defaults={"pages_read": 0},
        )
        hist.pages_read += pages_delta
        hist.save(update_fields=["pages_read"])


def _trigger_scrobble(user, chapter):
    """Fire-and-forget: update AniList/MAL reading progress for the completed chapter."""
    import threading
    from apps.accounts.models import ScrobbleCredential

    series = chapter.series
    if not series.anilist_id and not series.mal_id:
        return

    creds = {
        c.provider: c.access_token
        for c in ScrobbleCredential.objects.filter(user=user, is_active=True)
    }
    if not creds:
        return

    progress_entries = list(
        ReadingProgress.objects.filter(user=user, series=series)
        .values_list("total_reads", flat=True)
    )
    total_reads = max(progress_entries) if progress_entries else 1

    def _do_scrobble():
        from apps.accounts.models import ScrobbleError
        import urllib.request
        import json as _json

        if "anilist" in creds and series.anilist_id:
            try:
                mutation = """
                mutation ($mediaId: Int, $progress: Int) {
                  SaveMediaListEntry(mediaId: $mediaId, progress: $progress) { id }
                }
                """
                payload = _json.dumps({
                    "query": mutation,
                    "variables": {"mediaId": series.anilist_id, "progress": total_reads},
                }).encode()
                req = urllib.request.Request(
                    "https://graphql.anilist.co",
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {creds['anilist']}",
                    },
                    method="POST",
                )
                urllib.request.urlopen(req, timeout=10)
            except Exception as exc:
                ScrobbleError.objects.create(
                    user=user,
                    provider="anilist",
                    series_name=series.name,
                    anilist_id=series.anilist_id,
                    error_message=str(exc),
                )

        if "mal" in creds and series.mal_id:
            try:
                import urllib.parse
                body = urllib.parse.urlencode(
                    {"num_chapters_read": total_reads}
                ).encode()
                req = urllib.request.Request(
                    f"https://api.myanimelist.net/v2/manga/{series.mal_id}/my_list_status",
                    data=body,
                    headers={"Authorization": f"Bearer {creds['mal']}"},
                    method="PATCH",
                )
                urllib.request.urlopen(req, timeout=10)
            except Exception as exc:
                ScrobbleError.objects.create(
                    user=user,
                    provider="mal",
                    series_name=series.name,
                    mal_id=series.mal_id,
                    error_message=str(exc),
                )

    threading.Thread(target=_do_scrobble, daemon=True).start()


@api_view(["GET"])
def series_progress(request, series_id):
    progress = ReadingProgress.objects.filter(
        user=request.user, series_id=series_id
    ).select_related("chapter")
    return Response(ReadingProgressSerializer(progress, many=True).data)


# ─── Bookmarks ───────────────────────────────────────────────────────────────

class BookmarkListCreateView(generics.ListCreateAPIView):
    serializer_class = BookmarkSerializer
    pagination_class = None

    def get_queryset(self):
        return Bookmark.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class BookmarkDestroyView(generics.DestroyAPIView):
    serializer_class = BookmarkSerializer

    def get_queryset(self):
        return Bookmark.objects.filter(user=self.request.user)


# ─── Annotations ─────────────────────────────────────────────────────────────

class AnnotationListCreateView(generics.ListCreateAPIView):
    serializer_class = AnnotationSerializer
    pagination_class = None

    def get_queryset(self):
        chapter_id = self.request.query_params.get("chapter_id")
        qs = Annotation.objects.filter(user=self.request.user)
        if chapter_id:
            qs = qs.filter(chapter_id=chapter_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class AnnotationDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AnnotationSerializer

    def get_queryset(self):
        return Annotation.objects.filter(user=self.request.user)
