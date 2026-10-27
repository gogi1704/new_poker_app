export default function LoadingScreen({ text }: { text: string }) {
  return (
    <div className="loading-screen">
      <div className="loading-cards">
        <div className="loading-card-wrap">
          <div className="loading-card">♠</div>
        </div>
        <div className="loading-card-wrap">
          <div className="loading-card">♥</div>
        </div>
        <div className="loading-card-wrap">
          <div className="loading-card">♦</div>
        </div>
      </div>
      <div className="loading-text">{text}</div>
    </div>
  );
}
