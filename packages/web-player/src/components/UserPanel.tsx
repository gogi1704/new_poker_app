import { Pencil } from "lucide-react";
import Avatar from "./Avatar.js";
import type { ProfileResponse } from "../lib/types.js";

export default function UserPanel({ profile, onEdit }: { profile: ProfileResponse; onEdit?: () => void }) {
  const { player, stats, rankProgress } = profile;
  const rankName = rankProgress.current?.name ?? "Newbie";
  const nextRank = rankProgress.next;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <div className="avatar-ring">
          <Avatar nickname={player.nickname} avatarUrl={player.avatarUrl} size={56} fontSize={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 16,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {player.nickname}
          </div>
          <div className="small muted" style={{ marginTop: 3 }}>
            {stats.totalRps} RPS · {stats.gamesPlayed} игр · {stats.wins} побед
          </div>
        </div>
        <span className="rank-ribbon">{rankName}</span>
        {onEdit && (
          <button
            className="btn btn-secondary"
            style={{ width: "auto", padding: "8px", marginLeft: 2 }}
            onClick={onEdit}
            aria-label="Редактировать профиль"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      <div className="progress-bar" style={{ marginTop: 16 }}>
        <div className="fill" style={{ width: `${rankProgress.progressPercent}%` }} />
      </div>
      {nextRank && (
        <div className="small muted" style={{ marginTop: 6, textAlign: "right" }}>
          → {nextRank.name} через {100 - rankProgress.progressPercent}%
        </div>
      )}
    </div>
  );
}
