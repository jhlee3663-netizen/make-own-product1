import React, { useState } from 'react';
import DonutChart from './DonutChart';
import { QuoteIcon } from '../icons/Icons';

export default function DietCard({ data, onDelete, isDeleting }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dt = data.timestamp ? new Date(data.timestamp.seconds * 1000) : null;
  const ds = dt ? `${String(dt.getFullYear()).slice(2)}. ${dt.getMonth() + 1}. ${dt.getDate()}` : "";
  const gid = "qG_" + (data.docId || "x");

  return (
    <div className={isDeleting ? "card-exit-wrapper" : ""}>
      <div style={{ padding: "8px 16px" }}>
        <div className="card-enter" style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 0 25px rgba(3,27,38,.08)" }}>
          <div style={{ padding: "16px 16px 4px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "inline-flex", background: "rgba(0,183,189,.1)", padding: "4px 8px", borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#00b7bd" }}>식단 기록 🥗</span>
              </div>
              <div style={{ position: "relative" }}>
                <button onClick={() => setMenuOpen(!menuOpen)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: menuOpen ? "#f1f3f5" : "transparent" }}>
                  <svg width="16" height="4" viewBox="0 0 16 4" fill="none">
                    <circle cx="2" cy="2" r="2" fill="#ADB5BD" />
                    <circle cx="8" cy="2" r="2" fill="#ADB5BD" />
                    <circle cx="14" cy="2" r="2" fill="#ADB5BD" />
                  </svg>
                </button>
                {menuOpen && (
                  <>
                    <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 98 }} />
                    <div style={{ position: "absolute", top: 32, right: 0, background: "#fff", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,.15)", padding: "4px 0", zIndex: 99, minWidth: 120 }}>
                      <button onClick={() => { if (onDelete) onDelete(data.docId); setMenuOpen(false); }}
                        style={{ display: "flex", width: "100%", padding: "10px 16px", fontSize: 14, color: "#e03131", fontWeight: 500, background: "none", border: "none", textAlign: "left" }}>
                        🗑️ 삭제하기
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{data.title || "오늘의 식사"}</h3>
              <span style={{ fontSize: 14, color: "#868e96" }}>{ds}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
              <DonutChart carb={data.carb || 0} protein={data.protein || 0} fat={data.fat || 0} />
              <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3385ff" }} />
                    <span style={{ fontSize: 14, color: "#495057", fontWeight: 500 }}>탄수화물</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#212529" }}>{data.carbGram || 0}g</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e05a2b" }} />
                    <span style={{ fontSize: 14, color: "#495057", fontWeight: 500 }}>단백질</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#212529" }}>{data.proteinGram || 0}g</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e8a126" }} />
                    <span style={{ fontSize: 14, color: "#495057", fontWeight: 500 }}>지방</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#212529" }}>{data.fatGram || 0}g</span>
                </div>
              </div>
            </div>
          </div>
          {data.aiComment && (
            <div style={{ borderTop: "1px solid #f8f9fa", background: "#fcfcfc", padding: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <QuoteIcon gid={gid} />
              <p className="ai-text" style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.6, flex: 1, margin: 0 }}>{data.aiComment}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
