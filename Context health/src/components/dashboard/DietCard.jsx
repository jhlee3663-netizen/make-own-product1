import React, { useState } from 'react';
import DonutChart from './DonutChart';
import { QuoteIcon } from '../icons/Icons';
import { getDietSummaryComment } from '../../utils/dietFeedback';
import Pressable from '../common/Pressable';

function getChip(kcal, goal) {
  if (!goal) return { label: '성공 🔥', color: '#3476EE', bg: 'rgba(0,84,209,0.1)' };
  const ratio = kcal / goal;
  if (ratio > 1.1) return { label: '과식했어요 😅', color: '#e05a2b', bg: 'rgba(255,80,80,0.1)' };
  if (ratio < 1.0) return { label: '더 먹어요 🍚', color: '#008dcf', bg: 'rgba(0,152,178,0.1)' };
  return { label: '성공 🔥', color: '#3476EE', bg: 'rgba(0,84,209,0.1)' };
}

export default function DietCard({ data, isDeleting, targetKcal, profile, onDelete, onChangeDate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dt = data.timestamp ? new Date(data.timestamp.seconds * 1000) : null;
  const ds = dt ? `${String(dt.getFullYear()).slice(2)}. ${dt.getMonth() + 1}. ${dt.getDate()}` : (data.date || "");
  const gid = "qG_" + (data.docId || Math.random().toString(36).substr(2, 9));
  const effectiveGoal = targetKcal || data.goal || 0;
  const chip = getChip(data.kcal || 0, effectiveGoal);
  const summaryComment = getDietSummaryComment(data, profile, effectiveGoal);

  return (
    <div className={`px-4 py-2 transition-all duration-300 ${isDeleting ? 'card-exit-wrapper' : 'card-enter'}`}>
      <Pressable as="div" pressScale={0.985} className="bg-white rounded-[16px] overflow-hidden shadow-[0_0_25px_rgba(3,27,38,0.08)] cursor-pointer border border-transparent hover:border-ui-3">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2 pb-4 border-b border-[#f1f3f5]">
            <div className="flex items-center justify-between">
              <div className="inline-flex px-2 py-1 rounded-[8px] w-fit" style={{ background: chip.bg }}>
                <span className="text-[13px] font-pretendard tracking-[-0.325px] whitespace-nowrap" style={{ color: chip.color }}>{chip.label}</span>
              </div>
              <div className="relative">
                <Pressable
                  pressScale={0.85}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
                  className={`w-6 h-6 flex items-center justify-center rounded-full ${menuOpen ? 'bg-ui-2' : 'hover:bg-ui-2'}`}
                >
                  <svg width="20" height="4" viewBox="0 0 20 4" fill="none">
                    <circle cx="2" cy="2" r="2" fill="#ADB5BD"/>
                    <circle cx="10" cy="2" r="2" fill="#ADB5BD"/>
                    <circle cx="18" cy="2" r="2" fill="#ADB5BD"/>
                  </svg>
                </Pressable>
                {menuOpen && (
                  <>
                    <div onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} className="fixed inset-0 z-[98]" />
                    <div className="absolute top-8 right-0 bg-white rounded-[12px] shadow-lg py-1 z-[99] min-w-[120px]" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (onChangeDate) onChangeDate(data); setMenuOpen(false); }}
                        className="flex w-full px-4 py-[10px] text-body-s text-[#171a1d] font-medium bg-none border-none text-left active:opacity-60 active:bg-ui-1 border-b border-ui-2"
                      >
                        📅 날짜 변경
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (onDelete) onDelete(data); setMenuOpen(false); }}
                        className="flex w-full px-4 py-[10px] text-body-s text-[#e03131] font-medium bg-none border-none text-left active:opacity-60 active:bg-[#fff5f5]"
                      >
                        🗑️ 삭제하기
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[24px] font-semibold text-[#171a1d] leading-[32px] tracking-[-0.6px] m-0 font-pretendard">
                {(data.kcal || 0).toLocaleString()} kcal
              </p>
              <span className="text-[14px] text-[#646d76] tracking-[-0.35px] font-pretendard m-0">{ds}</span>
            </div>
            <p className="text-[14px] text-[#868e96] tracking-[-0.35px] m-0 font-pretendard">목표 {effectiveGoal.toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-4">
            <DonutChart carb={data.carb || 0} protein={data.protein || 0} fat={data.fat || 0} />
            <div className="flex flex-col gap-2 flex-1">
              {[
                { c: "#3385ff", l: "탄수화물", v: data.carb || 0 },
                { c: "#e05a2b", l: "단백질", v: data.protein || 0 },
                { c: "#e8a126", l: "지방", v: data.fat || 0 }
              ].map((item) => (
                <div key={item.l} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.c }} />
                  <span className="text-[12px] font-medium text-[#adb5bd] font-pretendard tracking-[-0.3px] flex-1">{item.l}</span>
                  <span className="text-[12px] font-semibold text-[#171a1d] font-pretendard">{item.v}g</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {summaryComment && (
          <div className="border-t border-[#f1f3f5] p-4 flex gap-2 items-start bg-white">
            <QuoteIcon gid={gid} />
            <div className="flex-1 mt-0.5 min-w-0">
              <p className="font-pretendard font-medium text-[14px] text-transparent bg-clip-text bg-gradient-to-r from-[#228bed] to-[#c509d6] tracking-[-0.35px] leading-[20px] m-0 truncate">
                {summaryComment}
              </p>
            </div>
          </div>
        )}
      </Pressable>
    </div>
  );
}
