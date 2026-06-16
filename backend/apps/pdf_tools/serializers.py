from rest_framework import serializers
from .models import PdfJob


class PdfJobSerializer(serializers.ModelSerializer):
    result_url = serializers.SerializerMethodField()

    class Meta:
        model = PdfJob
        fields = [
            'id',
            'operation',
            'status',
            'error_message',
            'created_at',
            'updated_at',
            'result_url',
        ]
        read_only_fields = fields

    def get_result_url(self, obj):
        if not obj.result_path:
            return None
        request = self.context.get('request')
        url = f'/api/pdf-tools/jobs/{obj.pk}/download/'
        if request is not None:
            return request.build_absolute_uri(url)
        return url


# ------------------------------------------------------------------ #
# Request serializers                                                   #
# ------------------------------------------------------------------ #

class CompressRequestSerializer(serializers.Serializer):
    manga_file_id = serializers.IntegerField()
    optimize_level = serializers.IntegerField(min_value=1, max_value=9, default=3)


class OcrRequestSerializer(serializers.Serializer):
    manga_file_id = serializers.IntegerField()
    languages = serializers.CharField(default='por,eng')


class RemovePasswordRequestSerializer(serializers.Serializer):
    manga_file_id = serializers.IntegerField()
    password = serializers.CharField(default='', allow_blank=True)


class SplitRequestSerializer(serializers.Serializer):
    manga_file_id = serializers.IntegerField()
    # Example: "1,5,10"
    page_numbers = serializers.CharField()


class MergeRequestSerializer(serializers.Serializer):
    manga_file_ids = serializers.ListField(child=serializers.IntegerField(), min_length=2)


class MetadataRequestSerializer(serializers.Serializer):
    manga_file_id = serializers.IntegerField()
    title = serializers.CharField(required=False, allow_blank=True)
    author = serializers.CharField(required=False, allow_blank=True)
    subject = serializers.CharField(required=False, allow_blank=True)
    keywords = serializers.CharField(required=False, allow_blank=True)
    producer = serializers.CharField(required=False, allow_blank=True)
    creator = serializers.CharField(required=False, allow_blank=True)
