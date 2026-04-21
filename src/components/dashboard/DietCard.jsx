import React from 'react';
import DonutChart from './DonutChart';
import { QuoteIcon } from '../icons/Icons';

export default function DietCard({ data, isDeleting }) {
  const dt = data.timestamp ? new Date(data.timestamp.seconds * 1000) : null;
  const ds = dt ? `${String(dt.getFullYear()).slice(2)}. ${dt.getMonth() + 1}. ${dt.getDate()}` : (data.date || "");
  const gid = "qG_" + (data.docId || Math.random().toString(36).substr(2, 9));

  return (
    <div className={`px-4 py-2 transition-all duration-300 ${isDeleting ? 'card-exit-wrapper' : 'card-enter'}`}>
      <div className="bg-white rounded-[16px] overflow-hidden shadow-[0_0_25px_rgba(3,27,38,0.08)] cursor-pointer border border-transparent hover:border-ui-3 transition-transform duration-200 active:scale-[0.98]">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2 pb-4 border-b border-[#f1f3f5]">
            <div className="inline-flex bg-[#0054d1]/10 px-2 py-1 rounded-[8px] w-fit">
              <span className="text-[13px] text-[#0054d1] font-pretendard tracking-[-0.325px] whitespace-nowrap">성공 🔥</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[24px] font-semibold text-[#171a1d] leading-[32px] tracking-[-0.6px] m-0 font-pretendard">
                {(data.kcal || 0).toLocaleString()} kcal
              </p>
              <span className="text-[14px] text-[#646d76] tracking-[-0.35px] font-pretendard m-0">{ds}</span>
            </div>
            <p className="text-[14px] text-[#868e96] tracking-[-0.35px] m-0 font-pretendard">목표 {(data.goal || 0).toLocaleString()}</p>
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
        {data.aiComment && (
          <div className="border-t border-[#f1f3f5] p-4 flex gap-2 items-start bg-white">
            <QuoteIcon gid={gid} />
            <div className="flex-1 mt-0.5 min-w-0">
              <p className="font-pretendard font-medium text-[14px] text-transparent bg-clip-text bg-gradient-to-r from-[#228bed] to-[#c509d6] tracking-[-0.35px] leading-[20px] m-0 truncate">
                {data.aiComment}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
