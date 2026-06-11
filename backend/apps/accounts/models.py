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
