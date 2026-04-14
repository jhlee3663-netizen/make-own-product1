import React, { useState } from 'react';
import { QuoteIcon } from '../icons/Icons';

export default function WorkoutCard({ data, onCardClick, onDelete, isDeleting }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dt = data.timestamp ? new Date(data.timestamp.seconds * 1000) : null;
  const ds = dt ? `${String(dt.getFullYear()).slice(2)}. ${dt.getMonth() + 1}. ${dt.getDate()}` : "";
  const gid = "qG_" + (data.docId || "x");
  return (
    <div className={isDeleting ? "card-exit-wrapper" : ""}>
      <div style={{ padding: "8px 16px" }}>
        <div className="card-enter" style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 0 25px rgba(3,27,38,.08)", cursor: "pointer" }}
          onClick={() => { if (!menuOpen && onCardClick) onCardClick(data); }}
        >
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* 상단: chip + 더보기 버튼 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "inline-flex", background: "rgba(0,84,209,.1)", padding: "4px 6px 4px 8px", borderRadius: 8 }}>
                  <span style={{ fontSize: 13, color: "#0054d1", lineHeight: "18px", letterSpacing: "-.13px" }}>성공 🔥</span>
                </div>
                <div style={{ position: "relative" }}>
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: menuOpen ? "#f1f3f5" : "transparent" }}
                  >
                    <svg width="16" height="4" viewBox="0 0 16 4" fill="none">
                      <circle cx="2" cy="2" r="2" fill="#ADB5BD" />
                      <circle cx="8" cy="2" r="2" fill="#ADB5BD" />
                      <circle cx="14" cy="2" r="2" fill="#ADB5BD" />
                    </svg>
                  </button>
                  {menuOpen && (
                    <>
                      <div onClick={e => { e.stopPropagation(); setMenuOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 98 }} />
                      <div style={{ position: "absolute", top: 32, right: 0, background: "#fff", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,.15)", padding: "4px 0", zIndex: 99, minWidth: 120 }}>
                        <button
                          onClick={e => { e.stopPropagation(); if (onDelete) onDelete(data.docId); setMenuOpen(false); }}
                          style={{ display: "flex", width: "100%", padding: "10px 16px", fontSize: 14, fontWeight: 500, color: "#e03131", letterSpacing: "-.35px", whiteSpace: "nowrap", fontFamily: "Pretendard,sans-serif", background: "none", border: "none", textAlign: "left" }}
                        >🗑️ 삭제하기</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {/* 제목 + 날짜 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: "#171a1d", lineHeight: "28px", letterSpacing: "-.45px", margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.title || "기록"}</h3>
                <span style={{ fontSize: 14, color: "#646d76", flexShrink: 0 }}>{ds}</span>
              </div>
            </div>
            <div className="exercise-scroll" style={{ display: "flex", gap: 8, overflowX: "auto", webkitOverflowScrolling: "touch" }}>
              {data.exercises && data.exercises.length > 0
                ? data.exercises.map((ex, i) => (
                  <div key={i} style={{ background: "#f1f3f5", borderRadius: 16, padding: 8, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", flexShrink: 0, width: 96 }}>
                    <div style={{ background: "#fff", height: 48, borderRadius: 8, width: "100%" }} />
                    <p style={{ fontSize: 14, fontWeight: 500, color: "#495057", textAlign: "center", lineHeight: "20px", width: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{ex.name}</p>
                  </div>
                ))
                : <div style={{ background: "#f1f3f5", borderRadius: 16, padding: 16, width: "100%" }}>
                  <span style={{ fontSize: 14, color: "#495057" }}>{data.originalText || "내용 없음"}</span>
                </div>
              }
            </div>
          </div>
          {data.aiComment && (
            <div style={{ borderTop: "1px solid #f1f3f5", padding: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <QuoteIcon gid={gid} />
              <p className="ai-text" style={{ fontSize: 14, fontWeight: 500, lineHeight: "20px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{data.aiComment}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
