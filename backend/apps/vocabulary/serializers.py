from rest_framework import serializers
from .models import VocabularyEntry


class VocabularyEntrySerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = VocabularyEntry
        fields = "__all__"


class ReviewSerializer(serializers.Serializer):
    entry_id = serializers.IntegerField()
    quality = serializers.IntegerField(min_value=0, max_value=5)
