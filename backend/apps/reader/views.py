import hashlib
import os
import re
import mimetypes
import posixpath
import threading
import zipfile
from pathlib import Path
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
import ebooklib
from ebooklib import epub as epub_lib
from apps.library.models import Chapter
from .models import ReadingProgress, Bookmark, Annotation
from .serializers import (
    ReadingProgressSerializer,
    UpdateProgressSerializer,
    BookmarkSerializer,
    AnnotationSerializer,
)


# ─── EPUB extraction cache ───────────────────────────────────────────────────
# EPUBs are extracted to /tmp/epub_cache/<hash>/ on first access.
# Subsequent page/resource requests read directly from the filesystem —
# no re-parsing with ebooklib.

EPUB_CACHE_DIR = "/tmp/epub_cache"
_epub_lock = threading.Lock()
_epub_extractions: dict = {}  # {file_path: (mtime, extract_dir, spine_names)}


def _ensure_epub_extracted(file_path):
    """Extract EPUB to a temp dir once; return (extract_dir, spine_file_names).

    ebooklib is called only on the first access per file (per process).
    Race-safe: concurrent workers may both extract, which is harmless since
    they write identical content to the same path.
    """
    try:
        current_mtime = os.path.getmtime(file_path)
    except OSError:
        raise Http404

    with _epub_lock:
        cached = _epub_extractions.get(file_path)
        if cached and cached[0] == current_mtime:
            return cached[1], cached[2]

    path_hash = hashlib.md5(file_path.encode()).hexdigest()
    extract_dir = os.path.join(EPUB_CACHE_DIR, path_hash)

    try:
        os.makedirs(extract_dir, exist_ok=True)
        with zipfile.ZipFile(file_path) as zf:
            zf.extractall(extract_dir)
    except Exception:
        raise Http404

    try:
        book = epub_lib.read_epub(file_path)
        spine_names = []
        for item_id, _ in book.spine:
            item = book.get_item_with_id(item_id)
            if item is None:
                continue
            t = item.get_type()
            name = item.file_name
            ext = name.rsplit(".", 1)[-1].lower()
            if t == ebooklib.ITEM_DOCUMENT or ext in ("html", "xhtml", "htm"):
                spine_names.append(name)
    except Exception:
        raise Http404

    with _epub_lock:
        _epub_extractions[file_path] = (current_mtime, extract_dir, spine_names)

    return extract_dir, spine_names


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
                _, spine_names = _ensure_epub_extracted(manga_file.file_path)
                total_pages = len(spine_names)
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

    extract_dir, spine_names = _ensure_epub_extracted(manga_file.file_path)

    if page_num < 0 or page_num >= len(spine_names):
        raise Http404

    doc_path = spine_names[page_num]
    full_path = os.path.join(extract_dir, doc_path)
    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as fh:
            content = fh.read()
    except OSError:
        raise Http404

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

    if ".." in file_key:
        raise Http404

    extract_dir, _ = _ensure_epub_extracted(manga_file.file_path)

    resource_path = os.path.join(extract_dir, file_key)
    if not os.path.isfile(resource_path):
        raise Http404

    content_type, _ = mimetypes.guess_type(file_key)
    if not content_type:
        content_type = "application/octet-stream"

    return FileResponse(open(resource_path, "rb"), content_type=content_type)


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def chapter_pdf(request, chapter_id):
    chapter = get_object_or_404(Chapter, pk=chapter_id)
    manga_file = chapter.files.filter(format="pdf").first()
    if not manga_file or not os.path.exists(manga_file.file_path):
        raise Http404
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
            return Response(
                {"detail": "Nenhum capítulo encontrado."}, status=404
            )
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

    return Response(ReadingProgressSerializer(progress).data)


@api_view(["GET"])
def series_progress(request, series_id):
    progress = ReadingProgress.objects.filter(
        user=request.user, series_id=series_id
    ).select_related("chapter")
    return Response(ReadingProgressSerializer(progress, many=True).data)


# ─── Bookmarks ───────────────────────────────────────────────────────────────

class BookmarkListCreateView(generics.ListCreateAPIView):
    serializer_class = BookmarkSerializer

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
