from rest_framework import serializers
from .models import Collection, ReadingList, ReadingListItem, WantToRead, SmartFilter
from apps.library.serializers import SeriesListSerializer, ChapterSerializer


class CollectionSerializer(serializers.ModelSerializer):
    series_count = serializers.SerializerMethodField()

    class Meta:
        model = Collection
        fields = [
            "id", "title", "summary", "cover_image",
            "is_promoted", "series_count", "created_at", "last_modified",
        ]
        read_only_fields = ["id", "created_at", "last_modified"]

    def get_series_count(self, obj):
        return obj.series.count()


class CollectionDetailSerializer(CollectionSerializer):
    series = SeriesListSerializer(many=True, read_only=True)

    class Meta(CollectionSerializer.Meta):
        fields = CollectionSerializer.Meta.fields + ["series"]


class ReadingListItemSerializer(serializers.ModelSerializer):
    chapter_title = serializers.CharField(source="chapter.title_name", read_only=True)
    series_id = serializers.SerializerMethodField()
    series_name = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()

    class Meta:
        model = ReadingListItem
        fields = ["id", "chapter_id", "chapter_title", "series_id", "series_name", "cover_image", "order"]

    def get_series_id(self, obj):
        return obj.chapter.volume.series_id

    def get_series_name(self, obj):
        return obj.chapter.volume.series.name

    def get_cover_image(self, obj):
        return obj.chapter.volume.series.cover_image.url if obj.chapter.volume.series.cover_image else None


class ReadingListSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = ReadingList
        fields = [
            "id", "title", "summary", "cover_image",
            "is_promoted", "item_count", "created_at", "last_modified",
        ]
        read_only_fields = ["id", "created_at", "last_modified"]

    def get_item_count(self, obj):
        return obj.items.count()


class WantToReadSerializer(serializers.ModelSerializer):
    series = SeriesListSerializer(read_only=True)

    class Meta:
        model = WantToRead
        fields = ["id", "series_id", "series", "added_at"]
        read_only_fields = ["id", "added_at", "series"]


class SmartFilterSerializer(serializers.ModelSerializer):
    class Meta:
        model = SmartFilter
        fields = ["id", "name", "criteria", "sort_by", "sort_asc", "created_at"]
        read_only_fields = ["id", "created_at"]
