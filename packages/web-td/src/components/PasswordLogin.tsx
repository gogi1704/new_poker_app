import { useState } from "react";

export default function PasswordLogin({ onSubmit }: { onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    onSubmit(password)
      .catch((err) => setError(String((err as Error).message ?? err)))
      .finally(() => setSubmitting(false));
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ width: 260 }}>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Пароль администратора</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
      </div>
      {error && (
        <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {error}
        </div>
      )}
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
