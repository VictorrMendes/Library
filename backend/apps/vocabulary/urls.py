from django.urls import path
from .views import (
    VocabularyListCreateView,
    VocabularyDetailView,
    ReviewView,
    ExportAnkiView,
    VocabularyStatsView,
)

urlpatterns = [
    path("", VocabularyListCreateView.as_view()),
    path("<int:pk>/", VocabularyDetailView.as_view()),
    path("review/", ReviewView.as_view()),
    path("export/anki/", ExportAnkiView.as_view()),
    path("stats/", VocabularyStatsView.as_view()),
]
