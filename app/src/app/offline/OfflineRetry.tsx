"use client";

export default function OfflineRetry() {
  return (
    <button className="btn" onClick={() => window.location.replace("/board")}>Try again</button>
  );
}
