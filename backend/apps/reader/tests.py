from django.test import TestCase
from rest_framework.test import APITestCase
from rest_framework import status
from apps.accounts.models import User
from apps.library.models import Library, Series, Volume, Chapter, MangaFile
from apps.reader.models import ReadingProgress, Bookmark, Annotation
from apps.reader.views import _resolve_epub_path


# ─── EPUB path resolver ──────────────────────────────────────────────────────

class ResolveEpubPathTest(TestCase):

    def test_relative_image_from_same_dir(self):
        result = _resolve_epub_path("OEBPS/chapter1.xhtml", "image.png")
        self.assertEqual(result, "OEBPS/image.png")

    def test_relative_path_traversal(self):
        result = _resolve_epub_path(
            "OEBPS/Text/ch1.xhtml", "../Images/cover.jpg"
        )
        self.assertEqual(result, "OEBPS/Images/cover.jpg")

    def test_absolute_http_returns_none(self):
        result = _resolve_epub_path(
            "OEBPS/ch.xhtml", "http://example.com/img.png"
        )
        self.assertIsNone(result)

    def test_absolute_https_returns_none(self):
        result = _resolve_epub_path(
            "OEBPS/ch.xhtml", "https://example.com/img.png"
        )
        self.assertIsNone(result)

    def test_empty_string_returns_none(self):
        result = _resolve_epub_path("OEBPS/ch.xhtml", "")
        self.assertIsNone(result)

    def test_none_returns_none(self):
        result = _resolve_epub_path("OEBPS/ch.xhtml", None)
        self.assertIsNone(result)

    def test_fragment_only_returns_none(self):
        result = _resolve_epub_path("OEBPS/ch.xhtml", "#section1")
        self.assertIsNone(result)

    def test_url_with_fragment_strips_fragment(self):
        result = _resolve_epub_path(
            "OEBPS/ch.xhtml", "image.png#anchor"
        )
        self.assertEqual(result, "OEBPS/image.png")

    def test_data_url_returns_none(self):
        result = _resolve_epub_path(
            "OEBPS/ch.xhtml", "data:image/png;base64,abc"
        )
        self.assertIsNone(result)

    def test_absolute_path_returns_none(self):
        result = _resolve_epub_path("OEBPS/ch.xhtml", "/absolute/path.jpg")
        self.assertIsNone(result)


# ─── chapter images endpoint ─────────────────────────────────────────────────

class ChapterImagesUrlFormatTest(APITestCase):
    """URLs returned must be relative paths (no http:// / https://)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )
        self.client.force_authenticate(user=self.user)
        self.lib = Library.objects.create(
            name="Lib", folder_paths=["/l"]
        )
        self.lib.users.add(self.user)
        self.series = Series.objects.create(library=self.lib, name="S1")
        self.volume = Volume.objects.create(
            series=self.series,
            name="Vol 1",
            min_number=1,
            max_number=1,
        )
        self.chapter = Chapter.objects.create(
            volume=self.volume,
            min_number=1,
            max_number=1,
            sort_order=1,
            pages=5,
        )

    def _add_file(self, fmt, ext):
        return MangaFile.objects.create(
            chapter=self.chapter,
            file_path=f"/fake/{self.chapter.pk}.{ext}",
            pages=5,
            format=fmt,
            bytes=1024,
            extension=f".{ext}",
        )

    def test_epub_book_page_url_is_relative(self):
        self._add_file("epub", "epub")
        response = self.client.get(
            f"/api/reader/chapter/{self.chapter.pk}/images/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        url = response.data.get("book_page_base_url", "")
        self.assertFalse(
            url.startswith("http://"),
            f"Expected relative URL, got: {url}",
        )
        self.assertFalse(
            url.startswith("https://"),
            f"Expected relative URL, got: {url}",
        )
        self.assertTrue(url.startswith("/"))

    def test_pdf_url_is_relative(self):
        self._add_file("pdf", "pdf")
        response = self.client.get(
            f"/api/reader/chapter/{self.chapter.pk}/images/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        url = response.data.get("pdf_url", "")
        self.assertFalse(url.startswith("http://"))
        self.assertFalse(url.startswith("https://"))
        self.assertTrue(url.startswith("/"))

    def test_no_file_returns_404(self):
        response = self.client.get(
            f"/api/reader/chapter/{self.chapter.pk}/images/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ─── Progress tracking ───────────────────────────────────────────────────────

class UpdateProgressTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )
        self.client.force_authenticate(user=self.user)
        self.lib = Library.objects.create(
            name="Lib", folder_paths=["/l"]
        )
        self.lib.users.add(self.user)
        self.series = Series.objects.create(library=self.lib, name="S1")
        self.volume = Volume.objects.create(
            series=self.series,
            name="Vol 1",
            min_number=1,
            max_number=1,
        )
        self.chapter = Chapter.objects.create(
            volume=self.volume,
            min_number=1,
            max_number=1,
            sort_order=1,
            pages=10,
        )
        self.url = "/api/reader/progress/"

    def test_progress_created_on_first_update(self):
        response = self.client.post(self.url, {
            "chapter_id": self.chapter.pk,
            "pages_read": 5,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(ReadingProgress.objects.filter(
            user=self.user, chapter=self.chapter
        ).exists())

    def test_progress_updates_on_second_call(self):
        self.client.post(self.url, {
            "chapter_id": self.chapter.pk,
            "pages_read": 3,
        })
        self.client.post(self.url, {
            "chapter_id": self.chapter.pk,
            "pages_read": 7,
        })
        p = ReadingProgress.objects.get(
            user=self.user, chapter=self.chapter
        )
        self.assertEqual(p.pages_read, 7)

    def test_completing_chapter_increments_total_reads(self):
        self.client.post(self.url, {
            "chapter_id": self.chapter.pk,
            "pages_read": 10,
        })
        p = ReadingProgress.objects.get(
            user=self.user, chapter=self.chapter
        )
        self.assertEqual(p.total_reads, 1)

    def test_total_reads_not_double_incremented(self):
        """Saving progress again at completion must not increment twice."""
        self.client.post(self.url, {
            "chapter_id": self.chapter.pk,
            "pages_read": 10,
        })
        self.client.post(self.url, {
            "chapter_id": self.chapter.pk,
            "pages_read": 10,
        })
        p = ReadingProgress.objects.get(
            user=self.user, chapter=self.chapter
        )
        self.assertEqual(p.total_reads, 1)

    def test_epub_chapter_never_triggers_total_reads(self):
        """EPUB chapters have pages=0 in the DB — must never auto-complete."""
        epub_chapter = Chapter.objects.create(
            volume=self.volume,
            min_number=2,
            max_number=2,
            sort_order=2,
            pages=0,  # EPUB chapters stored with pages=0
        )
        self.client.post(self.url, {
            "chapter_id": epub_chapter.pk,
            "pages_read": 0,
        })
        p = ReadingProgress.objects.get(
            user=self.user, chapter=epub_chapter
        )
        self.assertEqual(p.total_reads, 0)

    def test_is_completed_true_when_all_pages_read(self):
        self.client.post(self.url, {
            "chapter_id": self.chapter.pk,
            "pages_read": 10,
        })
        p = ReadingProgress.objects.get(
            user=self.user, chapter=self.chapter
        )
        self.assertTrue(p.is_completed)

    def test_is_completed_false_when_partial(self):
        self.client.post(self.url, {
            "chapter_id": self.chapter.pk,
            "pages_read": 5,
        })
        p = ReadingProgress.objects.get(
            user=self.user, chapter=self.chapter
        )
        self.assertFalse(p.is_completed)

    def test_missing_chapter_returns_404(self):
        response = self.client.post(self.url, {
            "chapter_id": 99999,
            "pages_read": 5,
        })
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ─── Bookmarks ───────────────────────────────────────────────────────────────

class BookmarkTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )
        self.user2 = User.objects.create_user(
            username="user2", email="u2@t.com", password="pass"
        )
        self.lib = Library.objects.create(
            name="Lib", folder_paths=["/l"]
        )
        self.lib.users.add(self.user)
        self.series = Series.objects.create(library=self.lib, name="S1")
        self.volume = Volume.objects.create(
            series=self.series,
            name="Vol 1",
            min_number=1,
            max_number=1,
        )
        self.chapter = Chapter.objects.create(
            volume=self.volume,
            min_number=1,
            max_number=1,
            sort_order=1,
            pages=10,
        )

    def test_create_bookmark(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/reader/bookmarks/", {
            "chapter_id": self.chapter.pk,
            "page": 3,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_user_only_sees_own_bookmarks(self):
        Bookmark.objects.create(
            user=self.user, chapter=self.chapter, page=1
        )
        Bookmark.objects.create(
            user=self.user2, chapter=self.chapter, page=2
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/reader/bookmarks/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["page"], 1)

    def test_cannot_delete_other_users_bookmark(self):
        bookmark2 = Bookmark.objects.create(
            user=self.user2, chapter=self.chapter, page=5
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f"/api/reader/bookmarks/{bookmark2.pk}/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ─── Annotations ─────────────────────────────────────────────────────────────

class AnnotationTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )
        self.user2 = User.objects.create_user(
            username="user2", email="u2@t.com", password="pass"
        )
        self.lib = Library.objects.create(
            name="Lib", folder_paths=["/l"]
        )
        self.lib.users.add(self.user)
        self.series = Series.objects.create(library=self.lib, name="S1")
        self.volume = Volume.objects.create(
            series=self.series,
            name="Vol 1",
            min_number=1,
            max_number=1,
        )
        self.chapter = Chapter.objects.create(
            volume=self.volume,
            min_number=1,
            max_number=1,
            sort_order=1,
            pages=10,
        )
        self.chapter2 = Chapter.objects.create(
            volume=self.volume,
            min_number=2,
            max_number=2,
            sort_order=2,
            pages=8,
        )

    def test_create_annotation(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/reader/annotations/", {
            "chapter_id": self.chapter.pk,
            "highlighted_text": "Important passage",
            "note": "My note",
            "color": "#ff0000",
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_user_only_sees_own_annotations(self):
        Annotation.objects.create(
            user=self.user,
            chapter=self.chapter,
            highlighted_text="user text",
        )
        Annotation.objects.create(
            user=self.user2,
            chapter=self.chapter,
            highlighted_text="user2 text",
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/reader/annotations/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["highlighted_text"], "user text"
        )

    def test_filter_annotations_by_chapter(self):
        Annotation.objects.create(
            user=self.user,
            chapter=self.chapter,
            highlighted_text="ch1 text",
        )
        Annotation.objects.create(
            user=self.user,
            chapter=self.chapter2,
            highlighted_text="ch2 text",
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get(
            f"/api/reader/annotations/?chapter_id={self.chapter.pk}"
        )
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["highlighted_text"], "ch1 text"
        )

    def test_cannot_access_other_users_annotation(self):
        ann2 = Annotation.objects.create(
            user=self.user2,
            chapter=self.chapter,
            highlighted_text="private",
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get(
            f"/api/reader/annotations/{ann2.pk}/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ─── Continue point ───────────────────────────────────────────────────────────

class ContinuePointTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )
        self.client.force_authenticate(user=self.user)
        self.lib = Library.objects.create(
            name="Lib", folder_paths=["/l"]
        )
        self.series = Series.objects.create(library=self.lib, name="S1")
        self.volume = Volume.objects.create(
            series=self.series,
            name="Vol 1",
            min_number=1,
            max_number=1,
        )
        self.ch1 = Chapter.objects.create(
            volume=self.volume,
            min_number=1,
            max_number=1,
            sort_order=1,
            pages=10,
        )
        self.ch2 = Chapter.objects.create(
            volume=self.volume,
            min_number=2,
            max_number=2,
            sort_order=2,
            pages=10,
        )

    def _url(self):
        return f"/api/reader/series/{self.series.pk}/continue/"

    def test_no_progress_returns_first_chapter(self):
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["chapter_id"], self.ch1.pk)
        self.assertEqual(response.data["pages_read"], 0)

    def test_with_progress_returns_last_modified_chapter(self):
        ReadingProgress.objects.create(
            user=self.user,
            chapter=self.ch1,
            series=self.series,
            library=self.lib,
            pages_read=5,
        )
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["chapter_id"], self.ch1.pk)
        self.assertEqual(response.data["pages_read"], 5)

    def test_zero_pages_read_entries_are_excluded(self):
        # A progress entry with pages_read=0 must not be returned.
        ReadingProgress.objects.create(
            user=self.user,
            chapter=self.ch1,
            series=self.series,
            library=self.lib,
            pages_read=0,
        )
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Falls back to first chapter with pages_read=0 (no real progress)
        self.assertEqual(response.data["chapter_id"], self.ch1.pk)
        self.assertEqual(response.data["pages_read"], 0)

    def test_series_without_chapters_returns_null(self):
        empty_series = Series.objects.create(
            library=self.lib, name="Empty Series"
        )
        response = self.client.get(
            f"/api/reader/series/{empty_series.pk}/continue/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["chapter_id"])

    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
