"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { BookOpen, Eye, EyeOff, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface RegisterForm {
  username: string;
  email: string;
  password: string;
  confirm_password: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<RegisterForm>();

  const onSubmit = async (data: RegisterForm) => {
    setError("");
    try {
      await authApi.register({
        username: data.username,
        email: data.email,
        password: data.password,
      });
      const { data: tokens } = await authApi.login(data.username, data.password);
      setTokens(tokens.access, tokens.refresh);
      const { data: user } = await authApi.me();
      setUser(user);
      router.push("/dashboard");
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, string[]> } };
      const detail = e?.response?.data;
      if (detail?.username) {
        setError("Esse nome de usuário já está em uso.");
      } else if (detail?.email) {
        setError("Esse e-mail já está cadastrado.");
      } else {
        setError("Não foi possível criar a conta. Tente novamente.");
      }
    }
  };

  const inputCls =
    "w-full px-3 py-2.5 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <BookOpen className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-sans">Criar conta</h1>
          <p className="text-muted-foreground mt-1 text-sm">Acesse sua biblioteca pessoal</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Usuário</label>
            <input
              {...register("username", {
                required: "Obrigatório",
                minLength: { value: 3, message: "Mínimo 3 caracteres" },
                pattern: { value: /^[a-zA-Z0-9_.-]+$/, message: "Apenas letras, números, _ . -" },
              })}
              className={inputCls}
              placeholder="seu_usuario"
              autoComplete="username"
            />
            {errors.username && (
              <p className="text-xs text-red-400 mt-1">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">E-mail</label>
            <input
              {...register("email", {
                required: "Obrigatório",
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "E-mail inválido" },
              })}
              type="email"
              className={inputCls}
              placeholder="voce@email.com"
              autoComplete="email"
            />
            {errors.email && (
              <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Senha</label>
            <div className="relative">
              <input
                {...register("password", {
                  required: "Obrigatório",
                  minLength: { value: 6, message: "Mínimo 6 caracteres" },
                })}
                type={showPassword ? "text" : "password"}
                className={inputCls + " pr-10"}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Confirmar senha</label>
            <input
              {...register("confirm_password", {
                required: "Obrigatório",
                validate: (v) => v === watch("password") || "As senhas não coincidem",
              })}
              type={showPassword ? "text" : "password"}
              className={inputCls}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {errors.confirm_password && (
              <p className="text-xs text-red-400 mt-1">{errors.confirm_password.message}</p>
            )}
          </div>

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar conta
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Já tem uma conta?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
