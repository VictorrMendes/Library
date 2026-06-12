from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/account/", include("apps.accounts.urls")),
    path("api/library/", include("apps.library.urls")),
    path("api/reader/", include("apps.reader.urls")),
    path("api/scanner/", include("apps.scanner.urls")),
    path("api/collections/", include("apps.collections.urls")),
    path("api/stats/", include("apps.stats.urls")),
    path("opds/", include("apps.opds.urls")),
    re_path(
        r"^media/(?P<path>.*)$",
        serve,
        {"document_root": settings.MEDIA_ROOT},
    ),
]
