import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Safety net so an unexpected crash anywhere in the app (e.g. a third-party
// library like html5-qrcode throwing during camera access) never leaves staff
// stuck on a blank screen with no way back — this always shows a reload
// button instead of React silently unmounting the whole tree.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="section" style={{ textAlign: "center", paddingTop: 60 }}>
          <div style={{ marginBottom: 16 }}>Что-то пошло не так.</div>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
