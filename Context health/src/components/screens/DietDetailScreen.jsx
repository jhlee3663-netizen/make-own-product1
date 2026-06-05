import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { IcBack, IcMore, IcSpark, QuoteIcon, IcPencil } from '../icons/Icons';
import { AutoTextarea } from '../common/AutoTextarea';
import DonutChart from '../dashboard/DonutChart';
import ConfirmModal from '../common/ConfirmModal';
import Pressable from '../common/Pressable';
import { getDietSummaryComment } from '../../utils/dietFeedback';
import { estimateFoodNutrition, estimateMealNutrition, findCustomFood, normalizeFoodKey, searchMfdsFoods } from '../../utils/nutritionLookup';

const DEFAULT_SECTIONS = [
  { id: 'breakfast',   name: '아침',     placeholder: '아침에 먹은 식단을 적어주세요\n(예: 고구마 하나 우유 한잔)' },
  { id: 'am_snack',    name: '오전간식', placeholder: '오전 간식에 먹은 식단을 적어주세요\n(예: 바나나 하나 아몬드 한줌)' },
  { id: 'lunch',       name: '점심',     placeholder: '점심에 먹은 식단을 적어주세요\n(예: 닭가슴살 200g 흰쌀밥 한공기)' },
  { id: 'pm_snack',    name: '오후간식', placeholder: '오후 간식에 먹은 식단을 적어주세요\n(예: 단백질 쉐이크 1스쿱)' },
  { id: 'dinner',      name: '저녁',     placeholder: '저녁에 먹은 식단을 적어주세요\n(예: 연어 150g 샐러드)' },
  { id: 'night_snack', name: '야식',     placeholder: '야식에 먹은 식단을 적어주세요\n(예: 카제인 단백질 1스쿱)' },
];

function getChipType(kcal, goal) {
  if (!goal || kcal === 0) return null;
  const r = kcal / goal;
  if (r >= 0.95 && r <= 1.05) return 'success';
  if (r < 0.5)  return 'low';
  if (r > 1.1)  return 'over';
  return 'going';
}

const CHIP = {
  success: { label: '오늘도 성공! 🔥', bg: 'rgba(26,158,92,0.1)',   color: '#1a9e5c' },
  going:   { label: '좀만 더! 🤯',     bg: 'rgba(52,118,238,0.1)',  color: '#3476EE' },
  low:     { label: '더 먹어요 🍚',    bg: 'rgba(240,120,0,0.1)',   color: '#f07800' },
  over:    { label: '초과했어요 😅',   bg: 'rgba(224,62,82,0.1)',   color: '#e03e52' },
};

function getItemsTotal(items) {
  return (items || []).reduce((sum, item) => ({
    kcal: sum.kcal + Number(item.kcal || 0),
    carb: sum.carb + Number(item.carb || 0),
    protein: sum.protein + Number(item.protein || 0),
    fat: sum.fat + Number(item.fat || 0),
  }), { kcal: 0, carb: 0, protein: 0, fat: 0 });
}

function mergeFoodLists(...lists) {
  const seen = new Set();
  return lists.flat().filter(food => {
    const key = String(food?.name || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractFoodsFromDietLogs(logs) {
  return mergeFoodLists(
    ...(logs || []).map(log =>
      (log.sections || []).flatMap(sec => sec.items || [])
    )
  ).map(({ name, kcal, carb, protein, fat }) => ({ name, kcal, carb, protein, fat }));
}

function getRecentMatches(input, foods) {
  const query = input.trim().toLowerCase();
  if (!query) return [];
  return foods.filter(food => {
    const name = String(food.name || '').toLowerCase();
    return name.includes(query) || query.includes(name.split(/\s+/)[0]);
  }).slice(0, 10);
}

function getMealPatternFoods(secId, logs, minCount = 2, maxChips = 8) {
  const freq = {};
  (logs || []).forEach(log => {
    const section = (log.sections || []).find(s => s.id === secId);
    if (!section) return;
    (section.items || []).forEach(item => {
      const key = String(item.name || '').trim();
      if (!key) return;
      if (!freq[key]) freq[key] = { food: { name: item.name, kcal: item.kcal, carb: item.carb, protein: item.protein, fat: item.fat }, count: 0 };
      freq[key].count++;
    });
  });
  return Object.values(freq)
    .filter(({ count }) => count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxChips)
    .map(({ food }) => food);
}

function getMacroPercents(totals) {
  const carbKcal = Number(totals.carb || 0) * 4;
  const proteinKcal = Number(totals.protein || 0) * 4;
  const fatKcal = Number(totals.fat || 0) * 9;
  const macroKcal = carbKcal + proteinKcal + fatKcal;
  if (macroKcal <= 0) return { carbPercent: 0, proteinPercent: 0, fatPercent: 0, carbRatio: 0, proteinRatio: 0, fatRatio: 0 };
  return {
    carbPercent: Math.round((carbKcal / macroKcal) * 100),
    proteinPercent: Math.round((proteinKcal / macroKcal) * 100),
    fatPercent: Math.round((fatKcal / macroKcal) * 100),
    carbRatio: carbKcal / macroKcal,
    proteinRatio: proteinKcal / macroKcal,
    fatRatio: fatKcal / macroKcal,
  };
}

/* 끼니별 피드백 — 해당 끼니의 탄단지와 열량만 평가한다. */
function getMealTip(items, profile, sectionId, goalKcal) {
  if (!items || items.length === 0) return null;
  const mealTotals = getItemsTotal(items);
  if (mealTotals.kcal === 0) return '기록은 됐어요. 칼로리와 탄단지를 채우면 다음 식사 피드백이 더 정확해져요';
  const kcalTarget = Number(goalKcal || profile?.targetKcal || 2500);
  const mealKcalTarget = {
    breakfast: 0.22,
    am_snack: 0.08,
    lunch: 0.30,
    pm_snack: 0.08,
    dinner: 0.27,
    night_snack: 0.10,
  }[sectionId] || 0.22;
  const expectedKcal = kcalTarget * mealKcalTarget;
  const { carbPercent, proteinPercent, fatPercent, carbRatio, proteinRatio, fatRatio } = getMacroPercents(mealTotals);
  const macroLabel = `이 끼니 탄단지 ${carbPercent}:${proteinPercent}:${fatPercent}`;

  if (mealTotals.kcal > expectedKcal * 1.45) {
    if (fatRatio > 0.38) return `${macroLabel}, 열량과 지방이 높은 편이에요. 다음 끼니는 튀김·소스보다 담백하게 가요`;
    if (carbRatio > 0.68) return `${macroLabel}, 열량과 탄수 비중이 높아요. 다음 끼니는 밥·면 양을 조금 낮춰요`;
    return `${macroLabel}, 이 끼니 열량이 높은 편이에요. 다음 끼니는 조금 가볍게 맞춰요`;
  }
  if (mealTotals.kcal < expectedKcal * 0.45) {
    return `${macroLabel}, 이 끼니는 양이 적은 편이에요. 다음 끼니에서 부족한 열량을 자연스럽게 보완해요`;
  }
  if (carbRatio > 0.68) {
    return `${macroLabel}, 탄수 비중이 높아요. 다음 끼니는 채소와 단백질을 조금 더 챙겨요`;
  }
  if (fatRatio > 0.40) {
    return `${macroLabel}, 지방 비율이 높아요. 다음 끼니는 기름진 메뉴나 소스를 줄여요`;
  }
  if (proteinRatio < 0.14 && mealTotals.protein < 15 && mealTotals.kcal >= expectedKcal * 0.55) {
    return `${macroLabel}, 단백질이 낮은 편이에요. 다음 끼니에 살코기·두부·달걀 중 하나를 더해요`;
  }
  if (fatRatio < 0.12 && mealTotals.kcal >= expectedKcal * 0.65) {
    return `${macroLabel}, 지방이 낮은 편이에요. 견과류나 생선처럼 좋은 지방을 조금 더해도 좋아요`;
  }
  if (proteinRatio >= 0.16 && fatRatio >= 0.15 && fatRatio <= 0.35 && carbRatio >= 0.35 && carbRatio <= 0.62) {
    return `${macroLabel}, 이 끼니 균형이 좋아요. 다음 끼니도 비슷한 흐름이면 충분해요`;
  }
  return `${macroLabel}, 이 끼니는 무난해요. 다음 끼니에서 부족한 쪽만 살짝 보완해요`;
}

const RECENT_KEY = 'diet_recent_foods';
const CUSTOM_FOODS_KEY = 'diet_custom_foods';

function loadRecentFoods() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}

function loadCustomFoods() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_FOODS_KEY)) || []; } catch { return []; }
}

function saveCustomFoods(foods) {
  try { localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(foods)); } catch {}
}

function applyCustomFood(food, customFoods) {
  const custom = findCustomFood(customFoods, food?.name);
  if (!custom) return food;
  return {
    ...food,
    kcal: custom.kcal,
    carb: custom.carb,
    protein: custom.protein,
    fat: custom.fat,
    source: 'custom',
    matchedName: '내가 수정한 기준',
  };
}

function getNutritionSourceLabel(source) {
  if (source === 'custom') return '내 기준값';
  if (source === 'mfds') return 'DB 참고값';
  if (source === 'standard') return '기준 참고값';
  if (source === 'ai') return 'AI 추정값';
  return '';
}

function formatNutritionSource(source) {
  const label = getNutritionSourceLabel(source);
  return label ? ` · ${label}` : '';
}

function pushRecent(newItems, current) {
  const norm = newItems.map(({ name, kcal, carb, protein, fat, source, matchedName }) => ({ name, kcal, carb, protein, fat, source, matchedName }));
  const merged = [...norm, ...current.filter(r => !norm.some(n => normalizeFoodKey(n.name) === normalizeFoodKey(r.name)))].slice(0, 15);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(merged)); } catch {}
  return merged;
}

function serializeDietDraft(sections, aiInputs, goalKcal) {
  const filledInputs = Object.fromEntries(
    Object.entries(aiInputs || {}).filter(([, value]) => String(value || '').trim())
  );
  return JSON.stringify({ sections, aiInputs: filledInputs, goalKcal });
}

export default function DietDetailScreen({ onBack, onSave, initialData, uid, profile }) {
  const originalSectionsRef = useRef(null);
  const [showExitModal, setShowExitModal] = useState(false);

  const [sections, setSections]       = useState(DEFAULT_SECTIONS.map(s => ({ ...s, items: [] })));
  const [goalKcal, setGoalKcal]       = useState(2500);
  const [saving, setSaving]           = useState(false);
  const [aiComment, setAiComment]     = useState('');
  const [aiInputs, setAiInputs]       = useState({});
  const analyzingIds = useRef(new Set());
  const [analyzingVersion, setAnalyzingVersion] = useState(0);
  const [editTarget, setEditTarget]   = useState(null);
  const [editForm, setEditForm]       = useState({ name: '', kcal: '', carb: '', protein: '', fat: '' });
  const [recentFoods, setRecentFoods] = useState(loadRecentFoods);
  const [customFoods, setCustomFoods] = useState(loadCustomFoods);
  const [savedFoods, setSavedFoods]   = useState([]);
  const [allDietLogs, setAllDietLogs] = useState([]);
  const [searchModal, setSearchModal] = useState(null); // secId | null
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]     = useState(false);
  const [estimatingSearch, setEstimatingSearch] = useState(false);
  const searchInputRef = useRef(null);
  const mainRef = useRef(null);
  const compactBarRef = useRef(null);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  useEffect(() => {
    if (initialData) {
      const merged = DEFAULT_SECTIONS.map(def => {
        const found = (initialData.sections || []).find(s => s.id === def.id);
        return found ? { ...def, items: found.items || [] } : { ...def, items: [] };
      });
      setSections(merged);
      setGoalKcal(initialData.goal || profile?.targetKcal || 2500);
      setAiComment(initialData.aiComment || '');
      originalSectionsRef.current = serializeDietDraft(merged, {}, initialData.goal || profile?.targetKcal || 2500);
    } else {
      const defaultMerged = DEFAULT_SECTIONS.map(s => ({ ...s, items: [] }));
      const defaultGoal = profile?.targetKcal || 2500;
      setSections(defaultMerged);
      setGoalKcal(defaultGoal);
      originalSectionsRef.current = serializeDietDraft(defaultMerged, {}, defaultGoal);
    }
  }, [initialData]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    async function loadSavedFoods() {
      try {
        const q = query(collection(db, 'logs'), where('uid', '==', uid), where('type', '==', 'diet'), orderBy('timestamp', 'desc'), limit(100));
        const snap = await getDocs(q);
        const logs = snap.docs
          .map(d => d.data())
          .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        if (!cancelled) {
          setAllDietLogs(logs);
          setSavedFoods(extractFoodsFromDietLogs(logs));
        }
      } catch (e) {
        console.error('식단 기록 불러오기 실패:', e);
      }
    }
    loadSavedFoods();
    return () => { cancelled = true; };
  }, [uid]);

  const handleBackClick = () => {
    const currentDraft = serializeDietDraft(sections, aiInputs, goalKcal);
    const isDirty = originalSectionsRef.current && originalSectionsRef.current !== currentDraft;
    if (isDirty) {
      setShowExitModal(true);
    } else {
      onBack();
    }
  };

  useEffect(() => {
    if (searchModal && searchInputRef.current) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [searchModal]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      const p = Math.min(Math.max((el.scrollTop - 20) / 140, 0), 1);
      if (compactBarRef.current) {
        compactBarRef.current.style.opacity = `${p}`;
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const totals = useMemo(() => {
    let kcal = 0, carb = 0, protein = 0, fat = 0;
    sections.forEach(sec => (sec.items || []).forEach(item => {
      kcal    += Number(item.kcal    || 0);
      carb    += Number(item.carb    || 0);
      protein += Number(item.protein || 0);
      fat     += Number(item.fat     || 0);
    }));
    return { kcal, carb, protein, fat };
  }, [sections]);

  const chipType = getChipType(totals.kcal, goalKcal);
  const chip     = chipType ? CHIP[chipType] : null;
  const foodSuggestions = useMemo(() => mergeFoodLists(customFoods, recentFoods, savedFoods), [customFoods, recentFoods, savedFoods]);

  function upsertCustomFood(food) {
    const custom = {
      key: normalizeFoodKey(food.name),
      name: String(food.name || '').trim(),
      kcal: Number(food.kcal || 0),
      carb: Number(food.carb || 0),
      protein: Number(food.protein || 0),
      fat: Number(food.fat || 0),
      source: 'custom',
      matchedName: '내가 수정한 기준',
      updatedAt: Date.now(),
    };
    if (!custom.key || !custom.name) return null;
    const next = [custom, ...customFoods.filter(food => food.key !== custom.key)].slice(0, 80);
    setCustomFoods(next);
    saveCustomFoods(next);
    setRecentFoods(prev => pushRecent([custom], prev));
    return custom;
  }

  /* AI 텍스트 분석 */
  async function handleAIAnalyze(secId) {
    const text = aiInputs[secId]?.trim();
    if (!text) return;
    analyzingIds.current.add(secId);
    setAnalyzingVersion(v => v + 1);
    try {
      const estimatedFoods = await estimateMealNutrition(text, customFoods);
      const newItems = estimatedFoods.map(item => ({
        id:      Math.random().toString(36).slice(2, 11),
        name:    String(item.name    || ''),
        kcal:    Number(item.kcal    || 0),
        carb:    Number(item.carb    || 0),
        protein: Number(item.protein || 0),
        fat:     Number(item.fat     || 0),
        source:  item.source || 'ai',
        matchedName: item.matchedName || null,
      }));
      setSections(prev => prev.map(sec =>
        sec.id === secId ? { ...sec, items: [...(sec.items || []), ...newItems] } : sec
      ));
      setAiInputs(prev => ({ ...prev, [secId]: '' }));
      setRecentFoods(prev => pushRecent(newItems, prev));
    } catch (e) {
      alert('AI 분석 오류: ' + e.message);
    } finally {
      analyzingIds.current.delete(secId);
      setAnalyzingVersion(v => v + 1);
    }
  }

  /* 식품 검색 */
  async function handleFoodSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResult(null);
    setSearchResults([]);
    try {
      const custom = findCustomFood(customFoods, searchQuery);
      if (custom) {
        setSearchResult(normalizeSearchItem(custom));
        setSearchResults([]);
        return;
      }
      const mfdsItems = await searchMfdsFoods(searchQuery);
      setSearchResults(mfdsItems.map(food => applyCustomFood(food, customFoods)));
      if (mfdsItems.length === 0) {
        const item = await estimateFoodNutrition(searchQuery);
        setSearchResult(normalizeSearchItem(item));
      }
    } catch (e) {
      alert('검색 실패: ' + e.message);
    } finally {
      setSearching(false);
    }
  }

  function normalizeSearchItem(item) {
    const customApplied = applyCustomFood(item, customFoods);
    return {
      id: Math.random().toString(36).slice(2, 11),
      name: String(customApplied.name || searchQuery),
      kcal: Number(customApplied.kcal || 0),
      carb: Number(customApplied.carb || 0),
      protein: Number(customApplied.protein || 0),
      fat: Number(customApplied.fat || 0),
      source: customApplied.source || 'ai',
      matchedName: customApplied.matchedName || null,
      serving: customApplied.serving || '',
    };
  }

  function handleAddSearchItem(food) {
    if (!food || !searchModal) return;
    const item = { ...applyCustomFood(food, customFoods), id: Math.random().toString(36).slice(2, 11) };
    setSections(prev => prev.map(sec =>
      sec.id === searchModal ? { ...sec, items: [...(sec.items || []), item] } : sec
    ));
    setRecentFoods(prev => pushRecent([item], prev));
    setSearchResult(null);
    setSearchResults([]);
    setSearchQuery('');
    setSearchModal(null);
  }

  function handleAddSearchResult() {
    handleAddSearchItem(searchResult);
  }

  async function handleUseAiEstimate() {
    if (!searchQuery.trim()) return;
    setEstimatingSearch(true);
    try {
      const item = await estimateFoodNutrition(searchQuery);
      setSearchResult(normalizeSearchItem(item));
      setSearchResults([]);
    } catch (e) {
      alert('AI 추정 실패: ' + e.message);
    } finally {
      setEstimatingSearch(false);
    }
  }

  function handleOpenSearchModal(secId, value = '') {
    setSearchModal(secId);
    setSearchQuery(value);
    setSearchResult(null);
    setSearchResults([]);
  }

  function handleCloseSearchModal() {
    setSearchModal(null);
    setSearchResult(null);
    setSearchResults([]);
    setSearching(false);
    setEstimatingSearch(false);
  }

  function handleAddRecentFood(secId, food) {
    const item = { ...applyCustomFood(food, customFoods), id: Math.random().toString(36).slice(2, 11) };
    setSections(prev => prev.map(sec =>
      sec.id === secId ? { ...sec, items: [...(sec.items || []), item] } : sec
    ));
    setRecentFoods(prev => pushRecent([food], prev));
  }

  function handleRemoveItem(secId, itemId) {
    setSections(prev => prev.map(sec =>
      sec.id === secId ? { ...sec, items: (sec.items || []).filter(i => i.id !== itemId) } : sec
    ));
  }

  function handleOpenEdit(secId, item) {
    setEditTarget({ secId, itemId: item.id });
    setEditForm({ name: item.name, kcal: item.kcal, carb: item.carb, protein: item.protein, fat: item.fat });
  }

  function handleSaveEdit() {
    if (!editTarget) return;
    const { secId, itemId } = editTarget;
    const editedFood = {
      name: editForm.name,
      kcal: Number(editForm.kcal || 0),
      carb: Number(editForm.carb || 0),
      protein: Number(editForm.protein || 0),
      fat: Number(editForm.fat || 0),
      source: 'custom',
      matchedName: '내가 수정한 기준',
    };
    upsertCustomFood(editedFood);
    setSections(prev => prev.map(sec =>
      sec.id === secId
        ? { ...sec, items: (sec.items || []).map(item =>
            item.id === itemId
              ? { ...item, ...editedFood }
              : item
          )}
        : sec
    ));
    setEditTarget(null);
  }

  function handleMoreCopy() {
    const lines = [`[식단 기록] ${dateStr}`, `총 ${totals.kcal}kcal | 탄 ${totals.carb}g · 단 ${totals.protein}g · 지 ${totals.fat}g`, ''];
    sections.forEach(sec => {
      const items = sec.items || [];
      if (items.length === 0) return;
      lines.push(`[${sec.name}]`);
      items.forEach(i => lines.push(`  ${i.name} — ${i.kcal}kcal (탄${i.carb}g 단${i.protein}g 지${i.fat}g)`));
      lines.push('');
    });
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
    setMoreSheetOpen(false);
  }

  function handleMoreReset() {
    setSections(DEFAULT_SECTIONS.map(s => ({ ...s, items: [] })));
    setAiInputs({});
    setAiComment('');
    setMoreSheetOpen(false);
  }

  function handleGoalSave() {
    const v = Number(goalInput);
    if (v > 0) setGoalKcal(v);
    setEditingGoal(false);
    setGoalInput('');
  }

  async function handleSaveClick() {
    setSaving(true);
    try {
      const isNew      = !initialData?.docId;
      const totalItems = sections.reduce((acc, sec) => acc + (sec.items || []).length, 0);
      let comment      = aiComment;
      if (totalItems > 0) {
        comment = getDietSummaryComment(totals, profile, goalKcal);
        setAiComment(comment);
      }
      const docData = { type: 'diet', goal: goalKcal, kcal: totals.kcal,
        carb: totals.carb, protein: totals.protein, fat: totals.fat, sections,
        aiComment: comment || '식단이 기록되었습니다.' };
      if (isNew) {
        await addDoc(collection(db, 'logs'), { ...docData, uid, timestamp: serverTimestamp() });
      } else {
        await updateDoc(doc(db, 'logs', initialData.docId), { ...docData });
      }
      onSave();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const ds      = initialData?.timestamp ? new Date(initialData.timestamp.seconds * 1000) : new Date();
  const dateStr = `${String(ds.getFullYear()).slice(2)}. ${ds.getMonth() + 1}. ${ds.getDate()}`;

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa] overflow-hidden">
      <ConfirmModal
        isOpen={showExitModal}
        title="식단 기록을 저장할까요?"
        subtitle="저장하지 않고 나가면 현재까지 작성한 내용은 사라집니다."
        confirmText="저장하고 나가기"
        cancelText="계속 작성"
        tertiaryText="그냥 나가기"
        onConfirm={() => {
          setShowExitModal(false);
          handleSaveClick();
        }}
        onTertiary={onBack}
        onCancel={() => setShowExitModal(false)}
      />
      <header className="flex-none bg-white z-20">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <Pressable pressScale={0.85} onClick={handleBackClick} className="flex items-center justify-center w-8 h-8 rounded-full">
              <IcBack />
            </Pressable>
            <h1 className="font-pretendard text-[20px] font-semibold text-black tracking-[-0.5px] leading-[36px] whitespace-nowrap m-0">
              식단 메모
            </h1>
          </div>
          <Pressable pressScale={0.85} onClick={() => { setMoreSheetOpen(true); setEditingGoal(false); }} className="flex items-center justify-center w-8 h-8 rounded-full">
            <IcMore size={24} />
          </Pressable>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto pb-6">
        {/* 컴팩트 sticky 바 — 고정 높이 52px, opacity만 변함 (레이아웃 변화 없음) */}
        <div
          ref={compactBarRef}
          className="sticky top-0 z-10 bg-white border-b border-[#f1f3f5] px-4"
          style={{ height: 52, display: 'flex', alignItems: 'center', opacity: 0 }}
        >
          <div className="flex items-center justify-between w-full">
            <p className="font-pretendard font-semibold text-[17px] text-[#171a1d] m-0 tracking-[-0.43px]">
              {totals.kcal.toLocaleString()} kcal
            </p>
            <span className="font-pretendard text-[13px] text-[#646d76] tracking-[-0.325px]">{dateStr}</span>
          </div>
        </div>

        {/* 풀 요약 카드 — non-sticky, 자연스럽게 스크롤. -mt-[52px]로 compact bar 영역과 겹쳐 시작 */}
        <div className="bg-white px-4 pb-4" style={{ marginTop: -52, paddingTop: 52 }}>
          {chip && (
            <div className="inline-flex items-center px-2 py-1 rounded-[8px] w-fit mb-2" style={{ background: chip.bg }}>
              <span className="font-pretendard font-normal text-[13px] leading-[20px] tracking-[-0.325px] whitespace-nowrap" style={{ color: chip.color }}>
                {chip.label}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between whitespace-nowrap">
            <p className="font-pretendard font-semibold text-[24px] leading-[32px] tracking-[-0.6px] text-[#171a1d] m-0">
              {totals.kcal.toLocaleString()} kcal
            </p>
            <span className="font-pretendard font-normal text-[14px] leading-[20px] tracking-[-0.35px] text-[#646d76]">{dateStr}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="font-pretendard font-normal text-[14px] leading-[20px] tracking-[-0.35px] text-[#495057] m-0">
              목표 {goalKcal.toLocaleString()}
            </p>
            <p className="font-pretendard font-normal text-[13px] leading-[20px] tracking-[-0.325px] text-[#adb5bd] m-0">
              {totals.kcal > 0 ? `${Math.round((totals.kcal / goalKcal) * 100)}%` : ''}
            </p>
          </div>
          <div className="mt-2.5 h-1.5 bg-[#f1f3f5] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min((totals.kcal / goalKcal) * 100, 100)}%`,
                background: totals.kcal > goalKcal * 1.1 ? '#e03e52' : totals.kcal >= goalKcal * 0.95 ? '#1a9e5c' : '#3476EE',
              }}
            />
          </div>
          <div className="border-b border-[#f1f3f5] mt-3" />
          <div className="flex items-center gap-4 py-4">
            <DonutChart carb={totals.carb} protein={totals.protein} fat={totals.fat} />
            <div className="flex flex-col gap-2 flex-1">
              {[
                { color: '#3385ff', label: '탄수화물', value: totals.carb },
                { color: '#e05a2b', label: '단백질',   value: totals.protein },
                { color: '#e8a126', label: '지방',     value: totals.fat },
              ].map(({ color, label, value }) => (
                <div key={label} className="flex items-center gap-[4px]">
                  <div className="w-[10px] h-[10px] rounded-full shrink-0" style={{ background: color }} />
                  <span className="font-pretendard font-medium text-[12px] leading-[18px] tracking-[-0.3px] text-[#868e96] flex-1 whitespace-nowrap">{label}</span>
                  <span className="font-pretendard font-medium text-[12px] leading-[18px] tracking-[-0.3px] text-[#495057] whitespace-nowrap">{value}g</span>
                </div>
              ))}
            </div>
          </div>
          {aiComment && (
            <div className="border-t border-[#f1f3f5] py-4 flex gap-2 items-start">
              <QuoteIcon gid="diet_quote" />
              <p className="font-pretendard font-medium text-[14px] leading-[20px] tracking-[-0.35px] bg-gradient-to-r from-[#228bed] to-[#c509d6] bg-clip-text text-transparent flex-1 m-0 truncate">
                {aiComment}
              </p>
            </div>
          )}
        </div>

        {/* 식단 슬롯 */}
        {sections.map(sec => {
          const secItems = sec.items || [];
          const secTotals = getItemsTotal(secItems);
          const secKcal  = secTotals.kcal;
          const tip      = getMealTip(secItems, profile, sec.id, goalKcal);
          const inputValue = aiInputs[sec.id] || '';
          const matchedRecentFoods = inputValue.trim()
            ? getRecentMatches(inputValue, foodSuggestions)
            : getMealPatternFoods(sec.id, allDietLogs);

          return (
            <div key={sec.id} className="bg-white mt-2 flex flex-col p-4 gap-2">
              {/* 섹션 헤더 */}
              <div className="flex items-center justify-between">
                <h3 className="font-pretendard font-semibold text-[18px] leading-[28px] tracking-[-0.45px] text-[#171a1d] m-0">
                  {sec.name}
                </h3>
                <div className="flex items-center gap-2">
                  {secKcal > 0 && (
                    <span className="font-pretendard font-semibold text-[14px] text-[#3476EE] tracking-[-0.35px]">
                      {secKcal.toLocaleString()} kcal
                    </span>
                  )}
                </div>
              </div>
              {secKcal > 0 && (
                <p className="font-pretendard font-medium text-[12px] leading-[16px] tracking-[-0.3px] text-[#3476EE]/40 m-0 -mt-1">
                  총 탄 {secTotals.carb}g · 단 {secTotals.protein}g · 지 {secTotals.fat}g
                </p>
              )}

              {/* 기록 항목 */}
              {secItems.length > 0 && (
                <div className="flex flex-col divide-y divide-[#f1f3f5]">
                  {secItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-2 gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-pretendard font-semibold text-[14px] text-[#495057] tracking-[-0.35px] truncate m-0">{item.name}</p>
                        <p className="font-pretendard text-[11px] text-[#868e96] tracking-[-0.2px] mt-0.5 m-0">
                          탄 {item.carb}g · 단 {item.protein}g · 지 {item.fat}g
                          {formatNutritionSource(item.source)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-pretendard font-semibold text-[13px] text-[#646D76]">{item.kcal} kcal</span>
                        <button onClick={() => handleOpenEdit(sec.id, item)}
                          className="w-6 h-6 flex items-center justify-center text-[#adb5bd] hover:text-[#495057] transition-colors rounded-full hover:bg-[#f1f3f5]">
                          <IcPencil size={13} color="#adb5bd" />
                        </button>
                        <button onClick={() => handleRemoveItem(sec.id, item.id)}
                          className="w-6 h-6 flex items-center justify-center text-[#adb5bd] hover:text-[#e03e52] transition-colors rounded-full hover:bg-[#fff5f5]">
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M9 1L1 9M1 1l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 끼니별 피드백 */}
              {tip && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[#f8f9fa] rounded-[10px]">
                  <span className="text-[11px]">💬</span>
                  <p className="font-pretendard text-[12px] text-[#646d76] tracking-[-0.3px] leading-relaxed m-0 flex-1">{tip}</p>
                </div>
              )}

              {/* 입력 폼 */}
              <div className="mt-1 flex items-center gap-2">
                {/* 텍스트 입력 + 검색 */}
                <div className="flex-1 flex items-center gap-1 bg-white rounded-[12px] pl-3 pr-1.5 py-2 min-h-[44px] border border-[#dee2e6] focus-within:border-[#3476EE] transition-colors shadow-sm">
                  <AutoTextarea
                    value={inputValue}
                    onChange={e => setAiInputs(p => ({ ...p, [sec.id]: e.target.value }))}
                    placeholder={sec.placeholder}
                    className="font-pretendard font-normal text-[14px] leading-[20px] tracking-[-0.35px] text-[#171a1d] flex-1 bg-transparent border-none outline-none resize-none placeholder:text-[#adb5bd]"
                  />
                  <button
                    onClick={() => handleOpenSearchModal(sec.id, inputValue)}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f1f3f5] transition-colors shrink-0"
                    aria-label={`${sec.name} 식품 검색`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="8" stroke="#adb5bd" strokeWidth="2"/>
                      <path d="M21 21l-4.35-4.35" stroke="#adb5bd" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                {/* AI 분석 버튼 — 외부 분리 */}
                <button
                  onClick={() => handleAIAnalyze(sec.id)}
                  disabled={analyzingIds.current.has(sec.id) || !inputValue.trim()}
                  className="flex-none w-[44px] h-[44px] rounded-[12px] flex items-center justify-center disabled:opacity-35 transition-all duration-100 active:bg-[#f8f9fa]"
                  aria-label={`${sec.name} 식단 AI 분석`}
                >
                  {analyzingIds.current.has(sec.id)
                    ? <div className="w-4 h-4 border-2 border-[#c509d6]/30 border-t-[#228bed] rounded-full animate-spin" />
                    : <IcSpark />}
                </button>
              </div>

              {/* 이전 식단 빠른 추가 */}
              {matchedRecentFoods.length > 0 && (
                <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
                  {matchedRecentFoods.map(food => (
                    <Pressable
                      key={food.name}
                      pressScale={0.95}
                      onClick={() => handleAddRecentFood(sec.id, food)}
                      className="flex-none px-2.5 py-1 bg-[#f1f3f5] rounded-full font-pretendard text-[12px] text-[#495057] tracking-[-0.3px] whitespace-nowrap hover:bg-[#e9ecef]"
                    >
                      + {food.name}
                    </Pressable>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {saving && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
            <div className="bg-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-[#3476EE]/30 border-t-[#3476EE] rounded-full animate-spin" />
              <span className="font-pretendard text-[14px] font-semibold text-[#171a1d]">저장 중...</span>
            </div>
          </div>
        )}
      </main>

      {/* 하단 저장 액션바 */}
      <div className="flex-none bg-white border-t border-[#f1f3f5] px-5 pt-4 pb-10">
        <Pressable
          pressScale={0.97}
          onClick={handleSaveClick}
          disabled={saving}
          className="w-full h-[56px] bg-[#3476EE] rounded-2xl font-pretendard font-bold text-[16px] text-white tracking-[-0.4px] disabled:opacity-40"
        >
          저장하기
        </Pressable>
      </div>

      {/* 식품 검색 모달 */}
      {searchModal && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm"
             onClick={handleCloseSearchModal}>
          <div className="bg-white w-full max-w-[430px] rounded-t-[24px] px-4 pt-5 pb-8 shadow-2xl max-h-[75vh] flex flex-col"
               onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#dee2e6] rounded-full mx-auto mb-4" />
            <h2 className="font-pretendard font-semibold text-[18px] tracking-[-0.45px] text-[#171a1d] mb-4 m-0">식품 검색</h2>

            <div className="flex min-w-0 gap-2 mb-4">
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFoodSearch()}
                placeholder="식품명 + 수량 (예: 닭가슴살 200g)"
                className="flex-1 min-w-0 bg-[#f8f9fa] rounded-[10px] px-4 py-2.5 font-pretendard text-[14px] text-[#171a1d] outline-none border border-transparent focus:border-[#3476EE] transition-colors placeholder:text-[#adb5bd]"
              />
              <button
                onClick={handleFoodSearch}
                disabled={searching || !searchQuery.trim()}
                className="shrink-0 bg-[#3476EE] text-white font-pretendard font-semibold text-[13px] px-4 rounded-[10px] disabled:opacity-40 flex items-center justify-center min-w-[56px]"
              >
                {searching
                  ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : '검색'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="mb-4 flex-1 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-pretendard font-semibold text-[12px] text-[#868e96] uppercase tracking-[0.5px] m-0">검색 결과</p>
                  <button
                    onClick={handleUseAiEstimate}
                    disabled={estimatingSearch}
                    className="font-pretendard font-semibold text-[12px] text-[#3476EE] disabled:opacity-40"
                  >
                    {estimatingSearch ? '추정 중...' : 'AI 추정값 사용'}
                  </button>
                </div>
                <div className="flex flex-col">
                  {searchResults.map(food => (
                    <div key={`${food.name}-${food.kcal}-${food.carb}`} className="flex items-center justify-between gap-3 py-3 border-b border-[#f1f3f5] last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-pretendard font-semibold text-[14px] text-[#171a1d] m-0 truncate">{food.name}</p>
                        <p className="font-pretendard text-[12px] text-[#868e96] mt-0.5 m-0">
                          탄 {food.carb}g · 단 {food.protein}g · 지 {food.fat}{formatNutritionSource(food.source || 'mfds')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-pretendard font-bold text-[13px] text-[#3476EE]">{food.kcal} kcal</span>
                        <button
                          onClick={() => handleAddSearchItem(normalizeSearchItem(food))}
                          className="w-8 h-8 bg-[#3476EE] text-white rounded-full flex items-center justify-center font-bold text-[18px] leading-none"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {searchResult && (
              <div className="mb-4 p-3 border border-[#3476EE]/30 rounded-[12px] bg-[#eef4ff]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-pretendard font-semibold text-[14px] text-[#171a1d] m-0 truncate">{searchResult.name}</p>
                    <p className="font-pretendard text-[12px] text-[#868e96] mt-0.5 m-0">
                      탄 {searchResult.carb}g · 단 {searchResult.protein}g · 지 {searchResult.fat}g
                      {formatNutritionSource(searchResult.source)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-pretendard font-bold text-[14px] text-[#3476EE]">{searchResult.kcal} kcal</span>
                    <button onClick={handleAddSearchResult}
                      className="bg-[#3476EE] text-white font-pretendard font-semibold text-[12px] px-3 py-1.5 rounded-full">
                      추가
                    </button>
                  </div>
                </div>
              </div>
            )}

            {foodSuggestions.length > 0 && searchResults.length === 0 ? (
              <div className="flex-1 overflow-y-auto">
                <p className="font-pretendard font-semibold text-[12px] text-[#868e96] uppercase tracking-[0.5px] mb-2">최근 식품</p>
                <div className="flex flex-col">
                  {foodSuggestions.map(food => (
                    <div key={food.name} className="flex items-center justify-between py-2.5 border-b border-[#f1f3f5] last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-pretendard font-semibold text-[14px] text-[#171a1d] m-0 truncate">{food.name}</p>
                        <p className="font-pretendard text-[12px] text-[#868e96] m-0">
                          탄 {food.carb}g · 단 {food.protein}g · 지 {food.fat}g{formatNutritionSource(food.source)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-pretendard font-bold text-[13px] text-[#3476EE]">{food.kcal} kcal</span>
                        <button
                          onClick={() => { handleAddRecentFood(searchModal, food); handleCloseSearchModal(); }}
                          className="w-8 h-8 bg-[#3476EE] text-white rounded-full flex items-center justify-center font-bold text-[18px] leading-none"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : !searchResult && searchResults.length === 0 && (
              <p className="font-pretendard text-[14px] text-[#adb5bd] text-center py-8">
                위에서 식품을 검색해보세요
              </p>
            )}
          </div>
        </div>
      )}

      {/* 더보기 바텀시트 */}
      {moreSheetOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div onClick={() => setMoreSheetOpen(false)} className="absolute inset-0 bg-[#171719]/50" />
          <div className="relative bg-white rounded-t-[24px] px-4 pb-10 flex flex-col items-center shadow-lg animate-[bottomSheetUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)_forwards]">
            <div className="py-3 w-full flex justify-center">
              <div className="w-10 h-1 rounded-full bg-[#dee2e6]" />
            </div>
            <div className="w-full flex flex-col divide-y divide-[#f1f3f5]">
              {/* 목표 칼로리 수정 */}
              <div className="py-4">
                <button
                  onClick={() => { setEditingGoal(p => !p); setGoalInput(String(goalKcal)); }}
                  className="flex items-center gap-3 w-full bg-transparent border-none outline-none text-left cursor-pointer transition-all duration-100 active:opacity-50"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#171a1d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4l3 3"/>
                  </svg>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="font-pretendard text-[15px] font-medium text-[#171a1d] tracking-[-0.4px]">목표 칼로리 수정</span>
                    <span className="font-pretendard text-[13px] text-[#868e96] tracking-[-0.35px]">현재 {goalKcal.toLocaleString()} kcal</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#adb5bd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${editingGoal ? 'rotate-180' : ''}`}>
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
                {editingGoal && (
                  <div className="flex gap-2 mt-3">
                    <input
                      type="number"
                      value={goalInput}
                      onChange={e => setGoalInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleGoalSave()}
                      placeholder="목표 칼로리"
                      className="flex-1 bg-[#f8f9fa] rounded-[10px] px-4 py-2.5 font-pretendard text-[14px] text-[#171a1d] outline-none border border-transparent focus:border-[#3476EE] transition-colors"
                      autoFocus
                    />
                    <span className="font-pretendard text-[13px] text-[#adb5bd] self-center">kcal</span>
                    <button
                      onClick={handleGoalSave}
                      className="bg-[#3476EE] text-white font-pretendard font-semibold text-[13px] px-4 rounded-[10px]"
                    >
                      확인
                    </button>
                  </div>
                )}
              </div>

              {/* 클립보드 복사 */}
              <button
                onClick={handleMoreCopy}
                className="flex items-center gap-3 w-full py-4 bg-transparent border-none outline-none text-left cursor-pointer transition-all duration-100 active:opacity-50"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#171a1d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <div className="flex flex-col gap-0.5">
                  <span className="font-pretendard text-[15px] font-medium text-[#171a1d] tracking-[-0.4px]">클립보드 복사</span>
                  <span className="font-pretendard text-[13px] text-[#868e96] tracking-[-0.35px]">현재 식단 기록을 텍스트로 복사해요</span>
                </div>
              </button>

              {/* 전체 초기화 */}
              <button
                onClick={handleMoreReset}
                className="flex items-center gap-3 w-full py-4 bg-transparent border-none outline-none text-left cursor-pointer transition-all duration-100 active:opacity-50"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e03e52" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                <div className="flex flex-col gap-0.5">
                  <span className="font-pretendard text-[15px] font-medium text-[#e03e52] tracking-[-0.4px]">전체 초기화</span>
                  <span className="font-pretendard text-[13px] text-[#868e96] tracking-[-0.35px]">모든 식단 기록을 지우고 처음부터 시작해요</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm"
             onClick={() => setEditTarget(null)}>
          <div className="bg-white w-full max-w-[430px] rounded-t-[24px] px-5 pt-6 pb-10 shadow-2xl"
               onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#dee2e6] rounded-full mx-auto mb-5" />
            <h2 className="font-pretendard font-semibold text-[18px] tracking-[-0.45px] text-[#171a1d] mb-5 m-0">항목 수정</h2>
            <div className="mb-3">
              <label className="font-pretendard text-[12px] text-[#868e96] tracking-[-0.3px] mb-1 block">음식명</label>
              <input
                value={editForm.name}
                onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-[#f8f9fa] rounded-[8px] px-3 py-2.5 font-pretendard text-[14px] text-[#171a1d] tracking-[-0.35px] outline-none border border-transparent focus:border-[#3476EE] transition-colors"
              />
            </div>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {[
                { key: 'kcal', label: 'kcal', unit: 'kcal' },
                { key: 'carb', label: '탄수화물', unit: 'g' },
                { key: 'protein', label: '단백질', unit: 'g' },
                { key: 'fat', label: '지방', unit: 'g' },
              ].map(({ key, label, unit }) => (
                <div key={key}>
                  <label className="font-pretendard text-[11px] text-[#868e96] tracking-[-0.2px] mb-1 block">{label}</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={editForm[key]}
                      onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                      className="w-full bg-[#f8f9fa] rounded-[8px] px-2 py-2 font-pretendard text-[13px] text-[#171a1d] outline-none border border-transparent focus:border-[#3476EE] transition-colors"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 font-pretendard text-[10px] text-[#adb5bd]">{unit}</span>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={handleSaveEdit}
              className="w-full bg-[#3476EE] text-white font-pretendard font-semibold text-[16px] tracking-[-0.4px] py-3.5 rounded-[12px] transition-opacity hover:opacity-90 active:opacity-80"
            >
              수정 완료
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
