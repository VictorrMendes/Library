from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register("libraries", views.LibraryViewSet, basename="library")
router.register("series", views.SeriesViewSet, basename="series")
router.register("volumes", views.VolumeViewSet, basename="volume")
router.register("chapters", views.ChapterViewSet, basename="chapter")
router.register("genres", views.GenreViewSet, basename="genre")
router.register("tags", views.TagViewSet, basename="tag")
router.register("people", views.PersonViewSet, basename="person")

urlpatterns = [
    path("", include(router.urls)),
]
