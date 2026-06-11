from django.test import TestCase
from rest_framework.test import APITestCase
from rest_framework import status
from apps.accounts.models import User, ApiKey, UserRole


class UserModelTest(TestCase):

    def test_is_admin_true_for_admin_role(self):
        user = User(role=UserRole.ADMIN)
        self.assertTrue(user.is_admin)

    def test_is_admin_false_for_user_role(self):
        user = User(role=UserRole.USER)
        self.assertFalse(user.is_admin)

    def test_is_admin_false_for_read_only_role(self):
        user = User(role=UserRole.READ_ONLY)
        self.assertFalse(user.is_admin)


class RegisterViewTest(APITestCase):
    URL = "/api/account/register/"

    def test_first_user_becomes_admin(self):
        self.client.post(self.URL, {
            "username": "admin",
            "email": "admin@test.com",
            "password": "password123",
        })
        user = User.objects.get(username="admin")
        self.assertEqual(user.role, UserRole.ADMIN)

    def test_second_user_is_not_admin(self):
        self.client.post(self.URL, {
            "username": "admin",
            "email": "admin@test.com",
            "password": "password123",
        })
        self.client.post(self.URL, {
            "username": "user2",
            "email": "user2@test.com",
            "password": "password123",
        })
        user2 = User.objects.get(username="user2")
        self.assertEqual(user2.role, UserRole.USER)

    def test_password_too_short_returns_400(self):
        response = self.client.post(self.URL, {
            "username": "user",
            "email": "user@test.com",
            "password": "abc",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_username_returns_400(self):
        self.client.post(self.URL, {
            "username": "admin",
            "email": "admin@test.com",
            "password": "password123",
        })
        response = self.client.post(self.URL, {
            "username": "admin",
            "email": "other@test.com",
            "password": "password123",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_email_returns_400(self):
        self.client.post(self.URL, {
            "username": "admin",
            "email": "admin@test.com",
            "password": "password123",
        })
        response = self.client.post(self.URL, {
            "username": "user2",
            "email": "admin@test.com",
            "password": "password123",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_successful_registration_returns_201(self):
        response = self.client.post(self.URL, {
            "username": "newuser",
            "email": "new@test.com",
            "password": "password123",
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class MeViewTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="pass123",
        )
        self.client.force_authenticate(user=self.user)

    def test_returns_current_user(self):
        response = self.client.get("/api/account/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "testuser")

    def test_updates_last_active(self):
        self.client.get("/api/account/me/")
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_active)

    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/account/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ChangePasswordViewTest(APITestCase):
    URL = "/api/account/me/password/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="oldpass123",
        )
        self.client.force_authenticate(user=self.user)

    def test_change_with_correct_current_password(self):
        response = self.client.post(self.URL, {
            "current_password": "oldpass123",
            "new_password": "newpass456",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newpass456"))

    def test_change_with_wrong_current_password_returns_400(self):
        response = self.client.post(self.URL, {
            "current_password": "wrongpassword",
            "new_password": "newpass456",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("oldpass123"))

    def test_new_password_too_short_returns_400(self):
        response = self.client.post(self.URL, {
            "current_password": "oldpass123",
            "new_password": "abc",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class UserListViewTest(APITestCase):

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@test.com",
            password="pass",
            role=UserRole.ADMIN,
        )
        self.regular = User.objects.create_user(
            username="user1",
            email="user1@test.com",
            password="pass",
        )

    def test_admin_sees_all_users(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/account/users/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = [u["username"] for u in response.data]
        self.assertIn("admin", usernames)
        self.assertIn("user1", usernames)

    def test_regular_user_sees_only_self(self):
        self.client.force_authenticate(user=self.regular)
        response = self.client.get("/api/account/users/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["username"], "user1")

    def test_admin_can_delete_other_user(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(
            f"/api/account/users/{self.regular.pk}/"
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_admin_cannot_delete_self(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(
            f"/api/account/users/{self.admin.pk}/"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_regular_user_cannot_delete_user(self):
        self.client.force_authenticate(user=self.regular)
        response = self.client.delete(
            f"/api/account/users/{self.admin.pk}/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ApiKeyTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user",
            email="u@t.com",
            password="pass",
        )
        self.client.force_authenticate(user=self.user)

    def test_create_api_key_returns_key_value(self):
        response = self.client.post(
            "/api/account/api-keys/", {"label": "My Key"}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("key", response.data)
        self.assertGreaterEqual(len(response.data["key"]), 32)

    def test_list_shows_active_keys(self):
        self.client.post("/api/account/api-keys/", {"label": "Key 1"})
        response = self.client.get("/api/account/api-keys/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_revoke_removes_key_from_list(self):
        create_resp = self.client.post(
            "/api/account/api-keys/", {"label": "Key"}
        )
        key_id = create_resp.data["id"]
        self.client.delete(f"/api/account/api-keys/{key_id}/")
        list_resp = self.client.get("/api/account/api-keys/")
        self.assertEqual(len(list_resp.data), 0)

    def test_revoked_key_not_deleted_from_db(self):
        create_resp = self.client.post(
            "/api/account/api-keys/", {"label": "Key"}
        )
        key_id = create_resp.data["id"]
        self.client.delete(f"/api/account/api-keys/{key_id}/")
        key = ApiKey.objects.get(pk=key_id)
        self.assertFalse(key.is_active)
