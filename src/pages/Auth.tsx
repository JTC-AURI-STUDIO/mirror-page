import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Zap, Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Mode = "login" | "signup";

const Auth = () => {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check if already logged in
  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (session) navigate("/");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/");
    });
  }, [navigate]);

  // Debounced username check
  useEffect(() => {
    if (mode !== "signup" || username.trim().length < 3) {
      setUsernameAvailable(null);
      return;
    }
    setCheckingUsername(true);
    const timeout = setTimeout(async () => {
      const { data, error } = await supabase.rpc("check_username_available", {
        desired_username: username.trim().toLowerCase(),
      });
      setCheckingUsername(false);
      if (!error) setUsernameAvailable(data as boolean);
    }, 500);
    return () => clearTimeout(timeout);
  }, [username, mode]);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
    }
  };

  const handleSignup = async () => {
    if (password !== confirmPassword) {
      toast({ title: "Senhas não conferem", description: "Digite a mesma senha nos dois campos.", variant: "destructive" });
      return;
    }
    if (username.trim().length < 3) {
      toast({ title: "Nome de usuário inválido", description: "Mínimo de 3 caracteres.", variant: "destructive" });
      return;
    }
    if (!usernameAvailable) {
      toast({ title: "Nome de usuário indisponível", description: "Escolha outro nome de usuário.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setLoading(false);
      toast({ title: "Erro ao criar conta", description: error.message, variant: "destructive" });
      return;
    }

    // Create profile
    if (signUpData.user) {
      await supabase.from("profiles").insert({
        user_id: signUpData.user.id,
        username: username.trim().toLowerCase(),
      });
    }

    setLoading(false);
    toast({
      title: "Conta criada!",
      description: "Verifique seu e-mail para confirmar a conta.",
    });
    setMode("login");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") handleLogin();
    else handleSignup();
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 animate-pulse-glow">
            <Zap className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Code<span className="text-primary">AI</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            {mode === "login" ? "Entre na sua conta" : "Crie sua conta"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 glass rounded-xl p-6">
          {mode === "signup" && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <User className="h-4 w-4 text-primary" />
                Nome de Usuário
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ""))}
                  placeholder="meu_usuario"
                  className="w-full rounded-lg bg-muted border border-border px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all pr-10"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checkingUsername && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {!checkingUsername && usernameAvailable === true && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {!checkingUsername && usernameAvailable === false && <XCircle className="h-4 w-4 text-destructive" />}
                </div>
              </div>
              {!checkingUsername && usernameAvailable === false && (
                <p className="text-xs text-destructive">Este nome de usuário já está em uso</p>
              )}
              {!checkingUsername && usernameAvailable === true && (
                <p className="text-xs text-green-500">Nome de usuário disponível!</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Mail className="h-4 w-4 text-primary" />
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              className="w-full rounded-lg bg-muted border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Lock className="h-4 w-4 text-primary" />
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full rounded-lg bg-muted border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all pr-10"
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

          {mode === "signup" && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Lock className="h-4 w-4 text-primary" />
                Confirmar Senha
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full rounded-lg bg-muted border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-destructive">As senhas não conferem</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 glow-primary"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {mode === "login" ? "Entrar" : "Criar Conta"}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setUsernameAvailable(null); }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {mode === "login" ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Auth;
