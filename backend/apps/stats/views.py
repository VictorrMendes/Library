from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import generics, permissions
from rest_framework.views import APIView
from django.utils import timezone
from .models import ReadingHistory, UserStats, ReadingGoal
from .serializers import ReadingHistorySerializer, UserStatsSerializer


@api_view(["GET"])
def my_stats(request):
    stats, _ = UserStats.objects.get_or_create(user=request.user)
    return Response(UserStatsSerializer(stats).data)


class ReadingHistoryView(generics.ListAPIView):
    serializer_class = ReadingHistorySerializer

    def get_queryset(self):
        return ReadingHistory.objects.filter(
            user=self.request.user
        ).select_related("series").order_by("-read_at")[:100]


@api_view(["GET"])
def series_stats(request, series_id):
    from apps.reader.models import ReadingProgress
    progress = ReadingProgress.objects.filter(
        user=request.user, series_id=series_id
    )
    total_pages = sum(p.pages_read for p in progress)
    chapters_read = progress.filter(pages_read__gt=0).count()
    return Response({
        "series_id": series_id,
        "total_pages_read": total_pages,
        "chapters_read": chapters_read,
    })


class ReadingGoalView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        goals = ReadingGoal.objects.filter(
            user=request.user, year=now.year
        )
        data = []
        for g in goals:
            data.append({
                "id": g.id,
                "period": g.period,
                "metric": g.metric,
                "target": g.target,
                "year": g.year,
                "month": g.month,
                "progress": g.progress,
            })
        return Response(data)

    def post(self, request):
        now = timezone.now()
        period = request.data.get("period", "monthly")
        metric = request.data.get("metric", "pages")
        target = int(request.data.get("target", 0))
        month = now.month if period == "monthly" else None
        goal, _ = ReadingGoal.objects.update_or_create(
            user=request.user,
            period=period,
            metric=metric,
            year=now.year,
            month=month,
            defaults={"target": target},
        )
        return Response({
            "id": goal.id,
            "period": goal.period,
            "metric": goal.metric,
            "target": goal.target,
            "year": goal.year,
            "month": goal.month,
            "progress": goal.progress,
        }, status=201)

    def delete(self, request, goal_id):
        ReadingGoal.objects.filter(
            user=request.user, id=goal_id
        ).delete()
        return Response(status=204)
