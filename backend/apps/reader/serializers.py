from rest_framework import serializers
from .models import ReadingProgress, ReadingSession, Bookmark, Annotation


class ReadingProgressSerializer(serializers.ModelSerializer):
    is_completed = serializers.BooleanField(read_only=True)

    class Meta:
        model = ReadingProgress
        fields = [
            "id", "chapter_id", "series_id", "library_id",
            "pages_read", "book_scroll_id", "total_reads",
            "is_completed", "created_at", "last_modified",
        ]
        read_only_fields = ["id", "created_at", "last_modified", "total_reads"]


class UpdateProgressSerializer(serializers.Serializer):
    chapter_id = serializers.IntegerField()
    pages_read = serializers.IntegerField(min_value=0)
    book_scroll_id = serializers.CharField(required=False, allow_blank=True)


class BookmarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bookmark
        fields = ["id", "chapter_id", "page", "book_scroll_id", "created_at"]
        read_only_fields = ["id", "created_at"]


class AnnotationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Annotation
        fields = [
            "id", "chapter_id", "book_scroll_id",
            "highlighted_text", "note", "color",
            "created_at", "last_modified",
        ]
        read_only_fields = ["id", "created_at", "last_modified"]


class ReadingSessionSerializer(serializers.ModelSerializer):
    duration_minutes = serializers.IntegerField(read_only=True)

    class Meta:
        model = ReadingSession
        fields = [
            "id", "series_id", "chapter_id", "started_at",
            "ended_at", "pages_read", "duration_minutes",
        ]
        read_only_fields = ["id", "started_at"]
