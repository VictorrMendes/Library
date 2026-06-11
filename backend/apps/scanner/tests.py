import os
from django.test import TestCase
from apps.scanner.tasks import (
    get_format,
    _series_name_from_filename,
    _sanitize_dirname,
    _parse_path,
)
from apps.library.models import LibraryType


class GetFormatTest(TestCase):

    def test_cbz(self):
        self.assertEqual(get_format(".cbz"), "archive")

    def test_zip(self):
        self.assertEqual(get_format(".zip"), "archive")

    def test_cbr(self):
        self.assertEqual(get_format(".cbr"), "archive")

    def test_cb7(self):
        self.assertEqual(get_format(".cb7"), "archive")

    def test_cbt(self):
        self.assertEqual(get_format(".cbt"), "archive")

    def test_epub(self):
        self.assertEqual(get_format(".epub"), "epub")

    def test_pdf(self):
        self.assertEqual(get_format(".pdf"), "pdf")

    def test_jpg(self):
        self.assertEqual(get_format(".jpg"), "image")

    def test_png(self):
        self.assertEqual(get_format(".png"), "image")

    def test_webp(self):
        self.assertEqual(get_format(".webp"), "image")

    def test_unknown_extension(self):
        self.assertEqual(get_format(".docx"), "unknown")

    def test_normalizes_uppercase(self):
        # get_format lowercases internally
        self.assertEqual(get_format(".CBZ"), "archive")
        self.assertEqual(get_format(".EPUB"), "epub")


class SeriesNameFromFilenameTest(TestCase):

    def test_simple_name_unchanged(self):
        self.assertEqual(
            _series_name_from_filename("One Piece.cbz"), "One Piece"
        )

    def test_removes_dash_vol_suffix(self):
        result = _series_name_from_filename(
            "One Piece - Vol. 01.cbz"
        )
        self.assertEqual(result, "One Piece")

    def test_removes_dash_chapter_suffix(self):
        result = _series_name_from_filename(
            "My Manga - Ch. 001.cbz"
        )
        self.assertEqual(result, "My Manga")

    def test_removes_vol_ch_combined(self):
        result = _series_name_from_filename(
            "Attack on Titan Vol 1 Ch 001.cbz"
        )
        self.assertEqual(result, "Attack on Titan")

    def test_removes_year_in_parentheses(self):
        result = _series_name_from_filename(
            "Old Manga (2005).cbz"
        )
        self.assertEqual(result, "Old Manga")

    def test_removes_year_in_brackets(self):
        result = _series_name_from_filename(
            "Old Manga [2005].cbz"
        )
        self.assertEqual(result, "Old Manga")

    def test_removes_hash_number_suffix(self):
        result = _series_name_from_filename(
            "Comic Title #001.cbz"
        )
        self.assertEqual(result, "Comic Title")

    def test_empty_stem_returns_unknown(self):
        result = _series_name_from_filename(".cbz")
        self.assertEqual(result, "Unknown Series")


class SanitizeDirnameTest(TestCase):

    def test_removes_invalid_characters(self):
        result = _sanitize_dirname('My: "Series" <test>')
        self.assertNotIn(":", result)
        self.assertNotIn('"', result)
        self.assertNotIn("<", result)
        self.assertNotIn(">", result)

    def test_strips_trailing_dots_and_spaces(self):
        result = _sanitize_dirname("Series Name.  ")
        self.assertFalse(result.endswith("."))
        self.assertFalse(result.endswith(" "))

    def test_max_length_200(self):
        long_name = "A" * 300
        result = _sanitize_dirname(long_name)
        self.assertLessEqual(len(result), 200)

    def test_empty_returns_unknown(self):
        result = _sanitize_dirname("...")
        self.assertEqual(result, "Unknown Series")


class ParsePathTest(TestCase):

    def _base(self):
        return os.path.join(os.sep, "manga")

    def test_three_parts_series_volume_chapter(self):
        base = self._base()
        path = os.path.join(base, "One Piece", "Vol 01", "Ch 001.cbz")
        series, volume, chapter = _parse_path(
            path, base, LibraryType.MANGA
        )
        self.assertEqual(series, "One Piece")
        self.assertEqual(volume, "Vol 01")
        self.assertIn("Ch 001", chapter)

    def test_two_parts_series_chapter(self):
        base = self._base()
        path = os.path.join(base, "One Piece", "Ch 001.cbz")
        series, volume, chapter = _parse_path(
            path, base, LibraryType.MANGA
        )
        self.assertEqual(series, "One Piece")
        self.assertEqual(volume, "Volume 1")
        self.assertIn("Ch 001", chapter)

    def test_one_part_file_only(self):
        base = self._base()
        path = os.path.join(base, "StandaloneFile.cbz")
        series, volume, chapter = _parse_path(
            path, base, LibraryType.MANGA
        )
        self.assertIn("StandaloneFile", series)
        self.assertEqual(volume, "Volume 1")
        self.assertEqual(chapter, "Chapter 1")
