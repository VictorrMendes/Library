"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { BookOpen, Eye, EyeOff, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface LoginForm {
  username: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setError("");
    try {
      const { data: tokens } = await authApi.login(data.username, data.password);
      setTokens(tokens.access, tokens.refresh);
      const { data: user } = await authApi.me();
      setUser(user);
      router.push("/dashboard");
    } catch {
      setError("Usuário ou senha incorretos.");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <BookOpen className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-sans">Biblioteca</h1>
          <p className="text-muted-foreground mt-1 text-sm">Entre na sua conta</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Usuário</label>
            <input
              {...register("username", { required: true })}
              className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="seu usuário"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Senha</label>
            <div className="relative">
              <input
                {...register("password", { required: true })}
                type={showPassword ? "text" : "password"}
                className="w-full px-3 py-2.5 pr-10 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Entrar
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Não tem uma conta?{" "}
          <Link href="/register" className="text-primary hover:underline font-medium">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
