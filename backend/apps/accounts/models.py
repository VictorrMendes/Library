from django.contrib.auth.models import AbstractUser
from django.db import models


class AgeRating(models.IntegerChoices):
    UNKNOWN = 0, "Unknown"
    EVERYONE = 1, "Everyone"
    TEEN = 2, "Teen"
    MATURE = 3, "Mature"
    ADULTS_ONLY = 4, "Adults Only"


class IdentityProvider(models.TextChoices):
    LOCAL = "local", "Local"
    OIDC = "oidc", "OpenID Connect"


class UserRole(models.TextChoices):
    ADMIN = "admin", "Admin"
    USER = "user", "User"
    READ_ONLY = "read_only", "Read Only"


class User(AbstractUser):
    email = models.EmailField(unique=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    primary_color = models.CharField(max_length=7, blank=True, default="#6366f1")
    age_restriction = models.IntegerField(
        choices=AgeRating.choices, default=AgeRating.UNKNOWN
    )
    age_restriction_include_unknowns = models.BooleanField(default=True)
    identity_provider = models.CharField(
        max_length=10, choices=IdentityProvider.choices, default=IdentityProvider.LOCAL
    )
    oidc_id = models.CharField(max_length=255, blank=True)
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.USER)
    created_at = models.DateTimeField(auto_now_add=True)
    last_active = models.DateTimeField(null=True, blank=True)

    # Preferences
    reading_direction = models.CharField(
        max_length=20,
        choices=[("ltr", "Left to Right"), ("rtl", "Right to Left"), ("ttb", "Top to Bottom")],
        default="ltr",
    )
    reading_mode = models.CharField(
        max_length=20,
        choices=[("single", "Single Page"), ("double", "Double Page"), ("webtoon", "Webtoon")],
        default="single",
    )
    scaling = models.CharField(
        max_length=20,
        choices=[("fit_screen", "Fit Screen"), ("fit_height", "Fit Height"), ("fit_width", "Fit Width"), ("original", "Original")],
        default="fit_screen",
    )
    theme = models.CharField(max_length=20, default="dark")
    book_font_size = models.IntegerField(default=16)
    book_font_family = models.CharField(max_length=100, default="serif")
    book_line_spacing = models.FloatField(default=1.5)
    blur_unread_summaries = models.BooleanField(default=False)
    dashboard_sections = models.JSONField(
        default=list,
        help_text="Ordered list of section keys visible on dashboard",
    )

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        db_table = "accounts_user"
        verbose_name = "Usuário"
        verbose_name_plural = "Usuários"

    def __str__(self):
        return self.username

    @property
    def is_admin(self):
        return self.role == UserRole.ADMIN


class ScrobbleProvider(models.TextChoices):
    ANILIST = "anilist", "AniList"
    MAL = "mal", "MyAnimeList"


class ScrobbleCredential(models.Model):
    user = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="scrobble_credentials"
    )
    provider = models.CharField(max_length=20, choices=ScrobbleProvider.choices)
    access_token = models.TextField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "accounts_scrobble_credential"
        unique_together = [("user", "provider")]

    def __str__(self):
        return f"{self.user.username} — {self.provider}"


class ApiKey(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="api_keys")
    key = models.CharField(max_length=64, unique=True)
    label = models.CharField(max_length=100, default="OPDS")
    created_at = models.DateTimeField(auto_now_add=True)
    last_used = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "accounts_api_key"

    def __str__(self):
        return f"{self.user.username} — {self.label}"


class ScrobbleError(models.Model):
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="scrobble_errors"
    )
    provider = models.CharField(max_length=20, choices=ScrobbleProvider.choices)
    series_name = models.CharField(max_length=500)
    anilist_id = models.IntegerField(null=True, blank=True)
    mal_id = models.IntegerField(null=True, blank=True)
    error_message = models.TextField()
    attempted_at = models.DateTimeField(auto_now_add=True)
    retry_count = models.IntegerField(default=0)
    resolved = models.BooleanField(default=False)

    class Meta:
        db_table = "accounts_scrobble_error"
        ordering = ["-attempted_at"]

    def __str__(self):
        return f"{self.user.username} — {self.provider} error @ {self.attempted_at:%Y-%m-%d}"


class DeviceProfile(models.Model):
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="device_profiles"
    )
    device_name = models.CharField(max_length=100)
    reading_direction = models.CharField(max_length=20, blank=True)
    reading_mode = models.CharField(max_length=20, blank=True)
    scaling = models.CharField(max_length=20, blank=True)
    book_font_size = models.IntegerField(null=True, blank=True)
    book_font_family = models.CharField(max_length=100, blank=True)
    book_line_spacing = models.FloatField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accounts_device_profile"
        unique_together = [("user", "device_name")]
        ordering = ["device_name"]

    def __str__(self):
        return f"{self.user.username} — {self.device_name}"
