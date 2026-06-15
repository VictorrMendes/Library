from datetime import timedelta

from django.utils.timezone import now
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.vocabulary.models import VocabularyEntry


def make_user(username="testuser", email="t@t.com", password="pass123"):
    return User.objects.create_user(
        username=username, email=email, password=password
    )


def make_entry(user, word="hello", translation="olá", direction="en-pt", **kwargs):
    return VocabularyEntry.objects.create(
        user=user,
        word=word,
        translation=translation,
        direction=direction,
        **kwargs,
    )


# ─── Model ───────────────────────────────────────────────────────────────────

class VocabularyEntryModelTest(APITestCase):

    def setUp(self):
        self.user = make_user()

    def test_str_returns_username_and_word(self):
        entry = make_entry(self.user, word="book")
        self.assertEqual(str(entry), f"{self.user.username}: book")

    def test_default_status_is_new(self):
        entry = make_entry(self.user)
        self.assertEqual(entry.status, "new")

    def test_default_ease_factor(self):
        entry = make_entry(self.user)
        self.assertAlmostEqual(entry.ease_factor, 2.5)

    def test_unique_together_user_word_direction(self):
        make_entry(self.user, word="run", direction="en-pt")
        from django.db import IntegrityError
        with self.assertRaises(Exception):
            VocabularyEntry.objects.create(
                user=self.user, word="run", translation="correr", direction="en-pt"
            )

    def test_same_word_different_direction_allowed(self):
        make_entry(self.user, word="run", direction="en-pt")
        # Different direction must not raise
        entry2 = make_entry(self.user, word="run", direction="pt-en")
        self.assertIsNotNone(entry2.pk)

    def test_same_word_different_user_allowed(self):
        user2 = make_user(username="other", email="o@t.com")
        make_entry(self.user, word="run")
        entry2 = make_entry(user2, word="run")
        self.assertIsNotNone(entry2.pk)


# ─── List / Create ───────────────────────────────────────────────────────────

class VocabularyListCreateTest(APITestCase):
    URL = "/api/vocabulary/"

    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(user=self.user)

    def test_create_entry_returns_201(self):
        response = self.client.post(self.URL, {
            "word": "apple",
            "translation": "maçã",
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(VocabularyEntry.objects.filter(word="apple").exists())

    def test_list_returns_only_own_entries(self):
        user2 = make_user(username="other", email="o@t.com")
        make_entry(self.user, word="mine")
        make_entry(user2, word="theirs")
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        words = [e["word"] for e in response.data["results"]]
        self.assertIn("mine", words)
        self.assertNotIn("theirs", words)

    def test_duplicate_word_direction_updates_existing(self):
        make_entry(self.user, word="cat", translation="gato")
        response = self.client.post(self.URL, {
            "word": "cat",
            "translation": "felino",
            "direction": "en-pt",
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(VocabularyEntry.objects.filter(word="cat").count(), 1)
        entry = VocabularyEntry.objects.get(word="cat")
        self.assertEqual(entry.translation, "felino")

    def test_filter_by_status(self):
        make_entry(self.user, word="w1", status="new")
        make_entry(self.user, word="w2", direction="pt-en", status="known")
        response = self.client.get(self.URL + "?status=new")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        statuses = [e["status"] for e in response.data["results"]]
        self.assertTrue(all(s == "new" for s in statuses))

    def test_filter_by_direction(self):
        make_entry(self.user, word="w1", direction="en-pt")
        make_entry(self.user, word="w2", direction="pt-en")
        response = self.client.get(self.URL + "?direction=pt-en")
        directions = [e["direction"] for e in response.data["results"]]
        self.assertTrue(all(d == "pt-en" for d in directions))

    def test_search_by_word(self):
        make_entry(self.user, word="universe", translation="universo")
        make_entry(self.user, word="planet", direction="pt-en", translation="planeta")
        response = self.client.get(self.URL + "?search=universe")
        words = [e["word"] for e in response.data["results"]]
        self.assertIn("universe", words)
        self.assertNotIn("planet", words)

    def test_search_by_translation(self):
        make_entry(self.user, word="sun", translation="sol")
        make_entry(self.user, word="moon", direction="pt-en", translation="lua")
        response = self.client.get(self.URL + "?search=sol")
        words = [e["word"] for e in response.data["results"]]
        self.assertIn("sun", words)

    def test_filter_due_today(self):
        past = now() - timedelta(hours=1)
        future = now() + timedelta(days=5)
        make_entry(self.user, word="due_word", next_review_at=past)
        make_entry(self.user, word="future_word", direction="pt-en", next_review_at=future)
        response = self.client.get(self.URL + "?due_today=true")
        words = [e["word"] for e in response.data["results"]]
        self.assertIn("due_word", words)
        self.assertNotIn("future_word", words)

    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ─── Detail / Update / Delete ────────────────────────────────────────────────

class VocabularyDetailTest(APITestCase):

    def setUp(self):
        self.user = make_user()
        self.other = make_user(username="other", email="o@t.com")
        self.client.force_authenticate(user=self.user)
        self.entry = make_entry(self.user, word="detail_word")

    def _url(self, pk=None):
        return f"/api/vocabulary/{pk or self.entry.pk}/"

    def test_retrieve_own_entry(self):
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["word"], "detail_word")

    def test_patch_status(self):
        response = self.client.patch(self._url(), {"status": "learning"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, "learning")

    def test_patch_translation(self):
        response = self.client.patch(self._url(), {"translation": "palavra"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.translation, "palavra")

    def test_delete_own_entry(self):
        response = self.client.delete(self._url())
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(VocabularyEntry.objects.filter(pk=self.entry.pk).exists())

    def test_cannot_retrieve_other_users_entry(self):
        other_entry = make_entry(self.other, word="secret")
        response = self.client.get(self._url(pk=other_entry.pk))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_delete_other_users_entry(self):
        other_entry = make_entry(self.other, word="secret2")
        response = self.client.delete(self._url(pk=other_entry.pk))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ─── Review (SM-2) ───────────────────────────────────────────────────────────

class ReviewViewTest(APITestCase):
    URL = "/api/vocabulary/review/"

    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(user=self.user)
        self.entry = make_entry(self.user, word="review_word")

    def _post(self, quality):
        return self.client.post(self.URL, {
            "entry_id": self.entry.pk,
            "quality": quality,
        })

    def test_quality_5_sets_interval_1_for_first_review(self):
        response = self._post(5)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.interval_days, 1)

    def test_quality_5_second_review_sets_interval_6(self):
        self._post(5)  # review_count becomes 1
        response = self._post(5)  # review_count becomes 2
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.interval_days, 6)

    def test_quality_5_third_review_uses_ease_factor(self):
        self._post(5)  # review_count: 0→1
        self._post(5)  # review_count: 1→2, interval=6
        self.entry.refresh_from_db()
        expected_interval = round(self.entry.interval_days * self.entry.ease_factor)
        self._post(5)  # review_count: 2→3
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.interval_days, expected_interval)

    def test_quality_lt_3_resets_interval_to_1(self):
        # First do a good review so review_count > 0
        self._post(5)
        self._post(2)  # quality < 3 — should reset
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.interval_days, 1)
        self.assertEqual(self.entry.review_count, 0)

    def test_quality_lt_3_review_count_resets_to_0(self):
        self._post(4)
        self._post(1)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.review_count, 0)

    def test_ease_factor_increases_on_quality_5(self):
        original_ef = self.entry.ease_factor
        self._post(5)
        self.entry.refresh_from_db()
        self.assertGreater(self.entry.ease_factor, original_ef)

    def test_ease_factor_decreases_on_quality_3(self):
        original_ef = self.entry.ease_factor
        self._post(3)
        self.entry.refresh_from_db()
        self.assertLess(self.entry.ease_factor, original_ef)

    def test_ease_factor_never_below_1_3(self):
        # Force multiple poor reviews to exhaust ease factor
        self.entry.ease_factor = 1.3
        self.entry.save()
        self._post(3)
        self.entry.refresh_from_db()
        self.assertGreaterEqual(self.entry.ease_factor, 1.3)

    def test_status_changes_to_learning_after_first_good_review(self):
        self._post(4)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, "learning")

    def test_status_becomes_known_after_5_reviews(self):
        for _ in range(5):
            self._post(5)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, "known")

    def test_last_reviewed_at_set(self):
        self._post(4)
        self.entry.refresh_from_db()
        self.assertIsNotNone(self.entry.last_reviewed_at)

    def test_next_review_at_set(self):
        self._post(4)
        self.entry.refresh_from_db()
        self.assertIsNotNone(self.entry.next_review_at)

    def test_wrong_entry_id_returns_404(self):
        response = self.client.post(self.URL, {"entry_id": 99999, "quality": 4})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_review_other_users_entry(self):
        other = make_user(username="other", email="o@t.com")
        other_entry = make_entry(other, word="secret")
        response = self.client.post(self.URL, {
            "entry_id": other_entry.pk,
            "quality": 5,
        })
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_quality_returns_400(self):
        response = self.client.post(self.URL, {
            "entry_id": self.entry.pk,
            "quality": 10,
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ─── Anki Export ─────────────────────────────────────────────────────────────

class ExportAnkiViewTest(APITestCase):
    URL = "/api/vocabulary/export/anki/"

    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(user=self.user)

    def test_returns_200_and_csv_content_type(self):
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", response["Content-Type"])

    def test_content_disposition_attachment(self):
        response = self.client.get(self.URL)
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertIn("vocabulary.csv", response["Content-Disposition"])

    def test_csv_has_header_row(self):
        response = self.client.get(self.URL)
        content = response.content.decode("utf-8")
        first_line = content.splitlines()[0]
        self.assertIn("word", first_line)
        self.assertIn("translation", first_line)

    def test_csv_is_tab_separated(self):
        make_entry(self.user, word="tree", translation="árvore",
                   definition="a plant", example="big tree", context_sentence="the tree grows")
        response = self.client.get(self.URL)
        lines = response.content.decode("utf-8").splitlines()
        # Header and at least one data row must have tabs
        for line in lines:
            self.assertIn("\t", line)

    def test_csv_contains_own_entry(self):
        make_entry(self.user, word="star", translation="estrela")
        response = self.client.get(self.URL)
        content = response.content.decode("utf-8")
        self.assertIn("star", content)
        self.assertIn("estrela", content)

    def test_csv_does_not_contain_other_users_entry(self):
        other = make_user(username="other", email="o@t.com")
        make_entry(other, word="private_word")
        response = self.client.get(self.URL)
        content = response.content.decode("utf-8")
        self.assertNotIn("private_word", content)

    def test_empty_vocabulary_returns_only_header(self):
        response = self.client.get(self.URL)
        lines = [l for l in response.content.decode("utf-8").splitlines() if l.strip()]
        self.assertEqual(len(lines), 1)  # header only


# ─── Stats ───────────────────────────────────────────────────────────────────

class VocabularyStatsViewTest(APITestCase):
    URL = "/api/vocabulary/stats/"

    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(user=self.user)

    def test_empty_returns_zeros(self):
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total"], 0)
        self.assertEqual(response.data["new"], 0)
        self.assertEqual(response.data["learning"], 0)
        self.assertEqual(response.data["known"], 0)
        self.assertEqual(response.data["due_today"], 0)
        self.assertEqual(response.data["streak_days"], 0)

    def test_counts_by_status(self):
        make_entry(self.user, word="w1", status="new")
        make_entry(self.user, word="w2", direction="pt-en", status="learning")
        make_entry(self.user, word="w3", translation="t3", status="known")
        response = self.client.get(self.URL)
        self.assertEqual(response.data["total"], 3)
        self.assertEqual(response.data["new"], 1)
        self.assertEqual(response.data["learning"], 1)
        self.assertEqual(response.data["known"], 1)

    def test_due_today_count(self):
        past = now() - timedelta(hours=2)
        future = now() + timedelta(days=3)
        make_entry(self.user, word="due1", next_review_at=past)
        make_entry(self.user, word="future1", direction="pt-en", next_review_at=future)
        response = self.client.get(self.URL)
        self.assertEqual(response.data["due_today"], 1)

    def test_streak_days_no_reviews(self):
        make_entry(self.user, word="w1")
        response = self.client.get(self.URL)
        self.assertEqual(response.data["streak_days"], 0)

    def test_streak_days_reviewed_today(self):
        entry = make_entry(self.user, word="w1", last_reviewed_at=now())
        response = self.client.get(self.URL)
        self.assertGreaterEqual(response.data["streak_days"], 1)

    def test_stats_only_counts_own_entries(self):
        other = make_user(username="other", email="o@t.com")
        make_entry(self.user, word="mine", status="new")
        make_entry(other, word="theirs", status="known")
        response = self.client.get(self.URL)
        self.assertEqual(response.data["total"], 1)
        self.assertEqual(response.data["new"], 1)
        self.assertEqual(response.data["known"], 0)

    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
