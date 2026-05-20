import React, { useState, useEffect, useRef } from 'react';
import { IcBack, IcMore, IcKeyboard, IcAI, IcUndo, IcRedo, IcSpark, IcPlus } from '../icons/Icons';
import WorkoutTaskItem from '../common/WorkoutTaskItem';
import Button from '../common/Button';
import ConfirmModal from '../common/ConfirmModal';
import Pressable from '../common/Pressable';
import { db } from '../../lib/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { parseVolume, sumReps } from '../../utils/utils';
import { filterBodyParts, BODYWEIGHT_BASES } from '../../utils/exerciseData';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Paintbrush, Highlighter,
  Type
} from 'lucide-react';

const TEXT_COLORS = [
  '#171719', '#e03e52', '#f07800', '#d4a017',
  '#1a9e5c', '#0066ff', '#8b5cf6', '#868e96',
];
const HIGHLIGHT_COLORS = [
  'transparent', '#fef08a', '#bbf7d0', '#bfdbfe',
  '#fecaca', '#e9d5ff', '#fed7aa',
];

const SUMMARY_SET_TYPES = [
  { pattern: /\(드랍(?:\s*세트?)?\)|드랍\s*세트/gi, label: '드랍', color: '#d47800' },
  { pattern: /\(슈퍼(?:\s*세트?)?\)|슈퍼\s*세트/gi, label: '슈퍼세트', color: '#7b1fa2' },
  { pattern: /\(컴파운드(?:\s*세트?)?\)|컴파운드\s*세트/gi, label: '컴파운드', color: '#1565c0' },
  { pattern: /\(강제\s*반복\)|강제\s*반복/gi, label: '강제반복', color: '#c62828' },
  { pattern: /\(저\s*중량\)|저중량/gi, label: '저중량고반복', color: '#2e7d32' },
];

const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;

function groupBySupersets(items) {
  const groups = [];
  let i = 0;
  while (i < items.length) {
    const sg = items[i].supersetGroup;
    if (!sg) {
      groups.push({ isSuperset: false, items: [items[i]] });
      i++;
    } else {
      const group = [];
      while (i < items.length && items[i].supersetGroup === sg) {
        group.push(items[i]);
        i++;
      }
      groups.push({ isSuperset: true, supersetGroup: sg, items: group });
    }
  }
  return groups;
}

const createEmptyWorkoutSections = () => [
  { id: 1, part: "", items: [] }
];

function RichToolbarBtn({ active, onClick, children, title }) {
  return (
    <button
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`flex-none flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${active ? 'bg-brand/15 text-brand' : 'text-typo-secondary hover:bg-ui-2'}`}
    >
      {children}
    </button>
  );
}

function SummaryBodyRenderer({ body, note }) {
  const lines = (body || '').split('\n').filter(l => l.trim());

  const lineTypes = lines.map(l => {
    if (l.trim().startsWith('💬')) return [];
    return SUMMARY_SET_TYPES.filter(t => { t.pattern.lastIndex = 0; return t.pattern.test(l); });
  });
  const hasMark = lineTypes.map(types => types.length > 0);

  // Line i is "in group" if it has a mark, or if the immediately next non-💬 line has a mark
  const inGroup = lines.map((l, i) => {
    if (l.trim().startsWith('💬')) return false;
    if (hasMark[i]) return true;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim().startsWith('💬')) return hasMark[j];
    }
    return false;
  });

  // Build segments: consecutive inGroup lines → single box, others → individual
  const segments = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith('💬')) {
      segments.push({ type: 'note-inline', line: lines[i] });
      i++;
    } else if (inGroup[i]) {
      const gLines = [];
      const gTypes = [];
      while (i < lines.length && inGroup[i] && !lines[i].trim().startsWith('💬')) {
        gLines.push(lines[i]);
        lineTypes[i].forEach(t => { if (!gTypes.find(gt => gt.label === t.label)) gTypes.push(t); });
        i++;
      }
      segments.push({ type: 'group', lines: gLines, types: gTypes });
    } else {
      segments.push({ type: 'normal', line: lines[i] });
      i++;
    }
  }

  const hasUnitChip = (line) => /\d+\s*(lbs?|파운드|칸)/i.test(line);
  const renderTypeChip = (type) => (
    <span
      key={type.label}
      className="bg-white inline-flex h-6 items-center justify-center px-3 rounded-full text-[11px] font-normal font-pretendard leading-4 tracking-[-0.275px] whitespace-nowrap"
      style={{ color: type.color }}
    >
      {type.label}
    </span>
  );

  return (
    <div className="flex flex-col gap-1">
      {segments.map((seg, idx) => {
        if (seg.type === 'note-inline') {
          return (
            <span key={idx} className="block px-2.5 py-1.5 rounded-lg bg-white/60 text-[11px] italic text-typo-secondary leading-relaxed">
              {seg.line}
            </span>
          );
        }
        if (seg.type === 'group') {
          const hasKgChip = seg.lines.some(hasUnitChip);
          return (
            <div key={idx} className="rounded-[16px] px-2 pt-4 pb-3 my-1 flex flex-col gap-4 bg-[rgba(212,120,0,0.1)]">
              {seg.lines.map((line, li) => (
                <div key={li} className="text-[14px] font-medium font-pretendard text-[#646d76] leading-[22px] tracking-[-0.35px]">{line}</div>
              ))}
              {(seg.types.length > 0 || hasKgChip) && (
                <div className="flex items-start gap-1 flex-wrap">
                  {seg.types.map(renderTypeChip)}
                  {hasKgChip && (
                    <span className="bg-white inline-flex h-6 items-center justify-center px-3 rounded-full text-[11px] font-normal font-pretendard leading-4 tracking-[-0.275px] text-[#48ad00] whitespace-nowrap">
                      kg 변환 완료
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={idx} className="flex items-center gap-2 py-2">
            <span className="text-[14px] font-medium font-pretendard text-[#646d76] leading-5 tracking-[-0.35px] flex-1">{seg.line}</span>
            {hasUnitChip(seg.line) && (
              <span className="bg-[rgba(72,173,0,0.1)] inline-flex h-6 items-center justify-center px-3 rounded-full text-[11px] font-normal font-pretendard leading-4 tracking-[-0.275px] text-[#48ad00] whitespace-nowrap">
                kg 변환 완료
              </span>
            )}
          </div>
        );
      })}
      {note && (
        <span className="block px-2.5 py-1.5 rounded-lg bg-white/60 text-[11px] italic text-typo-secondary leading-relaxed">
          💬 {note}
        </span>
      )}
    </div>
  );
}

export default function WorkoutMemoScreen({ onBack, onSave, initialData, uid, profile, onOpenCoachWithMessage }) {
  const originalSectionsRef = useRef(null);
  const [showExitModal, setShowExitModal] = useState(false);

  useEffect(() => {
    if (!originalSectionsRef.current) {
      originalSectionsRef.current = JSON.stringify(sections);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBackClick = () => {
    let isDirty = false;
    if (freeMode) {
      const currentHtml = editorRef.current?.innerHTML || '';
      isDirty = currentHtml !== (initialData?.freeHtml || '');
    } else {
      isDirty = JSON.stringify(sections) !== originalSectionsRef.current;
    }
    
    if (isDirty) {
      setShowExitModal(true);
    } else {
      onBack();
    }
  };

  /* ── 자유 메모 모드 ── */
  const [freeMode, setFreeMode] = useState(() => {
    if (!initialData?.freeHtml) return false;
    // AI가 완료되고 sections가 있으면 구조적 모드로 열기
    if (initialData?.aiStatus === 'done' && initialData?.sections?.length > 0) return false;
    return true;
  });
  const editorRef = useRef(null);
  const [showColorPicker, setShowColorPicker] = useState(null); // null | 'text' | 'highlight'
  const [activeFormats, setActiveFormats] = useState({});
  const [currentTextColor, setCurrentTextColor] = useState('#171719');
  const [currentHighlight, setCurrentHighlight] = useState('transparent');

  useEffect(() => {
    if (freeMode && editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = initialData?.freeHtml || '';
      // 기존 메모 편집 시 auto-focus는 iOS 스크롤 버그를 유발하므로 새 메모만 포커스
      if (!initialData?.freeHtml) {
        editorRef.current.focus();
      }
    }
  }, [freeMode]);

  function updateActiveFormats() {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      justifyLeft: document.queryCommandState('justifyLeft'),
      justifyCenter: document.queryCommandState('justifyCenter'),
      justifyRight: document.queryCommandState('justifyRight'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    });
  }

  function execFormat(cmd, value) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value ?? null);
    updateActiveFormats();
  }

  function applyTextColor(color) {
    setCurrentTextColor(color);
    execFormat('foreColor', color);
    setShowColorPicker(null);
  }

  function applyHighlight(color) {
    setCurrentHighlight(color);
    execFormat('hiliteColor', color === 'transparent' ? 'inherit' : color);
    setShowColorPicker(null);
  }

  function applyFontSize(size) {
    execFormat('fontSize', size);
  }

  const [sections, setSections] = useState(() => {
    if (initialData && initialData.sections && initialData.sections.length > 0) {
      return initialData.sections.map((s, i) => ({
        id: i + 1,
        part: s.part || "",
        items: (s.items || []).map((it, j) => ({ id: j + 1, title: it.title || "", body: it.body || "", supersetGroup: it.supersetGroup ?? null }))
      }));
    }
    return createEmptyWorkoutSections();
  });
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [bsOpen, setBsOpen] = useState(false);
  const [isBsLoading, setIsBsLoading] = useState(false);
  const [parsedSections, setParsedSections] = useState([]);
  const [exerciseStats, setExerciseStats] = useState({});
  const [exerciseRepStats, setExerciseRepStats] = useState({});

  // 섹션별 AI 팝오버
  const [sectionPopover, setSectionPopover] = useState(null); // secId
  const [sectionPopoverSource, setSectionPopoverSource] = useState(null); // 'section' | 'item'
  const [sectionPopoverPos, setSectionPopoverPos] = useState({ top: 0 });
  const [sectionAiLoading, setSectionAiLoading] = useState(null); // secId

  // 운동 부위 자동완성
  const [partSuggestions, setPartSuggestions] = useState({ secId: null, items: [] });

  // 최근 기록 바텀시트
  const [recentSheet, setRecentSheet] = useState({ open: false, secId: null, itemId: null, mode: 'section', records: [], currentIdx: 0, loading: false });

  // 더보기 바텀시트
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  // 워크아웃 모드 (과부하 / 디로딩)
  const [workoutMode, setWorkoutMode] = useState('overload');

  // 글 정리 후 종목별 볼륨 증감
  const [exerciseVolumeDeltas, setExerciseVolumeDeltas] = useState({});
  const [exerciseRepDeltas, setExerciseRepDeltas] = useState({});

  // 섹션별 AI 루틴 근거
  const [sectionAiTheories, setSectionAiTheories] = useState({});
  // 팝오버가 item 레벨에서 열렸을 때의 itemId
  const [sectionPopoverItemId, setSectionPopoverItemId] = useState(null);
  // 증량 비율 (%)
  const [incrementPercent, setIncrementPercent] = useState(5);

  // 단위 변환 중인 아이템 id (여러 동시 변환 지원)
  const convertingItems = useRef(new Set());
  const [convertingVersion, setConvertingVersion] = useState(0);
  const touchStartX = useRef(0);

  // 구조적 모드 undo/redo 히스토리
  const historyStack = useRef([]);
  const historyIndex = useRef(-1);
  const isUndoRedo = useRef(false);
  const historyTimer = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // sections 변경 시 히스토리 스냅샷 (800ms 디바운스)
  useEffect(() => {
    if (isUndoRedo.current) { isUndoRedo.current = false; return; }
    if (historyTimer.current) clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(() => {
      const snapshot = JSON.parse(JSON.stringify(sections));
      historyStack.current = historyStack.current.slice(0, historyIndex.current + 1);
      historyStack.current.push(snapshot);
      if (historyStack.current.length > 50) {
        historyStack.current = historyStack.current.slice(-50);
      }
      historyIndex.current = historyStack.current.length - 1;
      setCanUndo(historyIndex.current > 0);
      setCanRedo(false);
    }, 800);
  }, [sections]);

  useEffect(() => {
    return () => {
      if (historyTimer.current) clearTimeout(historyTimer.current);
      Object.values(fetchTimers.current).forEach(clearTimeout);
    };
  }, []);

  function handleUndo() {
    if (freeMode) { execFormat('undo'); return; }
    if (historyIndex.current > 0) {
      isUndoRedo.current = true;
      historyIndex.current--;
      setSections(JSON.parse(JSON.stringify(historyStack.current[historyIndex.current])));
      setCanUndo(historyIndex.current > 0);
      setCanRedo(true);
    }
  }
  function handleRedo() {
    if (freeMode) { execFormat('redo'); return; }
    if (historyIndex.current < historyStack.current.length - 1) {
      isUndoRedo.current = true;
      historyIndex.current++;
      setSections(JSON.parse(JSON.stringify(historyStack.current[historyIndex.current])));
      setCanUndo(true);
      setCanRedo(historyIndex.current < historyStack.current.length - 1);
    }
  }

  const fetchTimers = useRef({});

  function normalizeExerciseName(name) {
    return (name || '').replace(/\s+/g, '').toLowerCase();
  }

  function isBodyweightExercise(title) {
    const base = (title || '').replace(/^(어시스티드|가중)\s*/u, '').trim();
    return BODYWEIGHT_BASES.has(base);
  }

  function parseMaxWeight(text) {
    if (!text) return null;
    const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)];
    if (!matches.length) return null;
    return Math.max(...matches.map(m => parseFloat(m[1])));
  }

  function parseVolumeFromBody(body) {
    if (!body) return 0;
    let total = 0;
    for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))/g))
      total += parseFloat(m[1]) * parseInt(m[2] || m[3]);
    for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*(?:lbs?|파운드)\s*(?:(\d+)\s*회|[x×]\s*(\d+))/gi))
      total += parseFloat(m[1]) * 0.453592 * parseInt(m[2] || m[3]);
    for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*칸\s*(?:(\d+)\s*회|[x×]\s*(\d+))/g))
      total += parseFloat(m[1]) * 5 * parseInt(m[2] || m[3]);
    return total;
  }

  async function fetchPrevWeight(exerciseName) {
    if (!exerciseName?.trim() || !uid) return;
    const normalizedName = normalizeExerciseName(exerciseName);
    const isBW = isBodyweightExercise(exerciseName);
    const q = query(collection(db, "logs"), where("uid", "==", uid));
    const snap = await getDocs(q);
    const sorted = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    for (const d of sorted) {
      if (initialData && d.id === initialData.docId) continue;
      for (const sec of (d.sections || [])) {
        for (const item of (sec.items || [])) {
          if (normalizeExerciseName(item.title) === normalizedName && item.body) {
            if (isBW) {
              const reps = sumReps(item.body);
              if (reps > 0) {
                setExerciseRepStats(prev => ({ ...prev, [exerciseName]: reps }));
                return;
              }
            } else {
              const w = parseMaxWeight(item.body);
              if (w !== null) {
                setExerciseStats(prev => ({ ...prev, [exerciseName]: w }));
                return;
              }
            }
          }
        }
      }
    }
    if (isBW) {
      setExerciseRepStats(prev => ({ ...prev, [exerciseName]: null }));
    } else {
      setExerciseStats(prev => ({ ...prev, [exerciseName]: null }));
    }
  }

  function scheduleFetchPrevWeight(title) {
    if (fetchTimers.current[title]) clearTimeout(fetchTimers.current[title]);
    fetchTimers.current[title] = setTimeout(() => fetchPrevWeight(title), 800);
  }

  useEffect(() => {
    sections.forEach(sec => {
      sec.items.forEach(item => {
        if (item.title?.trim()) fetchPrevWeight(item.title);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 툴바 AI 글정리 ── */
  async function handleSummarize() {
    setAiMenuOpen(false);
    setBsOpen(true);
    setIsBsLoading(true);
    setExerciseVolumeDeltas({});
    setExerciseRepDeltas({});
    try {
      const rawText = sections.map(s => `부위: ${s.part}\n${s.items.map(i => `- 종목: ${i.title}\n  기록: ${i.body}`).join('\n')}`).join('\n\n');
      const prompt = `다음 사용자의 거친 운동 메모 데이터를 보기 좋게 정리해서 JSON 배열로 반환해줘.
응답 형식: [{ "part": "운동부위", "items": [{ "title": "운동종목", "body": "• 세트 1: 20kg 15회\\n• 세트 2: 40kg 20회", "note": "느낀점(선택)", "supersetGroup": null }] }]
중요 규칙:
1. 각 세트별 기록은 반드시 '• 세트 N: 무게 횟수' 형태로 작성해줘.
2. 여러 세트인 경우 쉼표(,) 대신 반드시 줄바꿈(\\n)으로 구분해서 작성해줘.
3. [가장 중요] 세트 번호(N)는 종목이 바뀌더라도 절대 1부터 다시 시작하지 말고, 이전 종목의 마지막 세트 번호에 이어서 전체 누적으로 계속 카운트해줘.
4. [가장 중요] 원문에 있는 (드랍), (드랍세트), (슈퍼세트), (컴파운드), (강제반복), (저중량) 같은 세트 타입 표기와, "양쪽" / "각 사이드" 같이 좌우 양쪽을 뜻하는 표기는 절대 삭제하지 말고 해당 세트의 body 텍스트 안에 그대로 유지해.
5. 드랍/슈퍼세트 등 세트 타입 표기는 note로 분리하지 마. 우리 앱은 body 안의 텍스트를 감지해 별도 뱃지로 처리한다.
6. [가장 중요] 슈퍼세트 처리 규칙:
   - 종목명 사이에 '+' 기호가 있거나, 명시적으로 (슈퍼세트)라고 적힌 경우 슈퍼세트로 판단해.
   - 슈퍼세트를 구성하는 각 종목은 별도의 item으로 분리해. 각 item의 body 모든 세트 라인 끝에 (슈퍼세트) 태그를 붙여줘.
   - 같은 슈퍼세트 묶음에 속하는 item들은 동일한 supersetGroup 정수(1부터 시작)를 부여해. 슈퍼세트가 아닌 item은 supersetGroup을 null로.
   - 슈퍼세트가 여러 개면 각각 다른 번호(1, 2, 3...)를 부여해.
   - 예시 — "킥백 + 레터럴레이즈 1set 킥백 8kg 10 + 레터럴 7kg 12" 입력 시:
     item1: title "덤벨킥백", supersetGroup 1, body "• 세트 1: 8kg 10회 (슈퍼세트)"
     item2: title "레터럴레이즈", supersetGroup 1, body "• 세트 1: 7kg 12회 (슈퍼세트)"
7. [가장 중요] 세트 기록과 함께 또는 독립적으로 적힌 주관적 느낌·코멘트 (예: "확실히 10회는 빡세다", "가슴&어깨 마사지받음, 확실히 나아짐", "자세가 흔들림", "다음엔 무게 늘려보자") 는 반드시 note 필드로 분리해. 쉼표로 이어진 문장 전체를 하나의 note로 합쳐야 해. 절대 일부만 잘라 넣지 마. kg/회/세트 숫자나 세트 타입 표기가 아닌 주관적 경험·느낌 텍스트만 note로. 없으면 note 필드 생략.
8. 운동 기록이 전혀 없고 코멘트만 있는 경우(예: "가슴 마사지받음"), body는 빈 문자열로, note에 해당 문장 전체를 넣어.
9. JSON 이외의 다른 텍스트(마크다운 등)는 절대 포함하지 마.

사용자 입력:
${rawText}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      if (!json.candidates || !json.candidates[0]) throw new Error("AI 응답 실패");
      const parts = json.candidates[0].content.parts;
      const text = (parts.find(p => !p.thought) ?? parts[parts.length - 1]).text;
      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanText);
      const mappedSections = parsed.map(s => ({
        id: Date.now() + Math.random(),
        part: s.part || "운동 부위",
        items: (s.items || []).map(it => ({
          id: Date.now() + Math.random(),
          title: it.title,
          body: it.body,
          note: it.note,
          supersetGroup: it.supersetGroup ?? null,
        }))
      }));
      setParsedSections(mappedSections);

      // 종목별 볼륨 증감 계산
      if (uid) {
        try {
          const q = query(collection(db, "logs"), where("uid", "==", uid), where("type", "==", "workout"));
          const snap = await getDocs(q);
          const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
          const deltas = {};
          const repDeltas = {};
          for (const sec of parsed) {
            for (const item of (sec.items || [])) {
              if (!item.title || deltas[item.title] !== undefined) continue;
              const normalizedTitle = normalizeExerciseName(item.title);
              const isBW = isBodyweightExercise(item.title);
              if (isBW) {
                const curReps = sumReps(item.body || '');
                if (curReps <= 0) continue;
                for (const d of sorted) {
                  if (initialData && d.id === initialData.docId) continue;
                  const prevItem = (d.sections || []).flatMap(s => s.items || []).find(it => normalizeExerciseName(it.title) === normalizedTitle);
                  if (prevItem?.body) {
                    const prevReps = sumReps(prevItem.body);
                    if (prevReps > 0) {
                      repDeltas[item.title] = curReps - prevReps;
                      break;
                    }
                  }
                }
              } else {
                const curVol = parseVolumeFromBody(item.body);
                if (curVol <= 0) continue;
                for (const d of sorted) {
                  if (initialData && d.id === initialData.docId) continue;
                  const prevItem = (d.sections || []).flatMap(s => s.items || []).find(it => normalizeExerciseName(it.title) === normalizedTitle);
                  if (prevItem?.body) {
                    const prevVol = parseVolumeFromBody(prevItem.body);
                    if (prevVol > 0) {
                      deltas[item.title] = parseFloat(((curVol - prevVol) / prevVol * 100).toFixed(1));
                      break;
                    }
                  }
                }
              }
            }
          }
          setExerciseVolumeDeltas(deltas);
          setExerciseRepDeltas(repDeltas);
        } catch {}
      }
    } catch (e) {
      console.error("AI 글 정리 에러:", e);
      alert("AI 글 정리 오류: " + e.message);
    } finally {
      setIsBsLoading(false);
    }
  }

  /* ── AI 피드백 (코치룸으로 이동) ── */
  function handleFeedback() {
    setAiMenuOpen(false);
    let memoText;
    let memoCard;
    if (freeMode) {
      memoText = editorRef.current?.innerText || '';
      memoCard = {
        title: '자유 메모',
        subtitle: '운동 메모 피드백 요청',
        mode: 'free',
        excerpt: memoText.trim().replace(/\s+/g, ' ').slice(0, 120),
      };
    } else {
      memoText = sections.map(s =>
        `[${s.part || '운동'}]\n` +
        s.items.map(it => `${it.title || ''}\n${it.body || ''}`).join('\n\n')
      ).join('\n\n');
      const cardSections = sections
        .filter(s => s.part?.trim() || s.items?.some(it => it.title?.trim() || it.body?.trim()))
        .map(s => ({
          part: s.part?.trim() || '운동',
          items: (s.items || [])
            .filter(it => it.title?.trim() || it.body?.trim())
            .slice(0, 3)
            .map(it => ({
              title: it.title?.trim() || '운동',
              body: (it.body || '').trim().split('\n').filter(Boolean).slice(0, 2).join(' / '),
            })),
          totalItems: (s.items || []).filter(it => it.title?.trim() || it.body?.trim()).length,
        }));
      const totalItems = cardSections.reduce((sum, section) => sum + section.totalItems, 0);
      memoCard = {
        title: '쇠질 메모',
        subtitle: `${cardSections.length || 1}개 부위 · ${totalItems || 0}개 종목`,
        mode: 'workout',
        sections: cardSections.slice(0, 3),
        totalSections: cardSections.length,
        totalItems,
      };
    }
    const trimmed = memoText.trim();
    if (!trimmed) return;
    onOpenCoachWithMessage?.('powerbuilding', {
      type: 'memo-feedback',
      text: `운동 메모 피드백 부탁해:\n\n${trimmed}`,
      displayText: '운동 메모 피드백을 요청했어요.',
      memoCard,
    });
  }

  /* ── 섹션별 AI 팝오버 열기 ── */
  function openSectionPopover(secId, e, source = 'section', itemId = null) {
    if (sectionPopover === secId && sectionPopoverSource === source && sectionPopoverItemId === itemId) {
      setSectionPopover(null);
      setSectionPopoverSource(null);
      setSectionPopoverItemId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const popoverWidth = 279;
    const left = Math.max(16, Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - 16));
    setSectionPopoverPos({ top: rect.bottom + 8, left });
    setSectionPopover(secId);
    setSectionPopoverSource(source);
    setSectionPopoverItemId(itemId);
  }

  /* ── 섹션별 AI 루틴 생성 ── */
  async function handleSectionAiRoutine(secId, source, itemId) {
    setSectionPopover(null);
    const sec = sections.find(s => s.id === secId);
    const isItemMode = source === 'item' && itemId;

    if (isItemMode) {
      const exerciseName = sec?.items.find(it => it.id === itemId)?.title?.trim();
      if (!exerciseName) { alert('운동 종목을 먼저 입력해주세요.'); return; }
    } else {
      if (!sec?.part?.trim()) { alert('운동 부위를 먼저 입력해주세요.'); return; }
    }

    setSectionAiLoading(secId);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

      if (isItemMode) {
        const exerciseName = sec.items.find(it => it.id === itemId).title.trim();
        let context = '';
        if (uid) {
          try {
            const q = query(collection(db, "logs"), where("uid", "==", uid), where("type", "==", "workout"));
            const snap = await getDocs(q);
            const sorted = snap.docs.map(d => ({ ...d.data() }))
              .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            const exerciseRecords = [];
            for (const d of sorted) {
              for (const s of (d.sections || [])) {
                const found = (s.items || []).find(it => it.title === exerciseName);
                if (found?.body) { exerciseRecords.push(found.body); break; }
              }
              if (exerciseRecords.length >= 3) break;
            }
            if (exerciseRecords.length > 0) {
              context = `\n\n사용자의 최근 ${exerciseName} 기록:\n` + exerciseRecords.join('\n---\n');
            }
          } catch {}
        }

        const prompt = `사용자가 "${exerciseName}" 운동의 오늘 세트 구성을 제안해줘.${context}

JSON 형식으로만 반환해줘:
{ "theory": "이 세트 구성의 근거를 1-2문장으로 (예: 과거 기록 대비 5% 점진적 과부하 적용...)", "body": "• 세트 1: Xkg N회 (설명)\\n• 세트 2: Xkg N회 (설명)\\n• 세트 3: Xkg N회 (설명)" }

규칙:
1. 3~5세트 구성
2. 과거 기록 기반으로 무게 제안, 없으면 적절한 초급 무게로
3. 괄호 안에 권장 무게 이유 또는 목표 간략히
4. JSON만 반환`;

        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message);
        const resParts = json.candidates[0].content.parts;
        const text = (resParts.find(p => !p.thought) ?? resParts[resParts.length - 1]).text;
        const parsed = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());

        const theoryNote = parsed.theory ? `\n\n💬 ${parsed.theory}` : '';
        setSections(prev => prev.map(s => s.id !== secId ? s : {
          ...s,
          items: s.items.map(it => it.id !== itemId ? it : { ...it, body: (parsed.body || '') + theoryNote, isAI: true })
        }));
      } else {
        let context = '';
        if (uid) {
          try {
            const q = query(collection(db, "logs"), where("uid", "==", uid), where("type", "==", "workout"));
            const snap = await getDocs(q);
            const sorted = snap.docs.map(d => ({ ...d.data() }))
              .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            const relevant = sorted.filter(d => (d.sections || []).some(s => s.part === sec.part)).slice(0, 2);
            if (relevant.length > 0) {
              context = `\n\n사용자의 최근 ${sec.part} 기록:\n` + relevant.map(d => {
                const s = d.sections.find(s => s.part === sec.part);
                return (s?.items || []).map(it => `- ${it.title}: ${it.body}`).join('\n');
              }).join('\n');
            }
          } catch {}
        }

        const prompt = `사용자가 "${sec.part}" 부위를 운동할 루틴을 짜줘.${context}

JSON 형식으로만 반환해줘:
{ "theory": "이 루틴 구성의 근거를 1-2문장으로 (예: 대흉근 전체 자극을 위해 수평/경사 각도 복합 구성...)", "items": [{ "title": "운동명", "body": "• 세트 1: Xkg N회 (설명)\\n• 세트 2: Xkg N회 (설명)\\n• 세트 3: Xkg N회 (설명)" }] }

규칙:
1. 3~5가지 종목, 각 종목 3세트
2. 과거 기록 기반으로 무게를 제안하되, 없으면 적절한 초급 무게로
3. 괄호 안에 권장 무게 이유 또는 목표 간략히
4. JSON만 반환`;

        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message);
        const resParts = json.candidates[0].content.parts;
        const text = (resParts.find(p => !p.thought) ?? resParts[resParts.length - 1]).text;
        const parsed = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());

        const items = parsed.items || [];
        setSections(prev => prev.map(s => s.id !== secId ? s : {
          ...s,
          items: items.map((it, i) => ({ id: Date.now() + i, title: it.title || '', body: it.body || '', isAI: true }))
        }));
        if (parsed.theory) {
          setSectionAiTheories(prev => ({ ...prev, [secId]: parsed.theory }));
        }
      }
    } catch (e) {
      alert("AI 루틴 생성 오류: " + e.message);
    } finally {
      setSectionAiLoading(null);
    }
  }

  /* ── 최근 기록 보기 ── */
  async function handleShowRecentRecords(secId, source, itemId) {
    setSectionPopover(null);
    if (!uid) return;
    const sec = sections.find(s => s.id === secId);
    const q = query(collection(db, "logs"), where("uid", "==", uid), where("type", "==", "workout"));

    if (source === 'item' && itemId) {
      const exerciseName = sec?.items.find(it => it.id === itemId)?.title?.trim();
      if (!exerciseName) return;

      setRecentSheet({ open: true, secId, itemId, mode: 'item', records: [], currentIdx: 0, loading: true });
      try {
        const snap = await getDocs(q);
        const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        const matching = [];
        for (const d of sorted) {
          if (initialData && d.id === initialData.docId) continue;
          for (const s of (d.sections || [])) {
            const found = (s.items || []).find(it => it.title === exerciseName);
            if (found) {
              matching.push({
                docId: d.id,
                date: d.timestamp?.toDate ? d.timestamp.toDate() : new Date((d.timestamp?.seconds || 0) * 1000),
                section: { part: exerciseName, items: [found] }
              });
              break;
            }
          }
          if (matching.length >= 6) break;
        }
        setRecentSheet(prev => ({ ...prev, records: matching, loading: false }));
      } catch (e) {
        alert("기록 조회 오류: " + e.message);
        setRecentSheet(prev => ({ ...prev, loading: false }));
      }
    } else {
      setRecentSheet({ open: true, secId, itemId: null, mode: 'section', records: [], currentIdx: 0, loading: true });
      try {
        const snap = await getDocs(q);
        const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        const matching = [];
        for (const d of sorted) {
          if (initialData && d.id === initialData.docId) continue;
          const part = sec?.part?.trim();
          const matchingSec = (d.sections || []).find(s =>
            !part || s.part === part || s.part?.includes(part) || part?.includes(s.part)
          );
          if (matchingSec) {
            matching.push({
              docId: d.id,
              date: d.timestamp?.toDate ? d.timestamp.toDate() : new Date((d.timestamp?.seconds || 0) * 1000),
              section: matchingSec
            });
            if (matching.length >= 6) break;
          }
        }
        setRecentSheet(prev => ({ ...prev, records: matching, loading: false }));
      } catch (e) {
        alert("기록 조회 오류: " + e.message);
        setRecentSheet(prev => ({ ...prev, loading: false }));
      }
    }
  }

  /* lb/칸 단위는 텍스트 변환 없이 볼륨 계산에서만 kg으로 처리 */
  function handleBodyBlur() {}

  /* ── 더보기: 복사 / 새로 시작 ── */
  function handleCopyToClipboard() {
    const text = sections.map(s =>
      `[${s.part || '운동'}]\n` +
      s.items.map(it => `${it.title || ''}\n${it.body || ''}`).join('\n\n')
    ).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setMoreSheetOpen(false);
    }).catch(() => {
      setMoreSheetOpen(false);
    });
  }

  function handleResetSections() {
    setSections(createEmptyWorkoutSections());
    setMoreSheetOpen(false);
  }

  function incrementWeights(text, percent = 5) {
    return (text || '').replace(/(\d+(?:\.\d+)?)\s*kg/gi, (_, w) => {
      const newW = Math.round((parseFloat(w) * (1 + percent / 100)) / 2.5) * 2.5;
      return `${newW}kg`;
    });
  }

  function handleUseRecord(withIncrement) {
    const rec = recentSheet.records[recentSheet.currentIdx];
    if (!rec) return;
    if (recentSheet.mode === 'item' && recentSheet.itemId) {
      const itemBody = rec.section.items[0]?.body || '';
      setSections(prev => prev.map(s => s.id === recentSheet.secId ? {
        ...s,
        items: s.items.map(it => it.id === recentSheet.itemId ? {
          ...it,
          body: withIncrement ? incrementWeights(itemBody, incrementPercent) : itemBody,
          isAI: false
        } : it)
      } : s));
    } else {
      const newItems = (rec.section.items || []).map((it, i) => ({
        id: Date.now() + i,
        title: it.title || '',
        body: withIncrement ? incrementWeights(it.body, incrementPercent) : (it.body || ''),
        isAI: false
      }));
      setSections(prev => prev.map(s => s.id === recentSheet.secId ? { ...s, items: newItems } : s));
    }
    setRecentSheet(prev => ({ ...prev, open: false }));
  }

  function formatRecordDate(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return `${String(d.getFullYear()).slice(2)}. ${d.getMonth() + 1}. ${d.getDate()}`;
  }

  /* ── 섹션/항목 수정 ── */
  function updatePart(secId, val) {
    setSections(prev => prev.map(s => s.id === secId ? { ...s, part: val } : s));
  }
  function updateItem(secId, itemId, field, val) {
    setSections(prev => prev.map(s =>
      s.id !== secId ? s : {
        ...s,
        items: s.items.map(it => it.id !== itemId ? it : { ...it, [field]: val })
      }
    ));
    if (field === 'title') scheduleFetchPrevWeight(val);
  }
  function addItem(secId) {
    setSections(prev => prev.map(s =>
      s.id !== secId ? s : { ...s, items: [...s.items, { id: Date.now(), title: "", body: "" }] }
    ));
  }
  function addSection() {
    const id = Date.now();
    setSections(prev => [...prev, { id, part: "", items: [{ id: id + 1, title: "", body: "" }] }]);
  }

  /* ── 백그라운드 AI 처리 ── */
  async function runBackgroundAI(docRef, currentSections, title, capturedMode, rawTextOverride) {
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
    try {
      // 글 정리
      const rawText = rawTextOverride || currentSections.map(s =>
        `부위: ${s.part}\n${s.items.map(i => `- 종목: ${i.title}\n  기록: ${i.body}`).join('\n')}`
      ).join('\n\n');
      const summarizePrompt = `다음 사용자의 거친 운동 메모 데이터를 보기 좋게 정리해서 JSON 배열로 반환해줘.
응답 형식: [{ "part": "운동부위", "items": [{ "title": "운동종목", "body": "• 세트 1: 20kg 15회\\n• 세트 2: 40kg 20회", "note": "느낀점(선택)" }] }]
중요 규칙:
1. 각 세트별 기록은 반드시 '• 세트 N: 무게 횟수' 형태로 작성해줘.
2. 여러 세트인 경우 쉼표(,) 대신 반드시 줄바꿈(\\n)으로 구분해서 작성해줘.
3. [가장 중요] 세트 번호(N)는 종목이 바뀌더라도 절대 1부터 다시 시작하지 말고, 이전 종목의 마지막 세트 번호에 이어서 전체 누적으로 계속 카운트해줘.
4. [가장 중요] 원문에 있는 (드랍), (드랍세트), (슈퍼세트), (컴파운드), (강제반복), (저중량) 같은 세트 타입 표기와, "양쪽" / "각 사이드" 같이 좌우 양쪽을 뜻하는 표기는 절대 삭제하지 말고 해당 세트의 body 텍스트 안에 그대로 유지해.
5. 드랍/슈퍼세트 등 세트 타입 표기는 note로 분리하지 마. 우리 앱은 body 안의 텍스트를 감지해 별도 뱃지로 처리한다.
6. [가장 중요] 세트 기록과 함께 또는 독립적으로 적힌 주관적 느낌·코멘트는 반드시 note 필드로 분리해. kg/회/세트 숫자나 세트 타입 표기가 아닌 주관적 경험·느낌 텍스트만 note로. 없으면 note 필드 생략.
7. 운동 기록이 전혀 없고 코멘트만 있는 경우, body는 빈 문자열로, note에 해당 문장 전체를 넣어.
8. JSON 이외의 다른 텍스트(마크다운 등)는 절대 포함하지 마.
9. [중요] 풀업/친업/딥스 계열 종목은 반드시 아래 세 가지 중 하나로 명확히 구분해서 title에 표기해줘: 보조 기구(어시스티드 머신)를 사용한 경우 → "어시스티드 풀업"/"어시스티드 친업"/"어시스티드 딥스", 체중에 무게를 추가한 경우 → "가중 풀업"/"가중 친업"/"가중 딥스", 맨몸인 경우 → "풀업"/"친업"/"딥스".
사용자 입력:\n${rawText}`;

      const sumRes = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: summarizePrompt }] }] })
      });
      const sumJson = await sumRes.json();
      if (sumJson.error || !sumJson.candidates?.[0]) throw new Error("글 정리 실패");

      const sumParts = sumJson.candidates[0].content.parts;
      const sumText = (sumParts.find(p => !p.thought) ?? sumParts[sumParts.length - 1]).text;
      const cleanedSum = sumText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const jsonMatch = cleanedSum.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("JSON 배열 파싱 실패: " + cleanedSum.slice(0, 200));
      const parsed = JSON.parse(jsonMatch[0]);

      const structuredSections = parsed.map(s => ({
        part: s.part || "운동 부위",
        items: (s.items || []).map(it => ({ title: it.title, body: it.body, ...(it.note ? { note: it.note } : {}) }))
      }));
      const structuredExercises = structuredSections.flatMap(s => s.items.map(it => ({ name: it.title }))).filter(ex => ex.name);
      const totalVolume = parseVolume(structuredSections, profile?.weight);

      // 이전 볼륨 조회
      let lastVolume = 0;
      const currentParts = structuredSections.map(s => s.part).filter(Boolean);
      if (currentParts.length > 0 && uid) {
        const q = query(collection(db, "logs"), where("uid", "==", uid));
        const snap = await getDocs(q);
        const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        for (const d of sorted) {
          if (d.id === docRef.id) continue;
          if (d.type !== "workout") continue;
          if (currentParts.some(p => (d.title || "").includes(p)) && d.totalVolume) {
            lastVolume = d.totalVolume;
            break;
          }
        }
      }

      let overloadMsg = "";
      if (lastVolume > 0) {
        const diff = totalVolume - lastVolume;
        const pct = ((diff / lastVolume) * 100).toFixed(1);
        overloadMsg = capturedMode === 'deload'
          ? (diff <= 0 ? `오늘 볼륨 ${totalVolume.toLocaleString()}kg, 디로딩 성공! (${Math.abs(pct)}% 감량)` : `오늘 볼륨 ${totalVolume.toLocaleString()}kg, 디로딩 목표 미달 (${pct}% 증가)`)
          : `오늘 볼륨 ${totalVolume.toLocaleString()}kg, 저번보다 ${Math.abs(pct)}% 과부하 ${diff >= 0 ? "성공" : "실패"}!`;
      } else {
        overloadMsg = `오늘 첫 기록 볼륨 ${totalVolume.toLocaleString()}kg 달성!`;
      }

      await updateDoc(docRef, { sections: structuredSections, exercises: structuredExercises, totalVolume, overloadMsg, aiStatus: 'summarized' });

      // 한줄평
      const commentPrompt = `운동 기록을 분석해서 동기부여가 되는 한줄평을 써줘.
필수 포함 문구: "${overloadMsg}"
규칙:
1. 반드시 저 문구가 제일 앞에 나오게 해.
2. 30자 이내로 짧고 강렬하게 한국어로 써.
3. 순수 텍스트만 반환해.
정보: 운동부위: ${title}, 총 볼륨: ${totalVolume}kg`;

      const commentRes = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: commentPrompt }] }] })
      });
      const commentJson = await commentRes.json();
      if (commentJson.candidates?.[0]) {
        const cParts = commentJson.candidates[0].content.parts;
        const aiComment = (cParts.find(p => !p.thought) ?? cParts[cParts.length - 1]).text.trim();
        await updateDoc(docRef, { aiComment, aiStatus: 'done' });
      } else {
        await updateDoc(docRef, { aiStatus: 'done' });
      }
    } catch (err) {
      console.error("백그라운드 AI 처리 실패:", err);
      try { await updateDoc(docRef, { aiStatus: 'error', aiError: `${err.name}: ${err.message}`.slice(0, 300) }); } catch {}
    }
  }

  /* ── 저장 ── */
  async function handleSave() {
    try {
      // 자유 메모 모드
      if (freeMode) {
        const html = editorRef.current?.innerHTML || '';
        const plainText = editorRef.current?.innerText || '';
        const title = plainText.split('\n').find(l => l.trim()) || '운동 메모';

        let docRef;
        if (initialData?.docId) {
          docRef = doc(db, 'logs', initialData.docId);
          await updateDoc(docRef, {
            title: title.substring(0, 40),
            freeHtml: html,
            originalText: plainText,
            aiStatus: 'processing',
          });
        } else {
          const res = await addDoc(collection(db, 'logs'), {
            type: 'workout', uid, timestamp: serverTimestamp(),
            title: title.substring(0, 40),
            freeHtml: html,
            originalText: plainText,
            mode: 'free',
            exercises: [],
            sections: [],
            totalVolume: 0,
            aiStatus: 'processing',
          });
          docRef = res;
        }

        originalSectionsRef.current = JSON.stringify(sections);
        if (onSave) onSave();
        runBackgroundAI(docRef, [], title, workoutMode, plainText).catch(() => {});
        return;
      }

      const title = sections.map(s => s.part).filter(Boolean).join(", ") || "운동 기록";
      const exercises = sections.flatMap(s => s.items.map(it => ({ name: it.title }))).filter(ex => ex.name);
      const originalText = sections.flatMap(s => s.items.map(it => it.body)).filter(Boolean).join("\n");
      const sectionsData = sections.map(s => ({
        part: s.part,
        items: s.items.map(it => ({ title: it.title, body: it.body, supersetGroup: it.supersetGroup ?? null }))
      }));
      const roughVolume = parseVolume(sections, profile?.weight);

      let docRef;
      if (initialData && initialData.docId) {
        docRef = doc(db, "logs", initialData.docId);
        await updateDoc(docRef, { title, exercises, originalText, sections: sectionsData, totalVolume: roughVolume, aiStatus: 'processing' });
      } else {
        const res = await addDoc(collection(db, "logs"), {
          type: "workout", timestamp: serverTimestamp(),
          uid, title, exercises, originalText, sections: sectionsData, totalVolume: roughVolume, aiStatus: 'processing'
        });
        docRef = res;
      }

      originalSectionsRef.current = JSON.stringify(sections);
      if (onSave) onSave();

      // 백그라운드 AI 처리 (컴포넌트 언마운트 후에도 계속 실행됨)
      runBackgroundAI(docRef, sections, title, workoutMode).catch(() => {});
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
    }
  }

  return (
    <div className="flex flex-col bg-ui-1 w-full h-full overflow-hidden">
      <ConfirmModal
        isOpen={showExitModal}
        title="작성 중인 기록이 있습니다"
        subtitle="현재까지 작성한 내용을 저장하지 않고 나가시겠습니까?"
        confirmText="나가기"
        cancelText="계속 작성"
        confirmVariant="danger"
        onConfirm={onBack}
        onCancel={() => setShowExitModal(false)}
      />
      {/* 상단 네비게이션 */}
      <header className="flex-none bg-white/90 backdrop-blur-[32px] border-b border-ui-3/50">
        <div className="flex items-center justify-between h-9 px-4">
          <span className="font-pretendard text-body-s font-medium text-black/60">9:41</span>
          <svg width="60" height="12" viewBox="0 0 60 12" fill="none" className="mt-2">
            <rect x=".5" y=".5" width="21" height="11" rx="3.5" stroke="black" strokeOpacity=".35" />
            <rect x="2" y="2" width="16" height="8" rx="2" fill="black" />
          </svg>
        </div>
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <Pressable pressScale={0.85} onClick={handleBackClick} className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent">
              <IcBack />
            </Pressable>
            <h1 className="font-pretendard text-[20px] font-semibold text-black tracking-[-0.5px] leading-[36px] whitespace-nowrap m-0">
              쇠질 메모
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Pressable pressScale={0.85} onClick={() => setMoreSheetOpen(true)} className="flex items-center justify-center w-8 h-8 rounded-full">
              <IcMore />
            </Pressable>
          </div>
        </div>
      </header>

      {/* 중앙 스크롤 영역 */}
      <main className="flex-1 overflow-y-auto">

        {/* 툴바 */}
        <div className="flex h-16 items-center justify-between bg-white px-6 border-b border-ui-2">
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setFreeMode(p => !p); setShowColorPicker(null); }}
              className="w-10 h-10 flex items-center justify-center rounded transition-colors"
            >
              <IcKeyboard active={freeMode} />
            </button>
            {!freeMode && (
              <div className="relative">
                <Pressable pressScale={0.92} onClick={() => setAiMenuOpen(!aiMenuOpen)} className="w-10 h-10 flex items-center justify-center">
                  <IcAI active={aiMenuOpen} />
                </Pressable>
                {aiMenuOpen && (
                  <>
                    <div onClick={() => setAiMenuOpen(false)} className="fixed inset-0 z-[98]" />
                    <div className="absolute top-[calc(100%+12px)] left-0 w-[279px] py-2 bg-gradient-to-br from-[#DFDDFF] via-[#ECEFFB] to-[#EFFBED] border border-ui-4 rounded-[24px] shadow-lg z-[99] flex flex-col text-left origin-top-left animate-[dropdownEnter_0.25s_cubic-bezier(0.16,1,0.3,1)_forwards]">
                      <button onClick={handleSummarize} className="px-4 py-2 flex flex-col gap-1 w-full bg-transparent border-none outline-none text-left font-pretendard cursor-pointer">
                        <span className="text-body-m font-normal text-typo-normal tracking-[-0.4px] leading-lh-xs">글 정리</span>
                        <span className="text-body-s font-normal text-typo-secondary tracking-[-0.35px] leading-lh-2xs">글을 자동으로 정리해줘요</span>
                      </button>
                      <button onClick={handleFeedback} className="px-4 py-2 flex flex-col gap-1 w-full bg-transparent border-none outline-none text-left font-pretendard cursor-pointer">
                        <span className="text-body-m font-normal text-typo-normal tracking-[-0.4px] leading-lh-xs">피드백</span>
                        <span className="text-body-s font-normal text-typo-secondary tracking-[-0.35px] leading-lh-2xs">기록에 기반해 자세한 피드백을 알려드려요</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex h-10 items-center gap-3">
            <Pressable
              pressScale={0.88}
              onClick={() => setWorkoutMode(m => m === 'overload' ? 'deload' : 'overload')}
              className={`h-8 flex items-center gap-1 px-3 rounded-full font-pretendard font-semibold text-[11px] tracking-[-0.2px] leading-none ${workoutMode === 'overload' ? 'bg-brand/10 text-brand' : 'bg-[#f07800]/10 text-[#f07800]'}`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                {workoutMode === 'overload'
                  ? <path d="M12 19V5M5 12l7-7 7 7" />
                  : <path d="M12 5v14M19 12l-7 7-7-7" />
                }
              </svg>
              {workoutMode === 'overload' ? '과부하' : '디로딩'}
            </Pressable>
            <Pressable
              pressScale={0.85}
              className={`w-10 h-10 flex-none flex items-center justify-center p-0 leading-none ${freeMode || canUndo ? 'text-typo-normal opacity-100' : 'text-[#868E96] opacity-100'}`}
              onMouseDown={(e) => { e.preventDefault(); handleUndo(); }}
            ><IcUndo size={18} /></Pressable>
            <Pressable
              pressScale={0.85}
              className={`w-10 h-10 flex-none flex items-center justify-center p-0 leading-none ${freeMode || canRedo ? 'text-typo-normal opacity-100' : 'text-[#868E96] opacity-100'}`}
              onMouseDown={(e) => { e.preventDefault(); handleRedo(); }}
            ><IcRedo size={18} /></Pressable>
          </div>
        </div>

        {/* 리치 텍스트 포매팅 툴바 (자유 메모 모드일 때) */}
        {freeMode && (
          <div className="bg-white border-b border-ui-2 relative">
            <div className="flex items-center gap-0.5 px-3 py-1.5 overflow-x-auto scrollbar-hide">
              {/* 텍스트 스타일 */}
              <RichToolbarBtn active={activeFormats.bold} onClick={() => execFormat('bold')} title="굵게">
                <Bold size={16} strokeWidth={2.5} />
              </RichToolbarBtn>
              <RichToolbarBtn active={activeFormats.italic} onClick={() => execFormat('italic')} title="기울임">
                <Italic size={16} />
              </RichToolbarBtn>
              <RichToolbarBtn active={activeFormats.underline} onClick={() => execFormat('underline')} title="밑줄">
                <Underline size={16} />
              </RichToolbarBtn>
              <RichToolbarBtn active={activeFormats.strikeThrough} onClick={() => execFormat('strikeThrough')} title="취소선">
                <Strikethrough size={16} />
              </RichToolbarBtn>

              <div className="w-px h-5 bg-ui-3 mx-1 flex-none" />

              {/* 텍스트 색상 */}
              <div className="relative flex-none">
                <RichToolbarBtn active={showColorPicker === 'text'} onClick={() => setShowColorPicker(p => p === 'text' ? null : 'text')} title="글자 색상">
                  <div className="flex flex-col items-center gap-0.5">
                    <Paintbrush size={14} />
                    <div className="w-4 h-1 rounded-full" style={{ background: currentTextColor }} />
                  </div>
                </RichToolbarBtn>
                {showColorPicker === 'text' && (
                  <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-ui-2 p-2 z-50 flex gap-1.5 flex-wrap" style={{ width: 160 }}>
                    {TEXT_COLORS.map(c => (
                      <button
                        key={c}
                        onMouseDown={(e) => { e.preventDefault(); applyTextColor(c); }}
                        className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ background: c, borderColor: currentTextColor === c ? '#0066ff' : 'transparent' }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 하이라이트 색상 */}
              <div className="relative flex-none">
                <RichToolbarBtn active={showColorPicker === 'highlight'} onClick={() => setShowColorPicker(p => p === 'highlight' ? null : 'highlight')} title="형광펜">
                  <div className="flex flex-col items-center gap-0.5">
                    <Highlighter size={14} />
                    <div className="w-4 h-1 rounded-full border border-ui-3" style={{ background: currentHighlight === 'transparent' ? 'white' : currentHighlight }} />
                  </div>
                </RichToolbarBtn>
                {showColorPicker === 'highlight' && (
                  <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-ui-2 p-2 z-50 flex gap-1.5 flex-wrap" style={{ width: 160 }}>
                    {HIGHLIGHT_COLORS.map(c => (
                      <button
                        key={c}
                        onMouseDown={(e) => { e.preventDefault(); applyHighlight(c); }}
                        className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ background: c === 'transparent' ? 'white' : c, borderColor: currentHighlight === c ? '#0066ff' : '#dee2e6' }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="w-px h-5 bg-ui-3 mx-1 flex-none" />

              {/* 폰트 크기 */}
              <RichToolbarBtn active={false} onClick={() => applyFontSize(2)} title="작게">
                <Type size={11} />
              </RichToolbarBtn>
              <RichToolbarBtn active={false} onClick={() => applyFontSize(3)} title="보통">
                <Type size={14} />
              </RichToolbarBtn>
              <RichToolbarBtn active={false} onClick={() => applyFontSize(5)} title="크게">
                <Type size={17} />
              </RichToolbarBtn>

              <div className="w-px h-5 bg-ui-3 mx-1 flex-none" />

              {/* 정렬 */}
              <RichToolbarBtn active={activeFormats.justifyLeft} onClick={() => execFormat('justifyLeft')} title="왼쪽 정렬">
                <AlignLeft size={16} />
              </RichToolbarBtn>
              <RichToolbarBtn active={activeFormats.justifyCenter} onClick={() => execFormat('justifyCenter')} title="가운데 정렬">
                <AlignCenter size={16} />
              </RichToolbarBtn>
              <RichToolbarBtn active={activeFormats.justifyRight} onClick={() => execFormat('justifyRight')} title="오른쪽 정렬">
                <AlignRight size={16} />
              </RichToolbarBtn>

              <div className="w-px h-5 bg-ui-3 mx-1 flex-none" />

              {/* 목록 */}
              <RichToolbarBtn active={activeFormats.insertUnorderedList} onClick={() => execFormat('insertUnorderedList')} title="글머리 기호">
                <List size={16} />
              </RichToolbarBtn>
              <RichToolbarBtn active={activeFormats.insertOrderedList} onClick={() => execFormat('insertOrderedList')} title="번호 목록">
                <ListOrdered size={16} />
              </RichToolbarBtn>
            </div>
            {/* 컬러피커 외부 클릭 닫기 */}
            {showColorPicker && (
              <div className="fixed inset-0 z-40" onClick={() => setShowColorPicker(null)} />
            )}
          </div>
        )}

        {/* 자유 메모 에디터 */}
        {freeMode && (
          <div
            className="flex-1 overflow-y-auto bg-white"
            onClick={() => editorRef.current?.focus()}
          >
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onKeyUp={updateActiveFormats}
              onMouseUp={updateActiveFormats}
              onSelect={updateActiveFormats}
              className="min-h-full p-5 font-pretendard text-body-m text-typo-normal tracking-[-0.4px] leading-7 outline-none"
              style={{ wordBreak: 'break-word' }}
            />
          </div>
        )}

        {/* 섹션 목록 */}
        {!freeMode && (<>
        {sections.map(sec => (
          <div key={sec.id}>

            {/* 운동 부위 헤더 */}
            <div className="bg-white px-4 pt-8 border-b border-ui-2 mt-2 first:mt-0">
              <div className="flex items-center gap-2 pb-2">
                <input
                  value={sec.part}
                  onChange={e => {
                    updatePart(sec.id, e.target.value);
                    setPartSuggestions({ secId: sec.id, items: filterBodyParts(e.target.value) });
                  }}
                  onFocus={() => setPartSuggestions({ secId: sec.id, items: filterBodyParts(sec.part) })}
                  onBlur={() => setTimeout(() => setPartSuggestions({ secId: null, items: [] }), 150)}
                  placeholder="운동 부위 (예: 하체)"
                  className="font-pretendard text-body-l font-semibold text-typo-strong tracking-[-0.45px] leading-7 bg-transparent border-none outline-none w-full p-0 placeholder:text-ui-4"
                />
                {sectionAiLoading === sec.id ? (
                  <div className="w-6 h-6 flex-none flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
                  </div>
                ) : (
                  <Pressable
                    pressScale={0.92}
                    onClick={(e) => openSectionPopover(sec.id, e, 'section')}
                    className="flex-none"
                  >
                    <IcSpark active={sectionPopover === sec.id && sectionPopoverSource === 'section'} />
                  </Pressable>
                )}
              </div>
              {partSuggestions.secId === sec.id && partSuggestions.items.length > 0 && (
                <div className="flex overflow-x-auto gap-2 pb-3 scrollbar-hide">
                  {partSuggestions.items.map(s => (
                    <button
                      key={s}
                      onMouseDown={e => { e.preventDefault(); updatePart(sec.id, s); setPartSuggestions({ secId: null, items: [] }); }}
                      className="flex-none px-3 py-1 rounded-full bg-ui-2 text-typo-secondary text-[13px] font-medium font-pretendard tracking-[-0.3px] whitespace-nowrap"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* AI 루틴 근거 */}
            {sectionAiTheories[sec.id] && (
              <div className="mx-4 mt-2 mb-1 px-3 py-2.5 rounded-xl flex flex-col gap-1.5" style={{ background: '#eef2ff', border: '1px solid #c7d7fd' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-brand font-pretendard">이 루틴의 근거</span>
                  <button
                    onClick={() => setSectionAiTheories(prev => { const n = { ...prev }; delete n[sec.id]; return n; })}
                    className="w-4 h-4 flex items-center justify-center bg-transparent border-none cursor-pointer"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#868e96" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                <p className="text-[12px] text-typo-secondary font-pretendard leading-relaxed m-0">{sectionAiTheories[sec.id]}</p>
              </div>
            )}

            {/* 종목 항목들 */}
            {groupBySupersets(sec.items).map((group, gIdx) =>
              group.isSuperset ? (
                <React.Fragment key={`ss-${group.supersetGroup}-${gIdx}`}>
                  <div className="flex items-center gap-3 px-4 pt-2 pb-0.5">
                    <div className="flex-1 h-px bg-[rgba(0,141,207,0.22)]" />
                    <span className="text-[10px] font-pretendard text-[#008dcf] font-semibold tracking-[-0.25px]">슈퍼세트</span>
                    <div className="flex-1 h-px bg-[rgba(0,141,207,0.22)]" />
                  </div>
                  {group.items.map((item, itemIdx) => (
                    <WorkoutTaskItem
                      key={item.id}
                      title={item.title}
                      body={item.body}
                      onTitleChange={(val) => updateItem(sec.id, item.id, "title", val)}
                      onBodyChange={(val) => updateItem(sec.id, item.id, "body", val)}
                      onBodyBlur={(val) => handleBodyBlur(sec.id, item.id, val)}
                      isAI={item.isAI}
                      prevMaxWeight={exerciseStats[item.title]}
                      prevMaxReps={exerciseRepStats[item.title]}
                      onAiClick={(e) => openSectionPopover(sec.id, e, 'item', item.id)}
                      aiActive={sectionPopover === sec.id && sectionPopoverSource === 'item' && sectionPopoverItemId === item.id}
                      isConverting={convertingItems.current.has(`${sec.id}_${item.id}`)}
                      suppressSupersetBadge={itemIdx < group.items.length - 1}
                    />
                  ))}
                </React.Fragment>
              ) : group.items.map(item => (
                <WorkoutTaskItem
                  key={item.id}
                  title={item.title}
                  body={item.body}
                  onTitleChange={(val) => updateItem(sec.id, item.id, "title", val)}
                  onBodyChange={(val) => updateItem(sec.id, item.id, "body", val)}
                  onBodyBlur={(val) => handleBodyBlur(sec.id, item.id, val)}
                  isAI={item.isAI}
                  prevMaxWeight={exerciseStats[item.title]}
                  prevMaxReps={exerciseRepStats[item.title]}
                  onAiClick={(e) => openSectionPopover(sec.id, e, 'item', item.id)}
                  aiActive={sectionPopover === sec.id && sectionPopoverSource === 'item' && sectionPopoverItemId === item.id}
                  isConverting={convertingItems.current.has(`${sec.id}_${item.id}`)}
                />
              ))
            )}

            {/* [+] 항목 추가 */}
            <div className="p-2">
              <Button
                variant="secondary"
                size="l"
                fullWidth
                onClick={() => addItem(sec.id)}
              >
                <IcPlus color="#868e96" />
              </Button>
            </div>

          </div>
        ))}

        {/* 새 운동 부위 추가 */}
        <div className="px-4 pt-2 pb-8">
          <Button
            variant="dashed"
            size="l"
            fullWidth
            onClick={addSection}
            className="gap-1.5"
          >
            <IcPlus color="#868e96" size={16} />
            새 운동 부위 추가
          </Button>
        </div>
        </>)}

      </main>

      {/* 하단 저장 액션바 */}
      <div className="flex-none bg-white border-t border-ui-2 px-5 pt-4 pb-10">
        <Pressable
          pressScale={0.97}
          onClick={handleSave}
          className="w-full h-[56px] bg-brand rounded-2xl font-pretendard font-bold text-[16px] text-white tracking-[-0.4px]"
        >
          저장하기
        </Pressable>
      </div>

      {/* 섹션별 AI 팝오버 (fixed 위치) */}
      {sectionPopover !== null && (
        <>
          <div onClick={() => setSectionPopover(null)} className="fixed inset-0 z-[10]" />
          <div
            className="fixed py-2 border border-[#dee2e6] rounded-[24px] z-[11] flex flex-col"
            style={{
              top: sectionPopoverPos.top,
              left: sectionPopoverPos.left ?? 16,
              width: 279,
              background: 'linear-gradient(115deg, #EDECFF 1.7%, #E6DBFD 30.89%, #ECEFFB 64.69%, #EFFBED 100%)',
              backgroundSize: '200% 200%',
              boxShadow: '0 0 8px rgba(141,192,255,0.5), 0 0 32px rgba(215,231,255,0.5)',
              animation: 'dropdownEnter 0.25s cubic-bezier(0.16,1,0.3,1) forwards, popoverGradientIn 0.7s cubic-bezier(0.05,0.8,0.2,1) forwards'
            }}
          >
            <button
              onClick={() => handleSectionAiRoutine(sectionPopover, sectionPopoverSource, sectionPopoverItemId)}
              className="px-4 py-2 flex flex-col gap-1 w-full bg-transparent border-none outline-none text-left font-pretendard cursor-pointer"
            >
              <span className="text-body-m font-normal text-typo-normal tracking-[-0.4px] leading-lh-xs">AI 루틴</span>
              <span className="text-body-s font-normal text-typo-secondary tracking-[-0.35px] leading-lh-2xs">{sectionPopoverSource === 'item' ? '해당 종목의 최적 세트 구성을 제안해줘요' : '기록에 기반해 관련 루틴을 자동으로 짜줘요'}</span>
            </button>
            <button
              onClick={() => handleShowRecentRecords(sectionPopover, sectionPopoverSource, sectionPopoverItemId)}
              className="px-4 py-2 flex flex-col gap-1 w-full bg-transparent border-none outline-none text-left font-pretendard cursor-pointer"
            >
              <span className="text-body-m font-normal text-typo-normal tracking-[-0.4px] leading-lh-xs">최근 기록 보기</span>
              <span className="text-body-s font-normal text-typo-secondary tracking-[-0.35px] leading-lh-2xs">{sectionPopoverSource === 'item' ? '해당 종목의 최근 기록을 보여줘요' : '해당 부위에 맞는 최근 운동 종목을 보여줘요'}</span>
            </button>
          </div>
        </>
      )}

      {/* 툴바 AI 글정리 바텀시트 */}
      {bsOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div
            onClick={() => setBsOpen(false)}
            className="absolute inset-0 bg-[#171719]/50 animate-[bsFadeIn_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]"
          />
          <div className="relative bg-ui-2 rounded-t-[24px] px-4 pb-6 flex flex-col items-center animate-[bottomSheetUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)_forwards] shadow-lg w-full max-h-[86dvh] min-h-[420px]">
            <div className="py-3 w-full flex justify-center flex-none">
              <div className="w-10 h-1 rounded-full bg-ui-3/60" />
            </div>
            <div className="flex items-center justify-between w-full mb-4 flex-none">
              <div className="flex items-center gap-4">
                <IcSpark />
                <span className="text-body-l font-semibold text-typo-normal tracking-[-0.45px] leading-lh-sm font-pretendard">글 정리</span>
              </div>
              <button onClick={() => setBsOpen(false)} className="flex items-center justify-center w-10 h-10 bg-transparent border-none outline-none cursor-pointer text-typo-strong">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div
              className="w-full min-h-0 flex-1 rounded-2xl p-4 flex flex-col gap-4"
              style={{
                background: 'linear-gradient(115deg, #EDECFF 1.7%, #E6DBFD 30.89%, #ECEFFB 64.69%, #EFFBED 100%)',
                backgroundSize: '200% 200%',
                animation: isBsLoading
                  ? 'dropdownEnter 0.25s cubic-bezier(0.16,1,0.3,1) forwards, popoverGradientIn 0.7s cubic-bezier(0.05,0.8,0.2,1) forwards, bsGradientMove 2.5s ease 0.7s infinite'
                  : 'dropdownEnter 0.25s cubic-bezier(0.16,1,0.3,1) forwards, popoverGradientIn 0.7s cubic-bezier(0.05,0.8,0.2,1) forwards'
              }}
            >
              {isBsLoading ? (
                <div className="flex flex-col items-center justify-center min-h-[250px] gap-4">
                  <div className="w-10 h-10 border-[3px] border-brand/20 border-t-brand rounded-full animate-spin" />
                  <span className="text-[15px] font-medium text-typo-secondary font-pretendard">AI가 메모를 예쁘게 정리하고 있어요...</span>
                </div>
              ) : parsedSections.length === 0 ? (
                <div className="min-h-[250px] flex items-center justify-center">
                  <span className="text-ui-6">로딩 결과가 없습니다.</span>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto pr-1 flex flex-col gap-6">
                  {parsedSections.map((sSec, sIndex) => (
                    <React.Fragment key={sSec.id}>
                      <div className="flex items-center justify-between w-full">
                        <span className="text-title-s font-semibold text-typo-strong tracking-[-0.5px] leading-[36px] font-pretendard">{sSec.part}</span>
                        {sIndex === 0 && <span className="text-body-s font-normal text-typo-secondary tracking-[-0.35px] leading-lh-2xs font-pretendard">{new Date().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\.$/, '')}</span>}
                      </div>
                      <div className="relative w-full -mt-2 flex flex-col gap-4 pr-1">
                        {groupBySupersets(sSec.items).map((group, gIdx) =>
                          group.isSuperset ? (
                            <React.Fragment key={`ss-${group.supersetGroup}-${gIdx}`}>
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-[rgba(0,141,207,0.22)]" />
                                <span className="text-[10px] font-pretendard text-[#008dcf] font-semibold tracking-[-0.25px]">슈퍼세트</span>
                                <div className="flex-1 h-px bg-[rgba(0,141,207,0.22)]" />
                              </div>
                              {group.items.map((sIt) => (
                                <div key={sIt.id} className="flex flex-col gap-1.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-pretendard font-semibold text-[14px] text-typo-strong tracking-[-0.35px]">{sIt.title}</span>
                                    {exerciseVolumeDeltas[sIt.title] != null && (
                                      <span className={`px-3 py-1 rounded-[12px] text-[11px] font-medium font-pretendard leading-4 tracking-[-0.275px] ${exerciseVolumeDeltas[sIt.title] >= 0 ? 'bg-[rgba(0,150,50,0.1)] text-[#009632]' : 'bg-[#ffeef0] text-[#e03e52]'}`}>
                                        {exerciseVolumeDeltas[sIt.title] > 0 ? '+' : ''}{exerciseVolumeDeltas[sIt.title]}%
                                      </span>
                                    )}
                                    {exerciseRepDeltas[sIt.title] != null && (
                                      <span className={`px-3 py-1 rounded-[12px] text-[11px] font-medium font-pretendard leading-4 tracking-[-0.275px] ${exerciseRepDeltas[sIt.title] >= 0 ? 'bg-[rgba(0,150,50,0.1)] text-[#009632]' : 'bg-[#ffeef0] text-[#e03e52]'}`}>
                                        {exerciseRepDeltas[sIt.title] > 0 ? '+' : ''}{exerciseRepDeltas[sIt.title]}회
                                      </span>
                                    )}
                                  </div>
                                  <SummaryBodyRenderer body={sIt.body} note={sIt.note} />
                                </div>
                              ))}
                            </React.Fragment>
                          ) : group.items.map(sIt => (
                            <div key={sIt.id} className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-pretendard font-semibold text-[14px] text-typo-strong tracking-[-0.35px]">{sIt.title}</span>
                                {exerciseVolumeDeltas[sIt.title] != null && (
                                  <span className={`px-3 py-1 rounded-[12px] text-[11px] font-medium font-pretendard leading-4 tracking-[-0.275px] ${exerciseVolumeDeltas[sIt.title] >= 0 ? 'bg-[rgba(0,150,50,0.1)] text-[#009632]' : 'bg-[#ffeef0] text-[#e03e52]'}`}>
                                    {exerciseVolumeDeltas[sIt.title] > 0 ? '+' : ''}{exerciseVolumeDeltas[sIt.title]}%
                                  </span>
                                )}
                                {exerciseRepDeltas[sIt.title] != null && (
                                  <span className={`px-3 py-1 rounded-[12px] text-[11px] font-medium font-pretendard leading-4 tracking-[-0.275px] ${exerciseRepDeltas[sIt.title] >= 0 ? 'bg-[rgba(0,150,50,0.1)] text-[#009632]' : 'bg-[#ffeef0] text-[#e03e52]'}`}>
                                    {exerciseRepDeltas[sIt.title] > 0 ? '+' : ''}{exerciseRepDeltas[sIt.title]}회
                                  </span>
                                )}
                              </div>
                              <SummaryBodyRenderer body={sIt.body} note={sIt.note} />
                            </div>
                          ))
                        )}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
              {!isBsLoading && parsedSections.length > 0 && (
                <div className="flex justify-end flex-none pt-2">
                  <button onClick={() => {
                    setSections(parsedSections.map((s, si) => ({
                      id: Date.now() + si,
                      part: s.part || '',
                      items: (s.items || []).map((it, ii) => ({
                        id: Date.now() + si * 1000 + ii,
                        title: it.title || '',
                        body: it.note ? `${it.body || ''}\n\n💬 ${it.note}` : (it.body || ''),
                      supersetGroup: it.supersetGroup ?? null,
                      }))
                    })));
                    setBsOpen(false);
                  }} className="bg-transparent border-none outline-none cursor-pointer text-body-s font-medium text-brand font-pretendard tracking-[-0.35px]">
                    붙여넣기
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-4 flex-none">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-ui-4" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 최근 기록 바텀시트 */}
      {recentSheet.open && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div
            onClick={() => setRecentSheet(prev => ({ ...prev, open: false }))}
            className="absolute inset-0 bg-[#171719]/50"
          />
          <div className="relative bg-[#f1f3f5] rounded-t-[24px] px-4 pb-4 flex flex-col items-center shadow-lg animate-[bottomSheetUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)_forwards]">
            {/* 핸들 */}
            <div className="py-3 w-full flex justify-center">
              <div className="w-10 h-1.5 rounded-full" style={{ background: 'rgba(112,115,124,0.16)' }} />
            </div>

            {/* 헤더 */}
            <div className="flex items-center justify-between w-full mb-4">
              <div className="flex items-center gap-4">
                <IcSpark />
                <span className="text-body-l font-semibold text-typo-normal tracking-[-0.45px] leading-lh-sm font-pretendard">최근 기록</span>
              </div>
              <button
                onClick={() => setRecentSheet(prev => ({ ...prev, open: false }))}
                className="flex items-center justify-center w-6 h-6 bg-transparent border-none outline-none cursor-pointer"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#495057" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* 카드 영역 */}
            {recentSheet.loading ? (
              <div
                className="w-full rounded-2xl p-4 min-h-[200px] flex items-center justify-center"
                style={{ background: 'linear-gradient(105.71deg, #EDECFF 1.7%, #E6DBFD 30.89%, #ECEFFB 64.69%, #EFFBED 100%)' }}
              >
                <div className="w-10 h-10 border-[3px] border-brand/20 border-t-brand rounded-full animate-spin" />
              </div>
            ) : recentSheet.records.length === 0 ? (
              <div
                className="w-full rounded-2xl p-4 min-h-[200px] flex items-center justify-center"
                style={{ background: 'linear-gradient(105.71deg, #EDECFF 1.7%, #E6DBFD 30.89%, #ECEFFB 64.69%, #EFFBED 100%)' }}
              >
                <span className="text-body-s text-typo-secondary font-pretendard">이 부위의 최근 기록이 없어요</span>
              </div>
            ) : (() => {
              const rec = recentSheet.records[recentSheet.currentIdx];
              return (
                <div
                  className="w-full rounded-2xl p-4 flex flex-col gap-4 min-h-[320px]"
                  style={{ background: 'linear-gradient(105.71deg, #EDECFF 1.7%, #E6DBFD 30.89%, #ECEFFB 64.69%, #EFFBED 100%)' }}
                  onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                  onTouchEnd={(e) => {
                    const dx = e.changedTouches[0].clientX - touchStartX.current;
                    if (Math.abs(dx) > 50) {
                      if (dx < 0 && recentSheet.currentIdx < recentSheet.records.length - 1) {
                        setRecentSheet(prev => ({ ...prev, currentIdx: prev.currentIdx + 1 }));
                      } else if (dx > 0 && recentSheet.currentIdx > 0) {
                        setRecentSheet(prev => ({ ...prev, currentIdx: prev.currentIdx - 1 }));
                      }
                    }
                  }}
                >
                  {/* 카드 헤더 */}
                  <div className="flex items-center justify-between whitespace-nowrap flex-shrink-0">
                    <span className="font-pretendard text-[20px] font-semibold text-typo-strong tracking-[-0.5px] leading-9">{rec.section.part}</span>
                    <span className="font-pretendard text-body-s font-normal text-typo-secondary tracking-[-0.35px] leading-5">{formatRecordDate(rec.date)}</span>
                  </div>

                  {/* 카드 내용 (스크롤) */}
                  <div className="flex-1 overflow-y-auto font-pretendard text-body-s font-normal text-typo-normal tracking-[-0.35px] leading-5 whitespace-pre-wrap pr-3 min-h-0">
                    {(rec.section.items || []).map((it, i) => (
                      <div key={i} className={i > 0 ? 'mt-4' : ''}>
                        <p className="font-semibold m-0">{it.title}</p>
                        {it.body ? <p className="m-0 mt-1">{it.body}</p> : null}
                      </div>
                    ))}
                  </div>

                  {/* 증량 비율 + 액션 버튼 */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-typo-secondary font-pretendard flex-none">증량 비율</span>
                      <div className="flex gap-1.5">
                        {[2.5, 5, 7.5, 10].map(p => (
                          <button
                            key={p}
                            onClick={() => setIncrementPercent(p)}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold font-pretendard transition-colors ${incrementPercent === p ? 'bg-brand text-white' : 'bg-white/60 text-typo-secondary'}`}
                          >
                            +{p}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleUseRecord(true)}
                        className="px-2 py-2 font-pretendard text-body-s font-medium text-brand tracking-[-0.35px] bg-transparent border-none outline-none cursor-pointer"
                      >
                        증량하기
                      </button>
                      <button
                        onClick={() => handleUseRecord(false)}
                        className="px-2 py-2 font-pretendard text-body-s font-medium text-typo-normal tracking-[-0.35px] bg-transparent border-none outline-none cursor-pointer"
                      >
                        이대로 하기
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 페이지 인디케이터 */}
            {recentSheet.records.length > 0 && (
              <div className="flex items-center gap-2 mt-4">
                {recentSheet.records.slice(0, 6).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setRecentSheet(prev => ({ ...prev, currentIdx: i }))}
                    className="flex items-center justify-center p-1 bg-transparent border-none cursor-pointer"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${i === recentSheet.currentIdx ? 'bg-typo-normal' : 'bg-ui-4'}`} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 더보기 바텀시트 */}
      {moreSheetOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div
            onClick={() => setMoreSheetOpen(false)}
            className="absolute inset-0 bg-[#171719]/50 animate-[bsFadeIn_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]"
          />
          <div className="relative bg-white rounded-t-[24px] px-4 pb-10 flex flex-col items-center animate-[bottomSheetUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)_forwards] shadow-lg">
            <div className="py-3 w-full flex justify-center">
              <div className="w-10 h-1 rounded-full bg-ui-3/60" />
            </div>
            <div className="w-full flex flex-col divide-y divide-ui-2">
              <button
                onClick={handleCopyToClipboard}
                className="flex items-center gap-3 w-full py-4 bg-transparent border-none outline-none text-left cursor-pointer transition-all duration-100 active:opacity-50 text-typo-normal"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <div className="flex flex-col gap-0.5">
                  <span className="font-pretendard text-body-m font-medium text-typo-normal tracking-[-0.4px]">클립보드 복사</span>
                  <span className="font-pretendard text-body-s text-typo-alternative tracking-[-0.35px]">현재 메모를 텍스트로 복사해요</span>
                </div>
              </button>
              <button
                onClick={handleResetSections}
                className="flex items-center gap-3 w-full py-4 bg-transparent border-none outline-none text-left cursor-pointer transition-all duration-100 active:opacity-50 text-[#e03e52]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                <div className="flex flex-col gap-0.5">
                  <span className="font-pretendard text-body-m font-medium text-[#e03e52] tracking-[-0.4px]">새로 시작</span>
                  <span className="font-pretendard text-body-s text-typo-alternative tracking-[-0.35px]">현재 메모를 지우고 처음부터 시작해요</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
