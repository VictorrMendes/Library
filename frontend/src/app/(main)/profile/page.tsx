"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Loader2, Eye, EyeOff, CheckCircle2, Key, Trash2, Plus, Camera } from "lucide-react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { User } from "@/types";
import { clsx } from "clsx";

interface PrefsForm {
  reading_direction: "ltr" | "rtl" | "ttb";
  reading_mode: "single" | "double" | "webtoon";
  scaling: "fit_screen" | "fit_height" | "fit_width" | "original";
  theme: string;
  book_font_size: number;
  book_font_family: string;
  book_line_spacing: number;
  blur_unread_summaries: boolean;
}

interface PasswordForm {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

interface ApiKey {
  id: number;
  label: string;
  created_at: string;
}

export default function ProfilePage() {
  const qc = useQueryClient();
  const { user, setUser } = useAuthStore();
  const [pwVisible, setPwVisible] = useState({ current: false, new: false });
  const [pwSuccess, setPwSuccess] = useState(false);
  const [prefsSuccess, setPrefsSuccess] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [infoSuccess, setInfoSuccess] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const prefForm = useForm<PrefsForm>({
    defaultValues: {
      reading_direction: user?.reading_direction ?? "ltr",
      reading_mode: user?.reading_mode ?? "single",
      scaling: user?.scaling ?? "fit_screen",
      theme: user?.theme ?? "dark",
      book_font_size: user?.book_font_size ?? 16,
      book_font_family: user?.book_font_family ?? "serif",
      book_line_spacing: user?.book_line_spacing ?? 1.5,
      blur_unread_summaries: user?.blur_unread_summaries ?? false,
    },
  });

  const pwForm = useForm<PasswordForm>();

  const infoForm = useForm({ defaultValues: { email: user?.email ?? "" } });

  const infoMutation = useMutation({
    mutationFn: (data: { email: string }) => authApi.updateProfile(data),
    onSuccess: async () => {
      const { data: fresh } = await authApi.me();
      setUser(fresh);
      setInfoSuccess(true);
      setTimeout(() => setInfoSuccess(false), 3000);
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("avatar", file);
      return authApi.updateProfile(fd);
    },
    onSuccess: async () => {
      const { data: fresh } = await authApi.me();
      setUser(fresh);
    },
  });

  const prefsMutation = useMutation({
    mutationFn: (data: PrefsForm) => authApi.updatePreferences(data as unknown as Record<string, unknown>),
    onSuccess: async () => {
      const { data: fresh } = await authApi.me();
      setUser(fresh);
      setPrefsSuccess(true);
      setTimeout(() => setPrefsSuccess(false), 3000);
    },
  });

  const pwMutation = useMutation({
    mutationFn: (data: PasswordForm) =>
      authApi.changePassword(data.current_password, data.new_password),
    onSuccess: () => {
      pwForm.reset();
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    },
  });

  const { data: apiKeys = [], refetch: refetchKeys } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: () =>
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/account/api-keys/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      }).then((r) => r.json()),
  });

  async function createKey() {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/account/api-keys/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
        body: JSON.stringify({ label: newKeyLabel || "OPDS" }),
      }
    );
    const data = await res.json();
    setCreatedKey(data.key);
    setNewKeyLabel("");
    refetchKeys();
  }

  async function revokeKey(id: number) {
    await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/account/api-keys/${id}/`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      }
    );
    refetchKeys();
  }

  async function onPrefsSubmit(data: PrefsForm) {
    await prefsMutation.mutateAsync(data);
  }

  async function onPwSubmit(data: PasswordForm) {
    if (data.new_password !== data.confirm_password) {
      pwForm.setError("confirm_password", { message: "As senhas não coincidem." });
      return;
    }
    await pwMutation.mutateAsync(data);
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <h2 className="text-base font-semibold border-b border-border pb-3">{title}</h2>
      {children}
    </div>
  );

  const Field = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm font-medium shrink-0 w-48">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );

  const selectCls = "w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  const inputCls = "w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="p-6 space-y-6 max-w-screen-md">
      <div>
        <h1 className="text-2xl font-bold font-sans">Perfil</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Preferências de leitura e configurações da conta.
        </p>
      </div>

      {/* Account info */}
      <Section title="Informações da Conta">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold overflow-hidden">
              {user?.avatar ? (
                <img src={user.avatar} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                user?.username?.[0]?.toUpperCase()
              )}
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarMutation.isPending}
              className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors shadow"
              title="Alterar foto"
            >
              {avatarMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) avatarMutation.mutate(file);
                e.target.value = "";
              }}
            />
          </div>

          {/* Username + email form */}
          <form
            onSubmit={infoForm.handleSubmit((d) => infoMutation.mutate(d))}
            className="flex-1 space-y-3"
          >
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Usuário</label>
              <p className="text-sm font-medium px-3 py-2 rounded-lg bg-muted border border-border">
                {user?.username}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">E-mail</label>
              <input
                {...infoForm.register("email", {
                  required: true,
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "E-mail inválido" },
                })}
                type="email"
                className={inputCls}
                autoComplete="email"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={infoMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {infoMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
              {infoSuccess && (
                <span className="flex items-center gap-1.5 text-sm text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Salvo!
                </span>
              )}
            </div>
          </form>
        </div>
      </Section>

      {/* Reading preferences */}
      <Section title="Preferências de Leitura">
        <form onSubmit={prefForm.handleSubmit(onPrefsSubmit)} className="space-y-4">
          <Field label="Direção de leitura">
            <select {...prefForm.register("reading_direction")} className={selectCls}>
              <option value="ltr">Esquerda para Direita</option>
              <option value="rtl">Direita para Esquerda</option>
              <option value="ttb">Cima para Baixo</option>
            </select>
          </Field>

          <Field label="Modo de leitura">
            <select {...prefForm.register("reading_mode")} className={selectCls}>
              <option value="single">Página única</option>
              <option value="double">Duas páginas</option>
              <option value="webtoon">Webtoon (rolar)</option>
            </select>
          </Field>

          <Field label="Escala de imagens">
            <select {...prefForm.register("scaling")} className={selectCls}>
              <option value="fit_screen">Ajustar à tela</option>
              <option value="fit_height">Ajustar à altura</option>
              <option value="fit_width">Ajustar à largura</option>
              <option value="original">Original</option>
            </select>
          </Field>

          <Field label="Fonte do leitor">
            <select {...prefForm.register("book_font_family")} className={selectCls}>
              <option value="serif">Merriweather (Serif)</option>
              <option value="sans-serif">Fira Sans (Sans)</option>
              <option value="lato">Lato (Leitura)</option>
              <option value="garamond">EB Garamond (Clássico)</option>
            </select>
          </Field>

          <Field label="Tamanho da fonte">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={12}
                max={28}
                step={1}
                {...prefForm.register("book_font_size", { valueAsNumber: true })}
                className="flex-1"
              />
              <span className="text-sm w-8 text-right">{prefForm.watch("book_font_size")}px</span>
            </div>
          </Field>

          <Field label="Espaçamento de linhas">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                {...prefForm.register("book_line_spacing", { valueAsNumber: true })}
                className="flex-1"
              />
              <span className="text-sm w-8 text-right">{prefForm.watch("book_line_spacing")}</span>
            </div>
          </Field>

          <Field label="Borrar resumos não lidos">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" {...prefForm.register("blur_unread_summaries")} className="sr-only peer" />
              <div className="w-10 h-5 bg-muted peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
            </label>
          </Field>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={prefsMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {prefsMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar preferências
            </button>
            {prefsSuccess && (
              <span className="flex items-center gap-1.5 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Salvo!
              </span>
            )}
          </div>
        </form>
      </Section>

      {/* Change password */}
      <Section title="Alterar Senha">
        <form onSubmit={pwForm.handleSubmit(onPwSubmit)} className="space-y-4">
          {(["current_password", "new_password", "confirm_password"] as const).map((field) => {
            const labels = {
              current_password: "Senha atual",
              new_password: "Nova senha",
              confirm_password: "Confirmar nova senha",
            };
            const key = field === "current_password" ? "current" : "new";
            const visible = pwVisible[key as keyof typeof pwVisible] ?? false;
            return (
              <div key={field}>
                <label className="block text-sm font-medium mb-1.5">{labels[field]}</label>
                <div className="relative">
                  <input
                    {...pwForm.register(field, { required: true, minLength: field !== "current_password" ? 6 : 1 })}
                    type={visible ? "text" : "password"}
                    className={inputCls + " pr-10"}
                    placeholder="••••••••"
                    autoComplete={field === "current_password" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setPwVisible((v) => ({ ...v, [key]: !v[key as keyof typeof v] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {pwForm.formState.errors[field] && (
                  <p className="text-xs text-red-400 mt-1">
                    {pwForm.formState.errors[field]?.message ?? "Campo obrigatório."}
                  </p>
                )}
              </div>
            );
          })}

          {pwMutation.isError && (
            <p className="text-sm text-red-400">Senha atual incorreta.</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pwMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {pwMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Alterar senha
            </button>
            {pwSuccess && (
              <span className="flex items-center gap-1.5 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Senha alterada!
              </span>
            )}
          </div>
        </form>
      </Section>

      {/* API Keys */}
      <Section title="Chaves de API (OPDS)">
        <p className="text-sm text-muted-foreground">
          Use chaves de API para acessar seu servidor via leitores OPDS.
        </p>

        {/* Create key */}
        <div className="flex items-center gap-2">
          <input
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            placeholder="Rótulo (ex: Koreader)"
            className={clsx(inputCls, "flex-1")}
          />
          <button
            onClick={createKey}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            Criar
          </button>
        </div>

        {/* Show created key once */}
        {createdKey && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-1">
            <p className="text-xs text-green-400 font-medium">
              Chave criada — copie agora, não será exibida novamente.
            </p>
            <p className="font-mono text-xs break-all select-all">{createdKey}</p>
            <button
              onClick={() => setCreatedKey(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Key list */}
        {apiKeys.length > 0 && (
          <div className="space-y-2">
            {apiKeys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background border border-border">
                <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{k.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Criada em {new Date(k.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <button
                  onClick={() => revokeKey(k.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  title="Revogar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
