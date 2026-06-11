from django.urls import path
from . import views

urlpatterns = [
    path("jobs/", views.ScanJobListView.as_view(), name="scan-jobs"),
    path("scan-all/", views.scan_all, name="scan-all"),
    path("upload/", views.upload_file, name="upload-file"),
    path("uploads/", views.UploadJobListView.as_view(), name="upload-jobs"),
    path(
        "uploads/<int:pk>/",
        views.UploadJobDetailView.as_view(),
        name="upload-job-detail",
    ),
]
