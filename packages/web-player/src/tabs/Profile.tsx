import { useEffect, useState } from "react";
import { Download, Trophy, Lock, Bell, Mail, Check, Trash2, Pencil } from "lucide-react";
import { apiGet, apiPost } from "../lib/api.js";
import type { ProfileResponse } from "../lib/types.js";
import { formatDateShort } from "../lib/format.js";
import Toggle from "../components/Toggle.js";
import Avatar from "../components/Avatar.js";
import ProfileEditor from "../components/ProfileEditor.js";
import { exportMembershipCard } from "../lib/exportCard.js";
import { confirmDialog } from "../lib/telegram.js";
import CheckinQr from "../components/CheckinQr.js";
import type { ClubInfo } from "../components/Header.js";
import { useRevalidateOnActive } from "../lib/useRevalidateOnActive.js";

export default function Profile({
  active,
  club,
  onDeleted,
}: {
  active: boolean;
  club: ClubInfo | null;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [notifsEnabled, setNotifsEnabled] = useState<boolean | null>(null);
  const [notifsSaving, setNotifsSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);

  function load() {
    return apiGet<ProfileResponse>("/api/profile").then(setData);
  }

  useEffect(() => {
    load();
    apiGet<{ enabled: boolean }>("/api/settings/notifications").then((r) => setNotifsEnabled(r.enabled));
  }, []);
  useRevalidateOnActive(active, load);

  async function toggleNotifications(next: boolean) {
    setNotifsSaving(true);
    setNotifsEnabled(next);
    try {
      await apiPost<{ enabled: boolean }>("/api/settings/notifications", { enabled: next });
    } catch {
      setNotifsEnabled(!next);
    } finally {
      setNotifsSaving(false);
    }
  }

  async function handleDeleteData() {
    const confirmed = await confirmDialog(
      "Удалить все ваши данные из клуба? Это действие нельзя отменить — статистика и достижения будут обезличены.",
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await apiPost("/api/profile/delete");
      onDeleted();
    } catch {
      setDeleting(false);
    }
  }

  if (!data) return <div className="loading">Загрузка…</div>;

  const { player, membership, stats, rankProgress, achievements, myTournaments } = data;

  return (
    <div className="section">
      {editing && (
        <ProfileEditor
          nickname={player.nickname}
          avatarUrl={player.avatarUrl}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setData((d) => (d ? { ...d, player: { ...d.player, ...updated } } : d));
            setEditing(false);
          }}
        />
      )}

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 10 }}>
          <Avatar nickname={player.nickname} avatarUrl={player.avatarUrl} size={48} fontSize={16} />
          <strong>{player.nickname}</strong>
        </div>
        <button
          className="btn btn-secondary"
          style={{ width: "auto", padding: "6px 10px" }}
          onClick={() => setEditing(true)}
        >
          <Pencil size={16} />
        </button>
      </div>

      {membership && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            background: "linear-gradient(135deg, #2a2412, #15130a)",
            border: "1px solid var(--accent)",
          }}
        >
          <div className="small muted">УРОВЕНЬ УЧАСТНИКА</div>
          <div style={{ fontSize: 20, fontWeight: 800, margin: "4px 0 16px" }}>{membership.memberLevel}</div>
          <div className="row">
            <span className="small">{(club?.name ?? "Мой Покер Клуб").toUpperCase()}</span>
            <span className="small muted">КАРТА {membership.cardId.slice(0, 8).toUpperCase()}</span>
          </div>
        </div>
      )}

      {membership && (
        <button
          className="btn btn-secondary"
          style={{ marginBottom: 14 }}
          onClick={() =>
            exportMembershipCard({
              clubName: club?.name ?? "Мой Покер Клуб",
              memberLevel: membership.memberLevel,
              nickname: player.nickname,
              cardId: membership.cardId,
            })
          }
        >
          <Download size={16} style={{ marginRight: 6, verticalAlign: -3 }} />
          Скачать карту
        </button>
      )}

      {membership && (
        <div style={{ marginBottom: 14 }}>
          <CheckinQr />
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row small" style={{ marginBottom: 6 }}>
          <span className="badge badge-gold">{rankProgress.current?.name ?? "NEWBIE"}</span>
          {rankProgress.next && <span className="muted">→ {rankProgress.next.name} {rankProgress.progressPercent}%</span>}
        </div>
        <div className="progress-bar">
          <div className="fill" style={{ width: `${rankProgress.progressPercent}%` }} />
        </div>
      </div>

      <strong className="small muted">СТАТИСТИКА</strong>
      <div className="stat-grid" style={{ margin: "10px 0 20px" }}>
        <div className="stat-tile">
          <div className="value">{stats.winRate}%</div>
          <div className="label">Win rate</div>
        </div>
        <div className="stat-tile">
          <div className="value">{stats.avgPlace?.toFixed(1) ?? "—"}</div>
          <div className="label">Ср. позиция</div>
        </div>
        <div className="stat-tile">
          <div className="value">{stats.totalRps}</div>
          <div className="label">RPS собрано</div>
        </div>
        <div className="stat-tile">
          <div className="value">{stats.bestPlace ?? "—"}</div>
          <div className="label">Лучшее место</div>
        </div>
        <div className="stat-tile">
          <div className="value">{stats.top3Count}</div>
          <div className="label">Топ-3</div>
        </div>
        <div className="stat-tile">
          <div className="value">{stats.gamesPlayed}</div>
          <div className="label">Игр в клубе</div>
        </div>
      </div>

      <strong className="small muted">
        ДОСТИЖЕНИЯ {achievements.filter((a) => a.unlocked).length}/{achievements.length}
      </strong>
      <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr", margin: "10px 0 20px" }}>
        {achievements.map((a) => (
          <div key={a.id} className="card" style={{ padding: 10 }}>
            <div className="row small">
              <span className="row" style={{ gap: 6, width: "auto" }}>
                {a.unlocked ? <Trophy size={14} /> : <Lock size={14} />} {a.name}
              </span>
            </div>
            <div className="progress-bar" style={{ marginTop: 6 }}>
              <div
                className="fill"
                style={{ width: `${Math.min(100, (a.progressValue / a.thresholdValue) * 100)}%` }}
              />
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {a.progressValue}/{a.thresholdValue}
            </div>
          </div>
        ))}
      </div>

      <strong className="small muted">МОИ ТУРНИРЫ {myTournaments.length}</strong>
      <div className="row-list" style={{ margin: "10px 0 20px" }}>
        {myTournaments.length === 0 && (
          <div className="empty">
            Нет активных регистраций
            <div className="small">Запишитесь на турнир, чтобы начать играть</div>
          </div>
        )}
        {myTournaments.map((t) => (
          <div className="row-item" key={t.id}>
            <span>{t.name}</span>
            <span className="small muted">{formatDateShort(t.scheduledAt)}</span>
          </div>
        ))}
      </div>

      <strong className="small muted">НАСТРОЙКИ</strong>
      <div className="card" style={{ marginTop: 10 }}>
        <div className="row small" style={{ marginBottom: 12 }}>
          <span className="row" style={{ gap: 6, width: "auto" }}>
            <Bell size={16} /> Напоминания в Telegram
          </span>
          <Toggle
            checked={notifsEnabled ?? true}
            disabled={notifsEnabled === null || notifsSaving}
            onChange={toggleNotifications}
          />
        </div>
        <div className="row small" style={{ marginBottom: 12 }}>
          <span className="row" style={{ gap: 6, width: "auto" }}>
            <Mail size={16} /> Email привязан
          </span>
          <span className="muted">
            <Check size={16} />
          </span>
        </div>
        <button
          className="small"
          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: "var(--danger)", padding: "8px 0 0" }}
          disabled={deleting}
          onClick={handleDeleteData}
        >
          <Trash2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          {deleting ? "Удаляем…" : "Удалить мои данные"}
        </button>
      </div>
    </div>
  );
}
