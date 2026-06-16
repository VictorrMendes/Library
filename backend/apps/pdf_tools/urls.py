from django.urls import path
from .views import (
    CompressView,
    RepairView,
    RemovePasswordView,
    MergeView,
    SplitView,
    UpdateMetadataView,
    ExtractImagesView,
    OcrView,
    PdfToEpubView,
    JobStatusView,
    JobDownloadView,
)

urlpatterns = [
    path('compress/', CompressView.as_view()),
    path('repair/', RepairView.as_view()),
    path('remove-password/', RemovePasswordView.as_view()),
    path('merge/', MergeView.as_view()),
    path('split/', SplitView.as_view()),
    path('update-metadata/', UpdateMetadataView.as_view()),
    path('extract-images/', ExtractImagesView.as_view()),
    path('ocr/', OcrView.as_view()),
    path('pdf-to-epub/', PdfToEpubView.as_view()),
    path('jobs/<int:pk>/', JobStatusView.as_view()),
    path('jobs/<int:pk>/download/', JobDownloadView.as_view()),
]
