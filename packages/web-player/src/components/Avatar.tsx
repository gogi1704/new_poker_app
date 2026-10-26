import { initials } from "../lib/format.js";

export default function Avatar({
  nickname,
  avatarUrl,
  size = 32,
  fontSize,
  style,
}: {
  nickname: string;
  avatarUrl: string | null;
  size?: number;
  fontSize?: number;
  style?: React.CSSProperties;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={nickname}
        className="avatar"
        style={{ width: size, height: size, objectFit: "cover", ...style }}
      />
    );
  }
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: fontSize ?? Math.round(size * 0.4), ...style }}
    >
      {initials(nickname)}
    </div>
  );
}
