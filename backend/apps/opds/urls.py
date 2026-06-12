from django.urls import path
from .views import OpdsCatalogView, OpdsLibraryView

urlpatterns = [
    path("", OpdsCatalogView.as_view(), name="opds-catalog"),
    path("library/<int:library_id>/", OpdsLibraryView.as_view(), name="opds-library"),
]
