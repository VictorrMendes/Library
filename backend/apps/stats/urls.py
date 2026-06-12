from django.urls import path
from . import views

urlpatterns = [
    path("me/", views.my_stats, name="my-stats"),
    path("history/", views.ReadingHistoryView.as_view(), name="reading-history"),
    path("series/<int:series_id>/", views.series_stats, name="series-stats"),
    path("goals/", views.ReadingGoalView.as_view(), name="reading-goals"),
    path(
        "goals/<int:goal_id>/",
        views.ReadingGoalView.as_view(),
        name="reading-goal-detail",
    ),
]
