from rest_framework import serializers
from .models import Library, Series, SeriesMetadata, Volume, Chapter, MangaFile, Genre, Tag, Person


class GenreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Genre
        fields = ["id", "name"]


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name"]


class PersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Person
        fields = ["id", "name", "role", "cover_image"]


class LibrarySerializer(serializers.ModelSerializer):
    series_count = serializers.SerializerMethodField()

    class Meta:
        model = Library
        fields = [
            "id", "name", "type", "cover_image", "folder_paths",
            "include_in_dashboard", "include_in_search", "include_in_recommended",
            "folder_watching", "manage_collections", "allow_scrobbling",
            "enable_metadata", "last_scanned", "created_at", "series_count",
        ]
        read_only_fields = ["id", "last_scanned", "created_at"]

    def get_series_count(self, obj):
        return obj.series.count()

    def validate_folder_paths(self, value):
        if not value:
            raise serializers.ValidationError(
                "Informe ao menos uma pasta, ex: /manga"
            )
        for path in value:
            if not path.startswith("/"):
                raise serializers.ValidationError(
                    f"'{path}' não é um caminho absoluto. "
                    "Use caminhos absolutos começando com '/', ex: /manga"
                )
        return value


class SeriesMetadataSerializer(serializers.ModelSerializer):
    genres = GenreSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    people = PersonSerializer(many=True, read_only=True)
    genre_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Genre.objects.all(), source="genres", write_only=True, required=False
    )
    tag_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Tag.objects.all(), source="tags", write_only=True, required=False
    )

    class Meta:
        model = SeriesMetadata
        fields = [
            "id", "summary", "language", "release_year", "publication_status",
            "total_count", "max_count", "web_links",
            "genres", "genre_ids", "tags", "tag_ids", "people",
            "summary_locked", "genres_locked", "tags_locked",
            "people_locked", "language_locked", "publication_status_locked", "release_year_locked",
        ]


class SeriesListSerializer(serializers.ModelSerializer):
    metadata = SeriesMetadataSerializer(read_only=True)
    user_progress_pct = serializers.SerializerMethodField()

    class Meta:
        model = Series
        fields = [
            "id", "name", "sort_name", "localized_name", "original_name",
            "cover_image", "pages", "library_id", "metadata",
            "avg_hours_to_read", "created_at", "last_modified",
            "user_progress_pct",
        ]

    def get_user_progress_pct(self, obj):
        pages_read = getattr(obj, "user_pages_read", 0) or 0
        if obj.pages > 0:
            return min(100, int(pages_read / obj.pages * 100))
        return 0


class MangaFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = MangaFile
        fields = ["id", "file_path", "pages", "format", "bytes", "extension", "last_modified"]


class ChapterSerializer(serializers.ModelSerializer):
    files = MangaFileSerializer(many=True, read_only=True)

    class Meta:
        model = Chapter
        fields = [
            "id", "title", "title_name", "range", "min_number", "max_number",
            "sort_order", "is_special", "cover_image", "pages", "word_count",
            "isbn", "release_date", "summary", "language", "age_rating",
            "volume_id", "created_at", "files",
        ]
        read_only_fields = ["id", "created_at"]


class VolumeSerializer(serializers.ModelSerializer):
    chapters = ChapterSerializer(many=True, read_only=True)

    class Meta:
        model = Volume
        fields = [
            "id", "name", "min_number", "max_number", "cover_image",
            "pages", "series_id", "chapters",
        ]


class SeriesDetailSerializer(serializers.ModelSerializer):
    metadata = SeriesMetadataSerializer(read_only=True)
    volumes = VolumeSerializer(many=True, read_only=True)

    class Meta:
        model = Series
        fields = [
            "id", "name", "sort_name", "localized_name", "original_name",
            "cover_image", "folder_path", "pages", "word_count",
            "min_hours_to_read", "max_hours_to_read", "avg_hours_to_read",
            "anilist_id", "mal_id", "dont_match",
            "library_id", "metadata", "volumes",
            "created_at", "last_modified",
        ]
