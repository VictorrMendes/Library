from django.db import models
from django.conf import settings


class LibraryType(models.TextChoices):
    MANGA = "manga", "Manga"
    COMIC = "comic", "Comic"
    BOOK = "book", "Book"
    LIGHT_NOVEL = "light_novel", "Light Novel"
    IMAGE = "image", "Image"


class PublicationStatus(models.TextChoices):
    ONGOING = "ongoing", "Em andamento"
    COMPLETED = "completed", "Completo"
    HIATUS = "hiatus", "Hiato"
    CANCELLED = "cancelled", "Cancelado"
    ENDED = "ended", "Encerrado"
    UNKNOWN = "unknown", "Desconhecido"


class AgeRating(models.IntegerChoices):
    UNKNOWN = 0, "Unknown"
    EVERYONE = 1, "Everyone"
    TEEN = 2, "Teen"
    MATURE = 3, "Mature"
    ADULTS_ONLY = 4, "Adults Only"


class FileFormat(models.TextChoices):
    IMAGE = "image", "Image"
    ARCHIVE = "archive", "Archive (CBZ/CBR)"
    EPUB = "epub", "EPUB"
    PDF = "pdf", "PDF"
    UNKNOWN = "unknown", "Unknown"


# ─── Taxonomy ────────────────────────────────────────────────────────────────

class Genre(models.Model):
    name = models.CharField(max_length=100, unique=True)
    normalized = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = "library_genre"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.normalized = self.name.lower().strip()
        super().save(*args, **kwargs)


class Tag(models.Model):
    name = models.CharField(max_length=100, unique=True)
    normalized = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = "library_tag"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.normalized = self.name.lower().strip()
        super().save(*args, **kwargs)


class PersonRole(models.TextChoices):
    WRITER = "writer", "Writer"
    PENCILLER = "penciller", "Penciller"
    INKER = "inker", "Inker"
    COLORIST = "colorist", "Colorist"
    COVER_ARTIST = "cover_artist", "Cover Artist"
    EDITOR = "editor", "Editor"
    TRANSLATOR = "translator", "Translator"
    PUBLISHER = "publisher", "Publisher"
    CHARACTER = "character", "Character"
    IMPRINT = "imprint", "Imprint"


class Person(models.Model):
    name = models.CharField(max_length=255)
    normalized = models.CharField(max_length=255)
    role = models.CharField(max_length=30, choices=PersonRole.choices)
    cover_image = models.ImageField(upload_to="people/", blank=True, null=True)
    description = models.TextField(blank=True)

    class Meta:
        db_table = "library_person"
        unique_together = [("normalized", "role")]
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.role})"

    def save(self, *args, **kwargs):
        self.normalized = self.name.lower().strip()
        super().save(*args, **kwargs)


# ─── Library ─────────────────────────────────────────────────────────────────

class Library(models.Model):
    name = models.CharField(max_length=255, unique=True)
    type = models.CharField(max_length=20, choices=LibraryType.choices, default=LibraryType.MANGA)
    cover_image = models.ImageField(upload_to="library_covers/", blank=True, null=True)
    folder_paths = models.JSONField(default=list)
    include_in_dashboard = models.BooleanField(default=True)
    include_in_search = models.BooleanField(default=True)
    include_in_recommended = models.BooleanField(default=True)
    folder_watching = models.BooleanField(default=True)
    manage_collections = models.BooleanField(default=True)
    allow_scrobbling = models.BooleanField(default=True)
    enable_metadata = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_scanned = models.DateTimeField(null=True, blank=True)
    users = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="libraries", blank=True
    )

    class Meta:
        db_table = "library_library"
        verbose_name = "Biblioteca"
        verbose_name_plural = "Bibliotecas"
        ordering = ["name"]

    def __str__(self):
        return self.name


# ─── Series ──────────────────────────────────────────────────────────────────

class Series(models.Model):
    library = models.ForeignKey(Library, on_delete=models.CASCADE, related_name="series")
    name = models.CharField(max_length=500)
    sort_name = models.CharField(max_length=500)
    localized_name = models.CharField(max_length=500, blank=True)
    original_name = models.CharField(max_length=500, blank=True)
    cover_image = models.ImageField(upload_to="series_covers/", blank=True, null=True)
    folder_path = models.TextField(blank=True)
    pages = models.IntegerField(default=0)
    word_count = models.BigIntegerField(default=0)
    min_hours_to_read = models.FloatField(default=0)
    max_hours_to_read = models.FloatField(default=0)
    avg_hours_to_read = models.FloatField(default=0)
    # External IDs
    anilist_id = models.IntegerField(null=True, blank=True)
    mal_id = models.IntegerField(null=True, blank=True)
    # Control
    dont_match = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)
    last_folder_scanned = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "library_series"
        verbose_name = "Série"
        verbose_name_plural = "Séries"
        ordering = ["sort_name"]
        unique_together = [("library", "name")]
        indexes = [
            models.Index(fields=["library", "sort_name"]),
            models.Index(fields=["anilist_id"]),
            models.Index(fields=["mal_id"]),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.sort_name:
            self.sort_name = self.name
        super().save(*args, **kwargs)


class SeriesMetadata(models.Model):
    series = models.OneToOneField(Series, on_delete=models.CASCADE, related_name="metadata")
    summary = models.TextField(blank=True)
    language = models.CharField(max_length=10, blank=True)
    release_year = models.IntegerField(null=True, blank=True)
    publisher = models.CharField(max_length=255, blank=True)
    rating = models.FloatField(null=True, blank=True)
    age_rating = models.IntegerField(choices=AgeRating.choices, default=AgeRating.UNKNOWN)
    publication_status = models.CharField(
        max_length=20, choices=PublicationStatus.choices, default=PublicationStatus.UNKNOWN
    )
    total_count = models.IntegerField(default=0)
    max_count = models.IntegerField(default=0)
    web_links = models.JSONField(default=list)
    genres = models.ManyToManyField(Genre, blank=True, related_name="series")
    tags = models.ManyToManyField(Tag, blank=True, related_name="series")
    people = models.ManyToManyField(Person, blank=True, related_name="series")
    # Locks (impede sobrescrita automática)
    summary_locked = models.BooleanField(default=False)
    genres_locked = models.BooleanField(default=False)
    tags_locked = models.BooleanField(default=False)
    people_locked = models.BooleanField(default=False)
    language_locked = models.BooleanField(default=False)
    publication_status_locked = models.BooleanField(default=False)
    release_year_locked = models.BooleanField(default=False)

    class Meta:
        db_table = "library_series_metadata"

    def __str__(self):
        return f"Metadata: {self.series.name}"


class SeriesRelation(models.Model):
    class RelationType(models.TextChoices):
        SEQUEL = "sequel", "Sequel"
        PREQUEL = "prequel", "Prequel"
        SPIN_OFF = "spin_off", "Spin-off"
        ADAPTATION = "adaptation", "Adaptation"
        ALTERNATIVE = "alternative", "Alternative"
        CONTAINS = "contains", "Contains"
        SIDE_STORY = "side_story", "Side Story"

    series = models.ForeignKey(Series, on_delete=models.CASCADE, related_name="relations")
    target = models.ForeignKey(Series, on_delete=models.CASCADE, related_name="related_to")
    relation_type = models.CharField(max_length=20, choices=RelationType.choices)

    class Meta:
        db_table = "library_series_relation"
        unique_together = [("series", "target", "relation_type")]


# ─── Volume ──────────────────────────────────────────────────────────────────

class Volume(models.Model):
    series = models.ForeignKey(Series, on_delete=models.CASCADE, related_name="volumes")
    name = models.CharField(max_length=255)
    min_number = models.FloatField(default=0)
    max_number = models.FloatField(default=0)
    cover_image = models.ImageField(upload_to="volume_covers/", blank=True, null=True)
    pages = models.IntegerField(default=0)
    word_count = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "library_volume"
        ordering = ["min_number"]
        unique_together = [("series", "name")]

    def __str__(self):
        return f"{self.series.name} — {self.name}"


# ─── Chapter ─────────────────────────────────────────────────────────────────

class Chapter(models.Model):
    volume = models.ForeignKey(Volume, on_delete=models.CASCADE, related_name="chapters")
    title = models.CharField(max_length=500, blank=True)
    title_name = models.CharField(max_length=500, blank=True)
    range = models.CharField(max_length=100, blank=True)
    min_number = models.FloatField(default=0)
    max_number = models.FloatField(default=0)
    sort_order = models.FloatField(default=0)
    is_special = models.BooleanField(default=False)
    cover_image = models.ImageField(upload_to="chapter_covers/", blank=True, null=True)
    pages = models.IntegerField(default=0)
    word_count = models.BigIntegerField(default=0)
    # Book fields
    isbn = models.CharField(max_length=20, blank=True)
    release_date = models.DateField(null=True, blank=True)
    summary = models.TextField(blank=True)
    language = models.CharField(max_length=10, blank=True)
    age_rating = models.IntegerField(choices=AgeRating.choices, default=AgeRating.UNKNOWN)
    # Taxonomy
    genres = models.ManyToManyField(Genre, blank=True, related_name="chapters")
    tags = models.ManyToManyField(Tag, blank=True, related_name="chapters")
    people = models.ManyToManyField(Person, blank=True, related_name="chapters")
    created_at = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "library_chapter"
        ordering = ["sort_order", "min_number"]

    def __str__(self):
        return f"{self.volume} — Cap. {self.range or self.min_number}"

    @property
    def series(self):
        return self.volume.series

    @property
    def library(self):
        return self.volume.series.library


# ─── MangaFile ───────────────────────────────────────────────────────────────

class MangaFile(models.Model):
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name="files")
    file_path = models.TextField(unique=True)
    pages = models.IntegerField(default=0)
    format = models.CharField(max_length=10, choices=FileFormat.choices, default=FileFormat.UNKNOWN)
    bytes = models.BigIntegerField(default=0)
    extension = models.CharField(max_length=10, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(null=True, blank=True)
    last_file_analysis = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "library_manga_file"

    def __str__(self):
        return self.file_path
