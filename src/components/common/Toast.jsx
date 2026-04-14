import React from 'react';

export default function Toast({ show, message }) {
  return (
    <div style={{
      position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)",
      background: "rgba(33,37,41,0.9)", color: "#fff", padding: "12px 24px",
      borderRadius: 100, fontSize: 14, fontWeight: 500, zIndex: 1000,
      opacity: show ? 1 : 0, pointerEvents: "none",
      transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      animation: show ? "toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
      whiteSpace: "nowrap"
    }}>
      {message}
    </div>
  );
}
