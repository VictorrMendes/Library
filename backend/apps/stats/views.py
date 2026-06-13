from datetime import timedelta
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import generics, permissions
from rest_framework.views import APIView
from django.db.models import Sum
from django.shortcuts import get_object_or_404
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


@api_view(["GET"])
def activity_graph(request):
    days = int(request.GET.get("days", 90))
    cutoff = timezone.now().date() - timedelta(days=days)
    data = (
        ReadingHistory.objects
        .filter(user=request.user, read_at__gte=cutoff)
        .values("read_at")
        .annotate(pages=Sum("pages_read"))
        .order_by("read_at")
    )
    return Response([{"date": str(d["read_at"]), "pages": d["pages"]} for d in data])


@api_view(["GET"])
def reading_heatmap(request):
    from apps.reader.models import ReadingSession
    from django.db.models.functions import ExtractHour, ExtractWeekDay
    from django.db.models import Count
    by_hour = (
        ReadingSession.objects
        .filter(user=request.user, ended_at__isnull=False)
        .annotate(hour=ExtractHour("started_at"))
        .values("hour")
        .annotate(count=Count("id"))
        .order_by("hour")
    )
    by_weekday = (
        ReadingSession.objects
        .filter(user=request.user, ended_at__isnull=False)
        .annotate(weekday=ExtractWeekDay("started_at"))
        .values("weekday")
        .annotate(count=Count("id"))
        .order_by("weekday")
    )
    return Response({"by_hour": list(by_hour), "by_weekday": list(by_weekday)})


@api_view(["GET"])
def estimate_completion(request, series_id):
    from apps.library.models import Chapter, Series
    from apps.reader.models import ReadingProgress
    series = get_object_or_404(Series, pk=series_id)
    recent = list(
        ReadingHistory.objects.filter(user=request.user).order_by("-read_at")[:30]
    )
    total_hist_pages = sum(h.pages_read for h in recent)
    avg_per_day = total_hist_pages / max(len(recent), 1)
    total_pages = (
        Chapter.objects.filter(volume__series=series).aggregate(t=Sum("pages"))["t"] or 0
    )
    read_pages = (
        ReadingProgress.objects.filter(user=request.user, series=series)
        .aggregate(t=Sum("pages_read"))["t"] or 0
    )
    remaining = max(total_pages - read_pages, 0)
    return Response({
        "series_id": series_id,
        "total_pages": total_pages,
        "read_pages": read_pages,
        "remaining_pages": remaining,
        "avg_pages_per_day": round(avg_per_day, 1),
        "estimated_days": round(remaining / max(avg_per_day, 1), 1),
    })
