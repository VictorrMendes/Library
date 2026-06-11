from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register("collections", views.CollectionViewSet, basename="collection")
router.register("reading-lists", views.ReadingListViewSet, basename="reading-list")
router.register("want-to-read", views.WantToReadViewSet, basename="want-to-read")
router.register("smart-filters", views.SmartFilterViewSet, basename="smart-filter")

urlpatterns = [path("", include(router.urls))]
