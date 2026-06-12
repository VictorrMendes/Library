from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import ScrobbleCredential

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id", "username", "email", "role", "avatar",
            "primary_color", "age_restriction", "identity_provider",
            "reading_direction", "reading_mode", "scaling", "theme",
            "book_font_size", "book_font_family", "book_line_spacing",
            "blur_unread_summaries", "dashboard_sections",
            "created_at", "last_active",
        ]
        read_only_fields = ["id", "created_at", "last_active", "identity_provider"]


class ScrobbleCredentialSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScrobbleCredential
        fields = ["id", "provider", "access_token", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"access_token": {"write_only": True}}


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ["username", "email", "password"]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Senha atual incorreta.")
        return value


class UpdatePreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "reading_direction", "reading_mode", "scaling", "theme",
            "book_font_size", "book_font_family", "book_line_spacing",
            "blur_unread_summaries", "primary_color", "age_restriction",
            "dashboard_sections",
        ]
