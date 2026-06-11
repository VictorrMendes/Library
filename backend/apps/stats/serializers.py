from rest_framework import serializers
from .models import ReadingHistory, UserStats


class ReadingHistorySerializer(serializers.ModelSerializer):
    series_name = serializers.CharField(source="series.name", read_only=True)
    cover_image = serializers.ImageField(source="series.cover_image", read_only=True)

    class Meta:
        model = ReadingHistory
        fields = ["id", "series_id", "series_name", "cover_image", "pages_read", "read_at"]


class UserStatsSerializer(serializers.ModelSerializer):
    total_reading_hours = serializers.FloatField(read_only=True)

    class Meta:
        model = UserStats
        fields = [
            "total_pages_read", "total_chapters_read",
            "total_series_read", "total_reading_time_minutes",
            "total_reading_hours", "last_aggregated",
        ]
