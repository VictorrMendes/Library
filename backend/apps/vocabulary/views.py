import csv
from datetime import timedelta

from django.utils.timezone import now
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import HttpResponse
from django.db.models import Q

from .models import VocabularyEntry
from .serializers import VocabularyEntrySerializer, ReviewSerializer


class VocabularyListCreateView(generics.ListCreateAPIView):
    serializer_class = VocabularyEntrySerializer

    def get_queryset(self):
        qs = VocabularyEntry.objects.filter(user=self.request.user)

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        direction = self.request.query_params.get("direction")
        if direction:
            qs = qs.filter(direction=direction)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(word__icontains=search) | Q(translation__icontains=search)
            )

        due_today = self.request.query_params.get("due_today")
        if due_today and due_today.lower() == "true":
            qs = qs.filter(next_review_at__lte=now())

        return qs

    def perform_create(self, serializer):
        # Update if (user, word, direction) already exists; otherwise create.
        word = serializer.validated_data.get("word")
        direction = serializer.validated_data.get("direction", "en-pt")
        existing = VocabularyEntry.objects.filter(
            user=self.request.user, word=word, direction=direction
        ).first()
        if existing:
            for attr, value in serializer.validated_data.items():
                setattr(existing, attr, value)
            existing.save()
            # Replace the serializer instance so that the response reflects
            # the updated object.
            serializer.instance = existing
        else:
            serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )


class VocabularyDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = VocabularyEntrySerializer

    def get_queryset(self):
        return VocabularyEntry.objects.filter(user=self.request.user)


class ReviewView(APIView):

    def post(self, request):
        serializer = ReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        entry_id = serializer.validated_data["entry_id"]
        quality = serializer.validated_data["quality"]

        try:
            entry = VocabularyEntry.objects.get(
                pk=entry_id, user=request.user
            )
        except VocabularyEntry.DoesNotExist:
            return Response(
                {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # SM-2 simplified algorithm
        if quality < 3:
            interval = 1
            review_count = 0
        else:
            if entry.review_count == 0:
                interval = 1
            elif entry.review_count == 1:
                interval = 6
            else:
                interval = round(entry.interval_days * entry.ease_factor)
            entry.ease_factor = max(
                1.3,
                entry.ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
            )
            review_count = entry.review_count + 1

        entry.interval_days = interval
        entry.review_count = review_count
        entry.next_review_at = now() + timedelta(days=interval)
        entry.last_reviewed_at = now()
        entry.status = (
            "known"
            if entry.review_count >= 5
            else "learning"
            if entry.review_count >= 1
            else "new"
        )
        entry.save()

        return Response(VocabularyEntrySerializer(entry).data)


class ExportAnkiView(APIView):

    def get(self, request):
        entries = VocabularyEntry.objects.filter(user=request.user)
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="vocabulary.csv"'

        writer = csv.writer(response, delimiter="\t")
        writer.writerow(["word", "translation", "definition", "example", "context_sentence"])
        for entry in entries:
            writer.writerow([
                entry.word,
                entry.translation,
                entry.definition,
                entry.example,
                entry.context_sentence,
            ])

        return response


class VocabularyStatsView(APIView):

    def get(self, request):
        qs = VocabularyEntry.objects.filter(user=request.user)
        total = qs.count()
        new_count = qs.filter(status="new").count()
        learning_count = qs.filter(status="learning").count()
        known_count = qs.filter(status="known").count()
        due_today_count = qs.filter(next_review_at__lte=now()).count()

        # Count consecutive days with at least 1 review ending today (or most recent review day)
        streak_days = self._calculate_streak(request.user)

        return Response({
            "total": total,
            "new": new_count,
            "learning": learning_count,
            "known": known_count,
            "due_today": due_today_count,
            "streak_days": streak_days,
        })

    def _calculate_streak(self, user):
        """Return the number of consecutive days (ending today) on which the
        user performed at least one vocabulary review."""
        from django.utils.timezone import localdate
        import datetime

        # Collect all distinct dates where last_reviewed_at is set
        reviewed_dates = set(
            VocabularyEntry.objects.filter(
                user=user, last_reviewed_at__isnull=False
            )
            .values_list("last_reviewed_at", flat=True)
            .distinct()
        )

        if not reviewed_dates:
            return 0

        # Convert to local dates
        local_dates = set(dt.date() for dt in reviewed_dates)
        today = localdate()

        # If today hasn't been reviewed, start streak check from yesterday
        if today not in local_dates:
            check_day = today - datetime.timedelta(days=1)
        else:
            check_day = today

        if check_day not in local_dates:
            return 0

        streak = 0
        while check_day in local_dates:
            streak += 1
            check_day -= datetime.timedelta(days=1)

        return streak
