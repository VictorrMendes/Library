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
    "w-full px-3 py-2.5 rounded-md bg-background border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-colors placeholder:text-muted-foreground/50";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/3 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/12 border border-primary/20 mb-5">
            <BookOpen className="h-7 w-7 text-primary" strokeWidth={1.75} />
          </div>
          <h1 className="font-classic text-3xl font-medium tracking-tight">Criar conta</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">Acesse sua biblioteca pessoal</p>
        </div>

        {/* Form card */}
        <div className="bg-card border border-border/50 rounded-lg p-6 shadow-xl shadow-black/20">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                Usuário
              </label>
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
                <p className="text-xs text-red-400 mt-1.5">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                E-mail
              </label>
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
                <p className="text-xs text-red-400 mt-1.5">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                Senha
              </label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword
                    ? <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                    : <Eye className="h-4 w-4" strokeWidth={1.75} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-400 mt-1.5">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                Confirmar senha
              </label>
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
                <p className="text-xs text-red-400 mt-1.5">{errors.confirm_password.message}</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center bg-red-500/8 border border-red-500/20 rounded-md py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar conta
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Já tem uma conta?{" "}
          <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
