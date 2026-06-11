import secrets
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import UserSerializer, RegisterSerializer, ChangePasswordSerializer, UpdatePreferencesSerializer
from .models import ApiKey

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        # First user becomes admin
        is_first = not User.objects.exists()
        user = serializer.save()
        if is_first:
            user.role = "admin"
            user.save(update_fields=["role"])


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        self.request.user.last_active = timezone.now()
        self.request.user.save(update_fields=["last_active"])
        return self.request.user


class ChangePasswordView(generics.GenericAPIView):
    serializer_class = ChangePasswordSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Senha alterada com sucesso."})


class UpdatePreferencesView(generics.UpdateAPIView):
    serializer_class = UpdatePreferencesSerializer
    http_method_names = ["patch"]

    def get_object(self):
        return self.request.user


# ─── Admin: user management ──────────────────────────────────────────────────

class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if not self.request.user.is_admin:
            return User.objects.filter(pk=self.request.user.pk)
        return User.objects.all().order_by("username")


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserSerializer
    queryset = User.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        if instance == request.user:
            return Response(
                {"detail": "Não é possível deletar a própria conta."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── API Keys ─────────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
def api_keys(request):
    if request.method == "GET":
        keys = ApiKey.objects.filter(user=request.user, is_active=True)
        data = [{"id": k.id, "label": k.label, "created_at": k.created_at} for k in keys]
        return Response(data)

    label = request.data.get("label", "OPDS")
    key = ApiKey.objects.create(
        user=request.user,
        key=secrets.token_urlsafe(32),
        label=label,
    )
    return Response({"id": key.id, "key": key.key, "label": key.label}, status=201)


@api_view(["DELETE"])
def revoke_api_key(request, pk):
    ApiKey.objects.filter(user=request.user, pk=pk).update(is_active=False)
    return Response(status=status.HTTP_204_NO_CONTENT)
