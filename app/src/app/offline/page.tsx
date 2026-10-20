import OfflineRetry from "./OfflineRetry";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="login">
      <img className="logo" src="/c5-logo.png" alt="Concept 5 Kitchen & Wood Industries" />
      <div className="panel">
        <h1>You’re offline</h1>
        <p>Concept 5 Projects needs a connection to show live project data. Check Wi-Fi or mobile data, then try again.</p>
        <OfflineRetry />
      </div>
    </div>
  );
}
