from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", views.MeView.as_view(), name="me"),
    path("me/password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("me/preferences/", views.UpdatePreferencesView.as_view(), name="preferences"),
    path("users/", views.UserListView.as_view(), name="user-list"),
    path("users/<int:pk>/", views.UserDetailView.as_view(), name="user-detail"),
    path("api-keys/", views.api_keys, name="api-keys"),
    path("api-keys/<int:pk>/", views.revoke_api_key, name="revoke-api-key"),
    path("scrobble-credentials/", views.scrobble_credentials, name="scrobble-credentials"),
    path("scrobble-credentials/<str:provider>/", views.revoke_scrobble_credential, name="revoke-scrobble-credential"),
    path("me/export/", views.export_progress, name="export-progress"),
    path("me/annotations/export/", views.export_annotations, name="export-annotations"),
    path("me/backup/", views.backup_database, name="backup-database"),
    path("version/", views.check_version, name="check-version"),
    path("device-profiles/", views.device_profiles, name="device-profiles"),
    path("device-profiles/<int:pk>/", views.delete_device_profile, name="device-profile-delete"),
    path("scrobble-errors/", views.scrobble_errors, name="scrobble-errors"),
    path("scrobble-errors/<int:pk>/resolve/", views.resolve_scrobble_error, name="resolve-scrobble-error"),
]
