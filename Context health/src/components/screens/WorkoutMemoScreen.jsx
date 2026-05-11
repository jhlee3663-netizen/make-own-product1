import React, { useState, useEffect, useRef } from 'react';
import { IcBack, IcMore, IcKeyboard, IcAI, IcUndo, IcRedo, IcSpark, IcPlus } from '../icons/Icons';
import WorkoutTaskItem from '../common/WorkoutTaskItem';
import Button from '../common/Button';
import ConfirmModal from '../common/ConfirmModal';
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
import { parseVolume } from '../../utils/utils';
import { filterBodyParts } from '../../utils/exerciseData';
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

const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;

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

export default function WorkoutMemoScreen({ onBack, onSave, initialData, uid, onOpenCoachWithMessage }) {
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
  const [freeMode, setFreeMode] = useState(() => !!(initialData?.freeHtml));
  const editorRef = useRef(null);
  const [showColorPicker, setShowColorPicker] = useState(null); // null | 'text' | 'highlight'
  const [activeFormats, setActiveFormats] = useState({});
  const [currentTextColor, setCurrentTextColor] = useState('#171719');
  const [currentHighlight, setCurrentHighlight] = useState('transparent');

  useEffect(() => {
    if (freeMode && editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = initialData?.freeHtml || '';
      editorRef.current.focus();
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
        items: (s.items || []).map((it, j) => ({ id: j + 1, title: it.title || "", body: it.body || "" }))
      }));
    }
    return createEmptyWorkoutSections();
  });
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [bsOpen, setBsOpen] = useState(false);
  const [isBsLoading, setIsBsLoading] = useState(false);
  const [parsedSections, setParsedSections] = useState([]);
  const [exerciseStats, setExerciseStats] = useState({});

  // 섹션별 AI 팝오버
  const [sectionPopover, setSectionPopover] = useState(null); // secId
  const [sectionPopoverSource, setSectionPopoverSource] = useState(null); // 'section' | 'item'
  const [sectionPopoverPos, setSectionPopoverPos] = useState({ top: 0 });
  const [sectionAiLoading, setSectionAiLoading] = useState(null); // secId

  // 운동 부위 자동완성
  const [partSuggestions, setPartSuggestions] = useState({ secId: null, items: [] });

  // 최근 기록 바텀시트
  const [recentSheet, setRecentSheet] = useState({ open: false, secId: null, records: [], currentIdx: 0, loading: false });

  // 더보기 바텀시트
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

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

  function parseMaxWeight(text) {
    if (!text) return null;
    const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)];
    if (!matches.length) return null;
    return Math.max(...matches.map(m => parseFloat(m[1])));
  }

  async function fetchPrevWeight(exerciseName) {
    if (!exerciseName?.trim() || !uid) return;
    const q = query(collection(db, "logs"), where("uid", "==", uid));
    const snap = await getDocs(q);
    const sorted = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    for (const d of sorted) {
      if (initialData && d.id === initialData.docId) continue;
      for (const sec of (d.sections || [])) {
        for (const item of (sec.items || [])) {
          if (item.title === exerciseName && item.body) {
            const w = parseMaxWeight(item.body);
            if (w !== null) {
              setExerciseStats(prev => ({ ...prev, [exerciseName]: w }));
              return;
            }
          }
        }
      }
    }
    setExerciseStats(prev => ({ ...prev, [exerciseName]: null }));
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
    try {
      const rawText = sections.map(s => `부위: ${s.part}\n${s.items.map(i => `- 종목: ${i.title}\n  기록: ${i.body}`).join('\n')}`).join('\n\n');
      const prompt = `다음 사용자의 거친 운동 메모 데이터를 보기 좋게 정리해서 JSON 배열로 반환해줘.
응답 형식: [{ "part": "운동부위", "items": [{ "title": "운동종목", "body": "• 세트 1: 20kg 15회\\n• 세트 2: 40kg 20회", "note": "느낀점(선택)" }] }]
중요 규칙:
1. 각 세트별 기록은 반드시 '• 세트 N: 무게 횟수' 형태로 작성해줘.
2. 여러 세트인 경우 쉼표(,) 대신 반드시 줄바꿈(\\n)으로 구분해서 작성해줘.
3. [가장 중요] 세트 번호(N)는 종목이 바뀌더라도 절대 1부터 다시 시작하지 말고, 이전 종목의 마지막 세트 번호에 이어서 전체 누적으로 계속 카운트해줘.
4. [가장 중요] 원문에 있는 (드랍), (드랍세트), (슈퍼세트), (컴파운드), (강제반복), (저중량) 같은 세트 타입 표기는 절대 삭제하지 말고 해당 세트의 body 텍스트 안에 그대로 유지해.
5. 드랍/슈퍼세트 등 세트 타입 표기는 note로 분리하지 마. 우리 앱은 body 안의 텍스트를 감지해 별도 뱃지로 처리한다.
6. [가장 중요] 세트 기록 뒤에 "-", "()", "..." 등으로 이어지는 주관적 느낌·코멘트 (예: "확실히 10회는 빡세다", "자세가 흔들림", "다음엔 무게 늘려보자", "8회까지만 제대로") 는 반드시 note 필드로 분리해. kg/회/세트 숫자나 세트 타입 표기가 아닌 주관적 경험·느낌 텍스트만 note로. 없으면 note 필드 생략.
7. JSON 이외의 다른 텍스트(마크다운 등)는 절대 포함하지 마.

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
      setParsedSections(parsed.map(s => ({
        id: Date.now() + Math.random(),
        part: s.part || "운동 부위",
        items: (s.items || []).map(it => ({
          id: Date.now() + Math.random(),
          title: it.title,
          body: it.body,
          note: it.note,
        }))
      })));
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
  function openSectionPopover(secId, e, source = 'section') {
    if (sectionPopover === secId) {
      setSectionPopover(null);
      setSectionPopoverSource(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setSectionPopoverPos({ top: rect.bottom + 8 });
    setSectionPopover(secId);
    setSectionPopoverSource(source);
  }

  /* ── 섹션별 AI 루틴 생성 ── */
  async function handleSectionAiRoutine(secId) {
    setSectionPopover(null);
    const sec = sections.find(s => s.id === secId);
    if (!sec?.part?.trim()) {
      alert('운동 부위를 먼저 입력해주세요.');
      return;
    }
    setSectionAiLoading(secId);
    try {
      let context = '';
      if (uid) {
        try {
          const q = query(collection(db, "logs"), where("uid", "==", uid), where("type", "==", "workout"));
          const snap = await getDocs(q);
          const sorted = snap.docs
            .map(d => ({ ...d.data() }))
            .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
          const relevant = sorted
            .filter(d => (d.sections || []).some(s => s.part === sec.part))
            .slice(0, 2);
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
[{ "title": "운동명", "body": "• 세트 1: Xkg N회 (설명)\n\n• 세트 2: Xkg N회 (설명)\n\n• 세트 3: Xkg N회 (설명)" }]

규칙:
1. 3~5가지 종목
2. 각 종목 3세트
3. 과거 기록 기반으로 무게를 제안하되, 없으면 적절한 초급 무게로
4. 괄호 안에 권장 무게 이유 또는 목표 간략히
5. JSON만 반환`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      const parts = json.candidates[0].content.parts;
      const text = (parts.find(p => !p.thought) ?? parts[parts.length - 1]).text;
      const items = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());

      setSections(prev => prev.map(s => s.id !== secId ? s : {
        ...s,
        items: items.map((it, i) => ({ id: Date.now() + i, title: it.title || '', body: it.body || '', isAI: true }))
      }));
    } catch (e) {
      alert("AI 루틴 생성 오류: " + e.message);
    } finally {
      setSectionAiLoading(null);
    }
  }

  /* ── 최근 기록 보기 ── */
  async function handleShowRecentRecords(secId) {
    setSectionPopover(null);
    if (!uid) return;
    const sec = sections.find(s => s.id === secId);
    setRecentSheet({ open: true, secId, records: [], currentIdx: 0, loading: true });
    try {
      const q = query(collection(db, "logs"), where("uid", "==", uid), where("type", "==", "workout"));
      const snap = await getDocs(q);
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
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

  /* ── 단위 변환 (lbs / 한칸 / 두칸 → kg) ── */
  async function handleBodyBlur(secId, itemId, body) {
    if (!body?.trim()) return;
    const hasNonKg = /\d+\s*(lbs?|파운드|lb|한칸|두칸|세칸|네칸|다섯칸|여섯칸|일곱칸|여덟칸|아홉칸|열칸)/i.test(body);
    if (!hasNonKg) return;

    const convertKey = `${secId}_${itemId}`;
    convertingItems.current.add(convertKey);
    setConvertingVersion(v => v + 1);
    try {
      const prompt = `다음 운동 기록 텍스트에서 lbs(파운드), 한칸/두칸/세칸(기구 핀 눈금) 등 kg이 아닌 단위를 모두 kg으로 변환해줘.
변환 규칙:
1. 1 lbs = 0.453592 kg, 변환 후 2.5kg 단위로 반올림
2. 한칸/두칸 등 기구 핀 눈금은 일반적으로 한칸=5kg으로 계산
3. (드랍세트), (슈퍼세트) 등 세트 타입 표기는 그대로 유지
4. 숫자와 단위 외 텍스트는 절대 변경하지 마
5. 오직 변환된 텍스트만 반환 (설명 없이)

원문:
${body}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const json = await res.json();
      if (json.error || !json.candidates?.[0]) return;
      const parts = json.candidates[0].content.parts;
      const converted = (parts.find(p => !p.thought) ?? parts[parts.length - 1]).text.trim();
      if (converted && converted !== body) {
        setSections(prev => prev.map(s =>
          s.id !== secId ? s : {
            ...s,
            items: s.items.map(it => it.id !== itemId ? it : { ...it, body: converted })
          }
        ));
      }
    } catch (e) {
      console.error("단위 변환 오류:", e);
    } finally {
      convertingItems.current.delete(convertKey);
      setConvertingVersion(v => v + 1);
    }
  }

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

  function incrementWeights(text) {
    return (text || '').replace(/(\d+(?:\.\d+)?)\s*kg/gi, (_, w) => {
      const newW = Math.round((parseFloat(w) * 1.05) / 2.5) * 2.5;
      return `${newW}kg`;
    });
  }

  function handleUseRecord(withIncrement) {
    const rec = recentSheet.records[recentSheet.currentIdx];
    if (!rec) return;
    const newItems = (rec.section.items || []).map((it, i) => ({
      id: Date.now() + i,
      title: it.title || '',
      body: withIncrement ? incrementWeights(it.body) : (it.body || ''),
      isAI: false
    }));
    setSections(prev => prev.map(s => s.id === recentSheet.secId ? { ...s, items: newItems } : s));
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

  /* ── 저장 ── */
  async function handleSave() {
    try {
      // 자유 메모 모드
      if (freeMode) {
        const html = editorRef.current?.innerHTML || '';
        const plainText = editorRef.current?.innerText || '';
        const title = plainText.split('\n').find(l => l.trim()) || '운동 메모';
        const data = { type: 'workout', uid, timestamp: serverTimestamp(), title: title.substring(0, 40), freeHtml: html, mode: 'free' };
        if (initialData?.docId) {
          await updateDoc(doc(db, 'logs', initialData.docId), { title: title.substring(0, 40), freeHtml: html });
        } else {
          await addDoc(collection(db, 'logs'), data);
        }
        if (onSave) onSave();
        return;
      }

      const title = sections.map(s => s.part).filter(Boolean).join(", ") || "운동 기록";
      const exercises = sections
        .flatMap(s => s.items.map(it => ({ name: it.title })))
        .filter(ex => ex.name);
      const originalText = sections
        .flatMap(s => s.items.map(it => it.body))
        .filter(Boolean)
        .join("\n");
      const sectionsData = sections.map(s => ({
        part: s.part,
        items: s.items.map(it => ({ title: it.title, body: it.body }))
      }));

      const totalVolume = parseVolume(sections);
      let lastVolume = 0;
      const currentParts = sections.map(s => s.part).filter(Boolean);

      if (currentParts.length > 0 && uid) {
        const q = query(collection(db, "logs"), where("uid", "==", uid));
        const querySnapshot = await getDocs(q);
        const sorted = querySnapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        for (const d of sorted) {
          if (initialData && d.id === initialData.docId) continue;
          if (d.type !== "workout") continue;
          const hasMatch = currentParts.some(p => (d.title || "").includes(p));
          if (hasMatch && d.totalVolume) {
            lastVolume = d.totalVolume;
            break;
          }
        }
      }

      let overloadMsg = "";
      if (lastVolume > 0) {
        const diff = totalVolume - lastVolume;
        const pct = ((diff / lastVolume) * 100).toFixed(1);
        overloadMsg = `오늘 볼륨 ${totalVolume.toLocaleString()}kg, 저번보다 ${Math.abs(pct)}% 과부하 ${diff >= 0 ? "성공" : "실패"}!`;
      } else {
        overloadMsg = `오늘 첫 기록 볼륨 ${totalVolume.toLocaleString()}kg 달성!`;
      }

      let docRef;
      if (initialData && initialData.docId) {
        docRef = doc(db, "logs", initialData.docId);
        await updateDoc(docRef, { title, exercises, originalText, sections: sectionsData, totalVolume });
      } else {
        const res = await addDoc(collection(db, "logs"), {
          type: "workout",
          timestamp: serverTimestamp(),
          uid, title, exercises, originalText, sections: sectionsData, totalVolume
        });
        docRef = res;
      }

      originalSectionsRef.current = JSON.stringify(sections);
      if (onSave) onSave();

      try {
        const workoutSummary = `운동부위: ${title}, 총 볼륨: ${totalVolume}kg, 이전 대비 분석: ${overloadMsg}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
        const prompt = `운동 기록을 분석해서 동기부여가 되는 한줄평을 써줘.
필수 포함 문구: "${overloadMsg}"
규칙:
1. 반드시 저 문구가 제일 앞에 나오게 해.
2. 30자 이내로 짧고 강렬하게 한국어로 써.
3. 순수 텍스트만 반환해.
정보: ${workoutSummary}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const json = await res.json();
        if (json.candidates && json.candidates[0]) {
          const parts = json.candidates[0].content.parts;
          const aiComment = (parts.find(p => !p.thought) ?? parts[parts.length - 1]).text.trim();
          await updateDoc(docRef, { aiComment });
        }
      } catch (aiErr) {
        console.error("AI 한줄평 실패:", aiErr);
      }
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
            <button onClick={handleBackClick} className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent">
              <IcBack />
            </button>
            <h1 className="font-pretendard text-[20px] font-semibold text-black tracking-[-0.5px] leading-[36px] whitespace-nowrap m-0">
              쇠질 메모
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setMoreSheetOpen(true)} className="flex items-center justify-center w-8 h-8 rounded-full transition-all duration-100 active:scale-[0.85] active:opacity-50">
              <IcMore />
            </button>
          </div>
        </div>
      </header>

      {/* 중앙 스크롤 영역 */}
      <main className="flex-1 overflow-y-auto">

        {/* 툴바 */}
        <div className="flex items-center justify-between bg-white px-6 py-3 border-b border-ui-2">
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setFreeMode(p => !p); setShowColorPicker(null); }}
              className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${freeMode ? 'text-brand' : ''}`}
            >
              <IcKeyboard />
            </button>
            {!freeMode && (
              <div className="relative">
                <button onClick={() => setAiMenuOpen(!aiMenuOpen)} className="w-6 h-6 flex items-center justify-center">
                  <IcAI active={aiMenuOpen} />
                </button>
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
          <div className="flex items-center gap-4">
            <button
              className={`w-6 h-6 flex items-center justify-center transition-all duration-100 active:scale-[0.99] ${freeMode || canUndo ? 'text-typo-normal opacity-100' : 'text-ui-3 opacity-40'}`}
              onMouseDown={(e) => { e.preventDefault(); handleUndo(); }}
            ><IcUndo /></button>
            <button
              className={`w-6 h-6 flex items-center justify-center transition-all duration-100 active:scale-[0.99] ${freeMode || canRedo ? 'text-typo-normal opacity-100' : 'text-ui-3 opacity-40'}`}
              onMouseDown={(e) => { e.preventDefault(); handleRedo(); }}
            ><IcRedo /></button>
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
                  <button
                    onClick={(e) => openSectionPopover(sec.id, e, 'section')}
                    className="flex-none"
                  >
                    <IcAI active={sectionPopover === sec.id && sectionPopoverSource === 'section'} />
                  </button>
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

            {/* 종목 항목들 */}
            {sec.items.map(item => (
              <WorkoutTaskItem
                key={item.id}
                title={item.title}
                body={item.body}
                onTitleChange={(val) => updateItem(sec.id, item.id, "title", val)}
                onBodyChange={(val) => updateItem(sec.id, item.id, "body", val)}
                onBodyBlur={(val) => handleBodyBlur(sec.id, item.id, val)}
                isAI={item.isAI}
                prevMaxWeight={exerciseStats[item.title]}
                onAiClick={(e) => openSectionPopover(sec.id, e, 'item')}
                isConverting={convertingItems.current.has(`${sec.id}_${item.id}`)}
              />
            ))}

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
        <button
          onClick={handleSave}
          className="w-full h-[56px] bg-brand rounded-2xl font-pretendard font-bold text-[16px] text-white tracking-[-0.4px] transition-all duration-100 active:scale-[0.97] active:brightness-90"
        >
          저장하기
        </button>
      </div>

      {/* 섹션별 AI 팝오버 (fixed 위치) */}
      {sectionPopover !== null && (
        <>
          <div onClick={() => setSectionPopover(null)} className="fixed inset-0 z-[10]" />
          <div
            className="fixed py-2 border border-[#dee2e6] rounded-[24px] z-[11] flex flex-col"
            style={{
              top: sectionPopoverPos.top,
              left: 16,
              width: 279,
              background: 'linear-gradient(115deg, #EDECFF 1.7%, #E6DBFD 30.89%, #ECEFFB 64.69%, #EFFBED 100%)',
              boxShadow: '0 0 8px rgba(141,192,255,0.5), 0 0 32px rgba(215,231,255,0.5)'
            }}
          >
            <button
              onClick={() => handleSectionAiRoutine(sectionPopover)}
              className="px-4 py-2 flex flex-col gap-1 w-full bg-transparent border-none outline-none text-left font-pretendard cursor-pointer"
            >
              <span className="text-body-m font-normal text-typo-normal tracking-[-0.4px] leading-lh-xs">AI 루틴</span>
              <span className="text-body-s font-normal text-typo-secondary tracking-[-0.35px] leading-lh-2xs">기록에 기반해 관련 루틴을 자동으로 짜줘요</span>
            </button>
            <button
              onClick={() => handleShowRecentRecords(sectionPopover)}
              className="px-4 py-2 flex flex-col gap-1 w-full bg-transparent border-none outline-none text-left font-pretendard cursor-pointer"
            >
              <span className="text-body-m font-normal text-typo-normal tracking-[-0.4px] leading-lh-xs">최근 기록 보기</span>
              <span className="text-body-s font-normal text-typo-secondary tracking-[-0.35px] leading-lh-2xs">해당 부위에 맞는 최근 운동 종목을 보여줘요</span>
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
            <div className={`w-full min-h-0 flex-1 rounded-2xl p-4 flex flex-col gap-4 bg-gradient-to-br from-[#EDECFF] via-[#ECEFFB] to-[#EFFBED] bg-[length:200%_200%] ${isBsLoading ? 'animate-[bsGradientMove_2.5s_ease_infinite]' : ''}`}>
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
                      <div className="relative w-full -mt-2">
                        <div className="text-body-s font-pretendard text-typo-normal tracking-[-0.35px] leading-lh-2xs whitespace-pre-wrap pr-4">
                          {sSec.items.map((sIt, iIndex) => (
                            <React.Fragment key={sIt.id}>
                              <span className="font-semibold">{sIt.title}</span><br /><br />
                              {sIt.body}
                              {sIt.note && (
                                <span className="block mt-2 px-2.5 py-1.5 rounded-lg bg-white/60 text-[11px] italic text-typo-secondary leading-relaxed">
                                  💬 {sIt.note}
                                </span>
                              )}
                              {iIndex < sSec.items.length - 1 && <><br /><br /></>}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
              {!isBsLoading && parsedSections.length > 0 && (
                <div className="flex justify-end flex-none pt-2">
                  <button onClick={() => {
                    setSections(parsedSections.map(s => ({
                      ...s,
                      items: s.items.map(it => ({
                        ...it,
                        body: it.note ? `${it.body}\n\n💬 ${it.note}` : it.body,
                      }))
                    })));
                    setBsOpen(false);
                  }} className="background-transparent border-none outline-none cursor-pointer text-body-s font-medium text-brand font-pretendard tracking-[-0.35px]">
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
                  className="w-full rounded-2xl p-4 flex flex-col gap-6 h-[320px]"
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

                  {/* 액션 버튼 */}
                  <div className="flex items-center justify-end gap-2 flex-shrink-0">
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
