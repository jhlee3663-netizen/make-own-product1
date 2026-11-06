import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, setDoc, updateDoc, doc, serverTimestamp, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { IcSpark } from '../icons/Icons';
import { AutoTextarea } from '../common/AutoTextarea';
import ConfirmModal from '../common/ConfirmModal';
import Pressable from '../common/Pressable';
import Toast from '../common/Toast';
import useDismiss from '../../lib/useDismiss';
import {
  BottomBar,
  FadeLine,
  FoodPickRow,
  IntakeSummary,
  NutritionBoxes,
  PortionStepper,
  ScreenFrame,
  Sheet,
  SheetButton,
  ViewHeader,
  addTotals,
  comma,
  defaultMealByTime,
  describePortion,
  findPreviousMeal,
  getItemsTotal,
} from '../diet/DietParts';
import { getDietSummaryComment } from '../../utils/dietFeedback';
import { estimateFoodNutrition, estimateMealNutrition, findCustomFood, normalizeFoodKey, searchMfdsFoods, shareFood, splitFoodMemoLocally } from '../../utils/nutritionLookup';
import { loadUserData, saveUserData } from '../../lib/userStore';
import { aiErrorMessage } from '../../lib/aiClient';
import { getUserStorage, setUserStorage } from '../../lib/userStorage';
import { clearRecordDraft, loadRecordDraft, saveRecordDraft, withSaveTimeout } from '../../lib/recordDrafts';
import {
  adjustFoodPortion,
  ensureFoodPortion,
  getPortionDisplayName,
  mergeFoodPortionItems,
  rebaseFoodPortionNutrition,
  sanitizeFoodPortion,
  setFoodPortionAmount,
  switchFoodPortionMode,
} from '../../utils/dietPortions';
import { calculateMacroCalories, hasManualMacroValues, parseManualMacroText } from '../../utils/manualMacroEntry';
import { logGoalKcal } from '../../lib/calorieGoal';

const DEFAULT_SECTIONS = [
  { id: 'breakfast',   name: '아침',     placeholder: '아침에 먹은 식단을 적어주세요\n(예: 고구마 하나 우유 한잔)' },
  { id: 'am_snack',    name: '오전간식', placeholder: '오전 간식에 먹은 식단을 적어주세요\n(예: 바나나 하나 아몬드 한줌)' },
  { id: 'lunch',       name: '점심',     placeholder: '점심에 먹은 식단을 적어주세요\n(예: 닭가슴살 200g 흰쌀밥 한공기)' },
  { id: 'pm_snack',    name: '오후간식', placeholder: '오후 간식에 먹은 식단을 적어주세요\n(예: 단백질 쉐이크 1스쿱)' },
  { id: 'dinner',      name: '저녁',     placeholder: '저녁에 먹은 식단을 적어주세요\n(예: 연어 150g 샐러드)' },
  { id: 'night_snack', name: '야식',     placeholder: '야식에 먹은 식단을 적어주세요\n(예: 카제인 단백질 1스쿱)' },
];

// 이름 없이 넣은 직접 입력("점심 직접 기록")만 양을 못 바꾸는 한 덩어리 기록으로 남긴다.
// 이름을 붙인 것("잔치국수 1인분")은 보통 음식처럼 개수·무게를 조절한다.
function isLooseManual(item) {
  return item?.entryType === 'manualMacros' && /직접 기록$/.test(String(item.name || '').trim());
}

const MEAL_EXAMPLES = {
  breakfast: ['그릭요거트에 바나나 하나', '계란 2개랑 식빵 한 장'],
  lunch: ['제육덮밥이랑 콜라', '닭가슴살 샐러드 한 접시, 아메리카노'],
  dinner: ['삼겹살 2인분이랑 냉면', '연어 150g에 샐러드'],
};
const SNACK_EXAMPLES = ['프로틴 쉐이크 1스쿱', '바나나 하나, 아몬드 한 줌'];

const EMPTY_MANUAL_MACRO_FORM = { name: '', paste: '', kcal: '', carb: '', protein: '', fat: '' };

/* QA-16: 음수·NaN·Infinity·비현실적 수치를 저장 전에 차단한다.
   기존에 저장된 잘못된 값을 읽을 때도 같은 함수로 방어한다. */
const NUTRITION_MAX = { kcal: 20000, carb: 3000, protein: 3000, fat: 3000 };

export function sanitizeNutritionValue(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), NUTRITION_MAX[field] ?? 20000);
}

export function isValidNutritionInput(form) {
  const fields = ['kcal', 'carb', 'protein', 'fat'];
  return fields.every(field => {
    const raw = form?.[field];
    if (raw === '' || raw === null || raw === undefined) return true;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= (NUTRITION_MAX[field] ?? 20000);
  });
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
      (log.sections || []).flatMap(sec => (sec.items || []).filter(item => item.entryType !== 'manualMacros'))
    )
  ).map(({ name, kcal, carb, protein, fat, source, serving, portion }) => ({ name, kcal, carb, protein, fat, source, serving, portion }));
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
      if (item.entryType === 'manualMacros') return;
      const key = String(item.name || '').trim();
      if (!key) return;
      if (!freq[key]) freq[key] = { food: { name: item.name, kcal: item.kcal, carb: item.carb, protein: item.protein, fat: item.fat, source: item.source, serving: item.serving, portion: item.portion }, count: 0 };
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

function loadRecentFoods(uid) {
  try { return JSON.parse(getUserStorage(uid, RECENT_KEY)) || []; } catch { return []; }
}

function loadCustomFoods(uid) {
  try { return JSON.parse(getUserStorage(uid, CUSTOM_FOODS_KEY)) || []; } catch { return []; }
}

function saveCustomFoods(uid, foods) {
  setUserStorage(uid, CUSTOM_FOODS_KEY, JSON.stringify(foods));
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

function pushRecent(uid, newItems, current) {
  const norm = newItems.map(({ name, kcal, carb, protein, fat, source, matchedName, adjustmentNote, intakeModifiers, serving, portion }) => ({
    name,
    kcal,
    carb,
    protein,
    fat,
    source,
    matchedName,
    adjustmentNote,
    intakeModifiers,
    serving,
    portion,
  }));
  const merged = [...norm, ...current.filter(r => !norm.some(n => normalizeFoodKey(n.name) === normalizeFoodKey(r.name)))].slice(0, 15);
  setUserStorage(uid, RECENT_KEY, JSON.stringify(merged));
  return merged;
}

function serializeDietDraft(sections, aiInputs, goalKcal) {
  const filledInputs = Object.fromEntries(
    Object.entries(aiInputs || {}).filter(([, value]) => String(value || '').trim())
  );
  return JSON.stringify({ sections, aiInputs: filledInputs, goalKcal });
}

export default function DietDetailScreen({ onBack, onSave, initialData, initialMeal, uid, profile, registerBackGuard }) {
  const draftTargetId = initialData?.docId || 'new';
  // 피드에서 가져온 식단(imported)은 남아 있던 임시 저장보다 우선한다.
  const restoredDraftRef = useRef(initialData?.imported ? null : loadRecordDraft(uid, 'diet', draftTargetId));
  const restoredDraft = restoredDraftRef.current;
  const originalSectionsRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const pendingCreateRef = useRef(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(Boolean(restoredDraft));

  const [sections, setSections]       = useState(DEFAULT_SECTIONS.map(s => ({ ...s, items: [] })));
  const [goalKcal, setGoalKcal]       = useState(2500);
  const [saving, setSaving]           = useState(false);
  const [aiComment, setAiComment]     = useState('');
  const [aiInputs, setAiInputs]       = useState({});
  const analyzingIds = useRef(new Set());
  const [analyzingVersion, setAnalyzingVersion] = useState(0);
  const [editTarget, setEditTarget]   = useState(null);
  const [editForm, setEditForm]       = useState({ name: '', kcal: '', carb: '', protein: '', fat: '' });
  const [recentFoods, setRecentFoods] = useState(() => loadRecentFoods(uid));
  const [customFoods, setCustomFoods] = useState(() => loadCustomFoods(uid));
  // 내가 고친 값은 예전엔 이 기기에만 있었다. 서버에 저장된 것과 합쳐, 같은 음식이면 더 최근에 고친 값을 쓴다.
  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    loadUserData(uid).then((data) => {
      const remote = Array.isArray(data?.customFoods) ? data.customFoods : [];
      if (cancelled) return;
      setCustomFoods((local) => {
        const byKey = new Map();
        [...remote, ...local].forEach((food) => {
          if (!food?.key) return;
          const prev = byKey.get(food.key);
          if (!prev || Number(food.updatedAt || 0) >= Number(prev.updatedAt || 0)) byKey.set(food.key, food);
        });
        const merged = [...byKey.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 80);
        saveCustomFoods(uid, merged);
        if (merged.length !== remote.length) saveUserData(uid, { customFoods: merged }).catch(() => {});
        return merged;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [uid]);
  const [savedFoods, setSavedFoods]   = useState([]);
  const [allDietLogs, setAllDietLogs] = useState([]);
  const [searchModal, setSearchModal] = useState(null); // secId | null
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [multiSearch, setMultiSearch] = useState(false);
  const [searching, setSearching]     = useState(false);
  const [estimatingSearch, setEstimatingSearch] = useState(false);
  const searchInputRef = useRef(null);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [foodListOpen, setFoodListOpen] = useState(false);
  const [manualMacroTarget, setManualMacroTarget] = useState(null);
  const [manualMacroForm, setManualMacroForm] = useState(EMPTY_MANUAL_MACRO_FORM);
  const [manualMacroSavedToast, setManualMacroSavedToast] = useState(false);
  const foodToastTimerRef = useRef(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  useEffect(() => {
    if (initialData) {
      const merged = DEFAULT_SECTIONS.map(def => {
        const found = (initialData.sections || []).find(s => s.id === def.id);
        return found ? { ...def, items: mergeFoodPortionItems([], found.items || []) } : { ...def, items: [] };
      });
      setSections(merged);
      setGoalKcal(logGoalKcal(initialData, profile) || 2500);
      setAiComment(initialData.aiComment || '');
      const restoredInputs = initialData.unparsedInputs || {};
      setAiInputs(restoredInputs);
      const baseline = initialData.imported ? DEFAULT_SECTIONS.map(def => ({ ...def, items: [] })) : merged;
      originalSectionsRef.current = serializeDietDraft(baseline, restoredInputs, logGoalKcal(initialData, profile) || 2500);
      if (restoredDraft) {
        setSections((restoredDraft.sections || merged).map(sec => ({ ...sec, items: mergeFoodPortionItems([], sec.items || []) })));
        setGoalKcal(restoredDraft.goalKcal || logGoalKcal(initialData, profile) || 2500);
        setAiInputs(restoredDraft.aiInputs || restoredInputs);
      }
    } else {
      const defaultMerged = DEFAULT_SECTIONS.map(s => ({ ...s, items: [] }));
      const defaultGoal = logGoalKcal(null, profile) || 2500;
      setSections(defaultMerged);
      setGoalKcal(defaultGoal);
      setAiInputs({});
      originalSectionsRef.current = serializeDietDraft(defaultMerged, {}, defaultGoal);
      if (restoredDraft) {
        setSections((restoredDraft.sections || defaultMerged).map(sec => ({ ...sec, items: mergeFoodPortionItems([], sec.items || []) })));
        setGoalKcal(restoredDraft.goalKcal || defaultGoal);
        setAiInputs(restoredDraft.aiInputs || {});
        if (restoredDraft.pendingDocId) pendingCreateRef.current = doc(db, 'logs', restoredDraft.pendingDocId);
      }
    }
    setDraftReady(true);
  }, [initialData, profile?.targetKcal, profile?.targetKcalHistory, restoredDraft]);

  useEffect(() => {
    if (!draftReady || !uid || !hasUnsavedChanges()) return undefined;
    const timer = setTimeout(() => {
      const pendingDocId = initialData?.docId
        ? null
        : (pendingCreateRef.current || (pendingCreateRef.current = doc(collection(db, 'logs')))).id;
      saveRecordDraft(uid, 'diet', draftTargetId, { sections, aiInputs, goalKcal, pendingDocId });
    }, 300);
    return () => clearTimeout(timer);
  }, [draftReady, uid, draftTargetId, initialData?.docId, sections, aiInputs, goalKcal]);

  useEffect(() => {
    if (!draftRestored) return undefined;
    const timer = setTimeout(() => setDraftRestored(false), 3000);
    return () => clearTimeout(timer);
  }, [draftRestored]);

  function discardAndLeave() {
    clearRecordDraft(uid, 'diet', draftTargetId);
    onBack();
  }

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    async function loadSavedFoods() {
      try {
        const q = query(collection(db, 'logs'), where('uid', '==', uid), orderBy('timestamp', 'desc'), limit(100));
        const snap = await getDocs(q);
        const logs = snap.docs
          .map(d => d.data())
          .filter(d => d.type === 'diet' && !d.deletedAt)
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

  function hasUnsavedChanges() {
    const currentDraft = serializeDietDraft(sections, aiInputs, goalKcal);
    return Boolean(originalSectionsRef.current && originalSectionsRef.current !== currentDraft);
  }

  function requestNavigation() {
    // 열려 있는 시트나 하위 화면이 있으면 뒤로 가기는 그것부터 닫는다
    if (closeTopLayer()) return false;
    if (hasUnsavedChanges()) {
      setShowExitModal(true);
      return false;
    }
    return true;
  }

  useEffect(() => {
    if (!registerBackGuard) return undefined;
    registerBackGuard(requestNavigation);
    return () => registerBackGuard(null);
  }, [registerBackGuard, sections, aiInputs, goalKcal, editTarget, moreSheetOpen, searchModal, manualMacroTarget, foodListOpen]);

  const handleBackClick = () => {
    if (requestNavigation()) onBack();
  };

  useEffect(() => {
    if (searchModal && searchInputRef.current) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [searchModal]);

  useEffect(() => () => {
    if (foodToastTimerRef.current) clearTimeout(foodToastTimerRef.current);
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

  const foodSuggestions = useMemo(() => mergeFoodLists(customFoods, recentFoods, savedFoods), [customFoods, recentFoods, savedFoods]);

  function upsertCustomFood(food) {
    const custom = {
      key: normalizeFoodKey(food.name),
      name: String(food.name || '').trim(),
      kcal: sanitizeNutritionValue(food.kcal, 'kcal'),
      carb: sanitizeNutritionValue(food.carb, 'carb'),
      protein: sanitizeNutritionValue(food.protein, 'protein'),
      fat: sanitizeNutritionValue(food.fat, 'fat'),
      source: 'custom',
      matchedName: '내가 수정한 기준',
      updatedAt: Date.now(),
    };
    if (!custom.key || !custom.name) return null;
    const next = [custom, ...customFoods.filter(food => food.key !== custom.key)].slice(0, 80);
    setCustomFoods(next);
    saveCustomFoods(uid, next);
    // 다른 기기에서도 쓰도록 서버에도 저장하고, 공용 음식 사전에 "사람이 고친 값"으로 보탠다
    if (uid) saveUserData(uid, { customFoods: next }).catch(() => {});
    shareFood(custom, 'user');
    setRecentFoods(prev => pushRecent(uid, [custom], prev));
    return custom;
  }

  /* 적어 둔 글 한 덩어리를 AI로 음식 목록으로 바꾼다 (화면 상태는 건드리지 않는다) */
  async function analyzeTextToItems(text) {
    const estimatedFoods = await estimateMealNutrition(text, customFoods);
    return estimatedFoods.map(item => ensureFoodPortion({
      id:      Math.random().toString(36).slice(2, 11),
      name:    String(item.name    || ''),
      kcal:    Number(item.kcal    || 0),
      carb:    Number(item.carb    || 0),
      protein: Number(item.protein || 0),
      fat:     Number(item.fat     || 0),
      source:  item.source || 'ai',
      matchedName: item.matchedName || null,
      adjustmentNote: item.adjustmentNote || null,
      intakeModifiers: item.intakeModifiers || [],
      serving: item.serving || '',
    }));
  }

  /* AI 텍스트 분석 */
  async function handleAIAnalyze(secId) {
    const text = aiInputs[secId]?.trim();
    if (!text) return;
    analyzingIds.current.add(secId);
    setAnalyzingVersion(v => v + 1);
    try {
      const newItems = await analyzeTextToItems(text);
      setSections(prev => prev.map(sec =>
        sec.id === secId ? { ...sec, items: mergeFoodPortionItems(sec.items || [], newItems) } : sec
      ));
      setAiInputs(prev => ({ ...prev, [secId]: '' }));
      setRecentFoods(prev => pushRecent(uid, newItems, prev));
    } catch (e) {
      alert('AI 분석 오류: ' + aiErrorMessage(e));
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
    setMultiSearch(false);
    try {
      const custom = findCustomFood(customFoods, searchQuery);
      if (custom) {
        setSearchResult(normalizeSearchItem(custom));
        setSearchResults([]);
        return;
      }
      /* 음식을 여러 개 적으면 하나씩 나눠서 각각 결과로 보여준다. */
      if (splitFoodMemoLocally(searchQuery).length > 1) {
        const items = await estimateMealNutrition(searchQuery, customFoods);
        setMultiSearch(true);
        setSearchResults(items);
        return;
      }
      const mfdsItems = await searchMfdsFoods(searchQuery);
      setSearchResults(mfdsItems.map(food => applyCustomFood(food, customFoods)));
      if (mfdsItems.length === 0) {
        const item = await estimateFoodNutrition(searchQuery);
        setSearchResult(normalizeSearchItem(item));
      }
    } catch (e) {
      alert('검색 실패: ' + aiErrorMessage(e));
    } finally {
      setSearching(false);
    }
  }

  function normalizeSearchItem(item) {
    const customApplied = applyCustomFood(item, customFoods);
    return ensureFoodPortion({
      id: Math.random().toString(36).slice(2, 11),
      name: String(customApplied.name || searchQuery),
      kcal: Number(customApplied.kcal || 0),
      carb: Number(customApplied.carb || 0),
      protein: Number(customApplied.protein || 0),
      fat: Number(customApplied.fat || 0),
      source: customApplied.source || 'ai',
      matchedName: customApplied.matchedName || null,
      serving: customApplied.serving || '',
      portion: customApplied.portion,
    });
  }

  function handleAddSearchItem(food) {
    if (!food || !searchModal) return;
    const item = ensureFoodPortion({ ...applyCustomFood(food, customFoods), id: Math.random().toString(36).slice(2, 11) });
    setSections(prev => prev.map(sec =>
      sec.id === searchModal ? { ...sec, items: mergeFoodPortionItems(sec.items || [], [item]) } : sec
    ));
    setRecentFoods(prev => pushRecent(uid, [item], prev));
    /* 여러 음식 검색이면 남은 음식도 이어서 담을 수 있게 시트를 열어 둔다. */
    const rest = multiSearch ? searchResults.filter(r => r.name !== food.name) : [];
    if (rest.length > 0) { setSearchResults(rest); return; }
    setMultiSearch(false);
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
      alert('AI 추정 실패: ' + aiErrorMessage(e));
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
    const item = ensureFoodPortion({ ...applyCustomFood(food, customFoods), id: Math.random().toString(36).slice(2, 11) });
    setSections(prev => prev.map(sec =>
      sec.id === secId ? { ...sec, items: mergeFoodPortionItems(sec.items || [], [item]) } : sec
    ));
    setRecentFoods(prev => pushRecent(uid, [food], prev));
  }

  function handleOpenManualMacro(secId, item = null) {
    setManualMacroTarget({ secId, itemId: item?.id || null });
    setManualMacroForm(item ? {
      name: item.name || '',
      paste: '',
      kcal: item.kcal ?? '',
      carb: item.carb ?? '',
      protein: item.protein ?? '',
      fat: item.fat ?? '',
    } : EMPTY_MANUAL_MACRO_FORM);
  }

  function handleCloseManualMacro() {
    setManualMacroTarget(null);
    setManualMacroForm(EMPTY_MANUAL_MACRO_FORM);
  }

  function handleParseManualMacroPaste(paste) {
    const parsed = parseManualMacroText(paste);
    setManualMacroForm(prev => ({
      ...prev,
      paste,
      ...Object.fromEntries(
        ['kcal', 'carb', 'protein', 'fat']
          .filter(field => parsed[field] != null)
          .map(field => [field, String(parsed[field])])
      ),
    }));
  }

  function handleSaveManualMacro() {
    if (!manualMacroTarget || !isValidNutritionInput(manualMacroForm) || !hasManualMacroValues(manualMacroForm)) return;
    const sectionName = sections.find(sec => sec.id === manualMacroTarget.secId)?.name || '식사';
    const macroKcal = calculateMacroCalories(manualMacroForm);
    const named = Boolean(manualMacroForm.name.trim());
    const values = {
      id: manualMacroTarget.itemId || Math.random().toString(36).slice(2, 11),
      name: manualMacroForm.name.trim() || `${sectionName} 직접 기록`,
      kcal: sanitizeNutritionValue(Number(manualMacroForm.kcal) > 0 ? manualMacroForm.kcal : macroKcal, 'kcal'),
      carb: sanitizeNutritionValue(manualMacroForm.carb, 'carb'),
      protein: sanitizeNutritionValue(manualMacroForm.protein, 'protein'),
      fat: sanitizeNutritionValue(manualMacroForm.fat, 'fat'),
    };
    const item = named
      ? ensureFoodPortion({ ...values, source: 'custom' })
      : { ...values, source: 'manual', entryType: 'manualMacros' };
    setSections(prev => prev.map(sec => {
      if (sec.id !== manualMacroTarget.secId) return sec;
      const items = sec.items || [];
      return {
        ...sec,
        items: manualMacroTarget.itemId
          ? items.map(existing => existing.id === manualMacroTarget.itemId ? item : existing)
          : [...items, item],
      };
    }));
    handleCloseManualMacro();
    if (foodToastTimerRef.current) clearTimeout(foodToastTimerRef.current);
    setManualMacroSavedToast(true);
    foodToastTimerRef.current = setTimeout(() => setManualMacroSavedToast(false), 2500);
  }

  function handleDeleteManualMacro() {
    if (!manualMacroTarget?.itemId) return;
    handleRemoveItem(manualMacroTarget.secId, manualMacroTarget.itemId);
    handleCloseManualMacro();
  }

  function handleRemoveItem(secId, itemId) {
    setSections(prev => prev.map(sec =>
      sec.id === secId ? { ...sec, items: (sec.items || []).filter(i => i.id !== itemId) } : sec
    ));
  }

  function handleAdjustPortion(secId, itemId, direction) {
    setSections(prev => prev.map(sec => {
      if (sec.id !== secId) return sec;
      const nextItems = [];
      (sec.items || []).forEach(item => {
        if (item.id !== itemId) {
          nextItems.push(item);
          return;
        }
        const adjusted = adjustFoodPortion(item, direction);
        if (adjusted) nextItems.push(adjusted);
      });
      return { ...sec, items: nextItems };
    }));
  }

  function handleSetPortionAmount(secId, itemId, amount) {
    setSections(prev => prev.map(sec => {
      if (sec.id !== secId) return sec;
      const nextItems = [];
      (sec.items || []).forEach(item => {
        if (item.id !== itemId) {
          nextItems.push(item);
          return;
        }
        const adjusted = setFoodPortionAmount(item, amount);
        if (adjusted) nextItems.push(adjusted);
      });
      return { ...sec, items: nextItems };
    }));
  }

  function handleSwitchPortionMode(secId, itemId) {
    setSections(prev => prev.map(sec =>
      sec.id === secId
        ? { ...sec, items: (sec.items || []).map(item => item.id === itemId ? switchFoodPortionMode(item) : item) }
        : sec
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
      kcal: sanitizeNutritionValue(editForm.kcal, 'kcal'),
      carb: sanitizeNutritionValue(editForm.carb, 'carb'),
      protein: sanitizeNutritionValue(editForm.protein, 'protein'),
      fat: sanitizeNutritionValue(editForm.fat, 'fat'),
      source: 'custom',
      matchedName: '내가 수정한 기준',
    };
    upsertCustomFood(editedFood);
    setSections(prev => prev.map(sec =>
      sec.id === secId
        ? { ...sec, items: (sec.items || []).map(item =>
            item.id === itemId
              ? rebaseFoodPortionNutrition({ ...item, ...editedFood })
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

  function sanitizeSections(secs) {
    return secs.map(sec => ({
      id: sec.id,
      name: sec.name,
      items: (sec.items || []).map(item => {
        const clean = {
          id:      item.id,
          name:    String(item.name || ''),
          kcal:    sanitizeNutritionValue(item.kcal, 'kcal'),
          carb:    sanitizeNutritionValue(item.carb, 'carb'),
          protein: sanitizeNutritionValue(item.protein, 'protein'),
          fat:     sanitizeNutritionValue(item.fat, 'fat'),
          source:  item.source || 'ai',
        };
        if (item.matchedName != null)    clean.matchedName    = item.matchedName;
        if (item.adjustmentNote != null) clean.adjustmentNote = item.adjustmentNote;
        if (item.intakeModifiers?.length) clean.intakeModifiers = item.intakeModifiers;
        if (item.serving != null) clean.serving = item.serving;
        if (isLooseManual(item)) clean.entryType = 'manualMacros';
        if (!isLooseManual(item)) {
          const portion = sanitizeFoodPortion(item.portion);
          if (portion) clean.portion = portion;
        }
        return clean;
      }),
    }));
  }

  async function handleSaveClick() {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      /* 적어만 두고 AI 분석(✨)을 누르지 않은 끼니가 있으면 먼저 분석해서 함께 저장한다.
         전에는 글만 저장돼 홈 끼니 줄이 "아직 기록이 없어요"로 보였다 (사용자 피드백). */
      let saveSections = sections;
      const unanalyzed = Object.entries(aiInputs).filter(([, value]) => String(value || '').trim());
      if (unanalyzed.length > 0) {
        try {
          for (const [secId, text] of unanalyzed) {
            const newItems = await analyzeTextToItems(text.trim());
            saveSections = saveSections.map(sec =>
              sec.id === secId ? { ...sec, items: mergeFoodPortionItems(sec.items || [], newItems) } : sec
            );
            setRecentFoods(prev => pushRecent(uid, newItems, prev));
          }
        } catch (e) {
          alert('AI 분석 오류: ' + aiErrorMessage(e) + '\n적어 둔 글은 그대로 남겨 뒀어요.');
          return; // 저장하지 않는다 (finally에서 저장 상태를 되돌린다)
        }
        setSections(saveSections);
        setAiInputs({});
      }
      const saveTotals = saveSections.reduce((acc, sec) => (sec.items || []).reduce((inner, item) => ({
        kcal: inner.kcal + Number(item.kcal || 0),
        carb: inner.carb + Number(item.carb || 0),
        protein: inner.protein + Number(item.protein || 0),
        fat: inner.fat + Number(item.fat || 0),
      }), acc), { kcal: 0, carb: 0, protein: 0, fat: 0 });
      const isNew      = !initialData?.docId;
      const totalItems = saveSections.reduce((acc, sec) => acc + (sec.items || []).length, 0);
      let comment      = aiComment;
      if (totalItems > 0) {
        comment = getDietSummaryComment(saveTotals, profile, goalKcal);
        setAiComment(comment);
      }
      const docData = { type: 'diet', goal: goalKcal, kcal: saveTotals.kcal,
        carb: saveTotals.carb, protein: saveTotals.protein, fat: saveTotals.fat,
        sections: sanitizeSections(saveSections),
        unparsedInputs: {},
        aiComment: comment || '식단이 기록되었습니다.',
        /* 식단을 넣을 때마다 친구 스토리에 다시 뜨도록 마지막으로 고친 때를 남긴다 */
        updatedAt: serverTimestamp() };
      if (isNew) {
        const docRef = pendingCreateRef.current || doc(collection(db, 'logs'));
        pendingCreateRef.current = docRef;
        await withSaveTimeout(setDoc(docRef, { ...docData, uid, timestamp: serverTimestamp() }));
      } else {
        await withSaveTimeout(updateDoc(doc(db, 'logs', initialData.docId), { ...docData }));
      }
      clearRecordDraft(uid, 'diet', draftTargetId);
      onSave();
    } catch (e) {
      console.error(e);
      alert('저장 실패: ' + aiErrorMessage(e));
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  const ds      = initialData?.timestamp ? new Date(initialData.timestamp.seconds * 1000) : new Date();
  const dateStr = `${String(ds.getFullYear()).slice(2)}. ${ds.getMonth() + 1}. ${ds.getDate()}`;
  const manualMacroCalculatedKcal = calculateMacroCalories(manualMacroForm);
  const manualMacroCanSave = isValidNutritionInput(manualMacroForm) && hasManualMacroValues(manualMacroForm);
  const manualMacroSectionName = sections.find(sec => sec.id === manualMacroTarget?.secId)?.name || '식사';


  /* ── 화면 상태 ── */
  const [activeMeal, setActiveMeal] = useState(() => (DEFAULT_SECTIONS.some(sec => sec.id === initialMeal) ? initialMeal : defaultMealByTime()));
  const [mealMenuOpen, setMealMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [picked, setPicked] = useState([]); // 내 음식·식품 검색에서 고른 음식 [{ key, food }]
  const [foodFilter, setFoodFilter] = useState('');
  const [saveAsFood, setSaveAsFood] = useState(true); // 직접 입력한 값을 내 음식에도 저장할지
  const [leaving, setLeaving] = useState(null); // 'sheet' | 'view' — 닫히는 모션이 도는 동안
  const leaveTimerRef = useRef(null);
  const mealMenuRef = useRef(null);
  const plusRef = useRef(null);
  const inputBoxRef = useRef(null);
  useDismiss(mealMenuOpen, () => setMealMenuOpen(false), mealMenuRef);
  useDismiss(plusOpen, () => setPlusOpen(false), plusRef);
  useEffect(() => () => clearTimeout(leaveTimerRef.current), []);
  // 이 화면이 떠 있는 동안에는 폰 상단 바 색을 보라 헤더에 맞춘다 (닫히면 홈이 다시 자기 색으로 맞춘다)
  useEffect(() => {
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    metas.forEach(meta => meta.setAttribute('content', '#7171FF'));
    return () => metas.forEach(meta => meta.setAttribute('content', '#ffffff'));
  }, []);

  // 새로 넣을 때는 내 음식 저장을 기본으로 켜고, 이미 넣은 기록을 고칠 때는 끈다
  useEffect(() => {
    if (manualMacroTarget) setSaveAsFood(!manualMacroTarget.itemId);
  }, [manualMacroTarget]);

  function handleManualDone() {
    const name = manualMacroForm.name.trim();
    if (saveAsFood && name) {
      upsertCustomFood({
        name,
        kcal: Number(manualMacroForm.kcal) > 0 ? manualMacroForm.kcal : manualMacroCalculatedKcal,
        carb: manualMacroForm.carb,
        protein: manualMacroForm.protein,
        fat: manualMacroForm.fat,
      });
    }
    handleSaveManualMacro();
  }

  // 닫히는 모션을 끝까지 보여준 뒤에 상태를 바꾼다
  function leave(kind, done) {
    if (leaveTimerRef.current) return;
    setLeaving(kind);
    leaveTimerRef.current = setTimeout(() => {
      leaveTimerRef.current = null;
      done();
      setLeaving(null);
    }, 200);
  }
  const closeEdit = () => leave('sheet', () => setEditTarget(null));
  const closeMore = () => leave('sheet', () => setMoreSheetOpen(false));
  const resetSearch = () => { handleCloseSearchModal(); setSearchQuery(''); setPicked([]); };
  const resetFoodList = () => { setFoodListOpen(false); setFoodFilter(''); setPicked([]); };
  const closeSearch = () => leave('view', resetSearch);
  const closeFoodList = () => leave('view', resetFoodList);
  const closeManual = () => leave('view', handleCloseManualMacro);

  function closeTopLayer() {
    if (editTarget) { closeEdit(); return true; }
    if (moreSheetOpen) { closeMore(); return true; }
    if (manualMacroTarget) { closeManual(); return true; }
    if (searchModal) { closeSearch(); return true; }
    if (foodListOpen) { closeFoodList(); return true; }
    return false;
  }

  function handleAddFoods(secId, foods) {
    const freshId = () => Math.random().toString(36).slice(2, 11);
    const manual = foods.filter(food => food.entryType === 'manualMacros').map(food => ({ ...food, id: freshId() }));
    const items = foods
      .filter(food => food.entryType !== 'manualMacros')
      .map(food => ensureFoodPortion({ ...applyCustomFood(food, customFoods), id: freshId() }));
    setSections(prev => prev.map(sec =>
      sec.id === secId ? { ...sec, items: [...mergeFoodPortionItems(sec.items || [], items), ...manual] } : sec
    ));
    if (items.length > 0) setRecentFoods(prev => pushRecent(uid, items, prev));
  }

  function togglePicked(key, food) {
    setPicked(prev => (prev.some(p => p.key === key) ? prev.filter(p => p.key !== key) : [...prev, { key, food }]));
  }

  function runSearch() {
    setPicked([]);
    handleFoodSearch();
  }

  const meal = sections.find(sec => sec.id === activeMeal) || sections[0];
  const mealItems = meal.items || [];
  const mealTotals = getItemsTotal(mealItems);
  const inputValue = aiInputs[meal.id] || '';
  const analyzing = analyzingIds.current.has(meal.id);
  const tip = getMealTip(mealItems, profile, meal.id, goalKcal);
  const totalItems = sections.reduce((count, sec) => count + (sec.items || []).length, 0);
  const typing = inputFocused || Boolean(inputValue.trim());
  const chips = !typing ? [] : inputValue.trim() ? getRecentMatches(inputValue, foodSuggestions) : getMealPatternFoods(meal.id, allDietLogs);
  const showPlus = typing || mealItems.length > 0 || plusOpen;
  // 빈 끼니에서는 입력창이 먼저 보이게 저장 버튼을 숨긴다 (저장할 게 생기면 나타난다)
  const showSave = mealItems.length > 0 || hasUnsavedChanges();
  const examples = MEAL_EXAMPLES[meal.id] || SNACK_EXAMPLES;
  const previous = useMemo(() => findPreviousMeal(allDietLogs, activeMeal, ds), [allDietLogs, activeMeal]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickedTotals = getItemsTotal(picked.map(p => p.food));
  const filteredFoods = foodFilter.trim()
    ? foodSuggestions.filter(food => String(food.name || '').toLowerCase().includes(foodFilter.trim().toLowerCase()))
    : foodSuggestions;
  const shownFoods = filteredFoods.slice(0, 50);
  const searchRows = searchResult ? [searchResult] : searchResults;
  const searchBadge = source => ({ mfds: '식약처', custom: '내 기준', standard: '기준값' }[source || 'mfds'] || 'AI 추정');
  const editItem = editTarget
    ? (sections.find(sec => sec.id === editTarget.secId)?.items || []).find(item => item.id === editTarget.itemId)
    : null;
  const editPortion = editItem ? ensureFoodPortion(editItem).portion : null;
  const sheetLeaving = leaving === 'sheet';
  // 하위 화면이 겹쳐 있으면 맨 위 화면만 나가는 모션을 탄다
  const viewClass = top => `absolute inset-0 z-40 ${leaving === 'view' && top ? 'diet-view-out' : 'diet-view-in'}`;
  const keepFocus = e => e.preventDefault(); // 누르는 동안 입력창 포커스(키보드)를 지킨다

  // 예시 문장을 누르면 입력창에 채우고 바로 고칠 수 있게 커서를 둔다
  function fillExample(text) {
    setAiInputs(prev => ({ ...prev, [meal.id]: text }));
    inputBoxRef.current?.querySelector('textarea')?.focus();
  }

  function handleEditDone() {
    const changed = editItem && (
      editForm.name !== editItem.name
      || ['kcal', 'carb', 'protein', 'fat'].some(field => Number(editForm[field]) !== Number(editItem[field]))
    );
    leave('sheet', changed ? handleSaveEdit : () => setEditTarget(null));
  }

  const CARD = 'bg-white rounded-[18px]';
  const LABEL = 'font-semibold text-[12px] leading-[14px] text-[#868e96]';
  const pickHeaderTitle = text => <h1 className="m-0 font-bold text-[18px] leading-5 text-white">{text}</h1>;

  return (
    <div className="relative h-full overflow-hidden font-pretendard tracking-[-0.025em]">
      <ConfirmModal
        isOpen={showExitModal}
        title="작성 중인 기록이 있어요"
        subtitle="지금 나가면 저장하지 않은 내용은 사라져요."
        confirmText="계속하기"
        cancelText="그냥 나가기"
        onConfirm={() => setShowExitModal(false)}
        onCancel={discardAndLeave}
        onDismiss={() => setShowExitModal(false)}
      />

      {/* ①②③ 끼니 화면 */}
      <ScreenFrame
        header={(
          <ViewHeader
            onBack={handleBackClick}
            title={(
              <div ref={mealMenuRef} className="relative">
                <button type="button" onClick={() => setMealMenuOpen(open => !open)} aria-expanded={mealMenuOpen} aria-label="끼니 바꾸기" className="flex items-center gap-1 h-7 active:opacity-60">
                  <span className="font-semibold text-[18px] leading-[22px] text-white">{meal.name}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={`diet-turn ${mealMenuOpen ? 'rotate-180' : ''}`}>
                    <path d="M3.5 5.5L7 9l3.5-3.5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {mealMenuOpen && (
                  <div className="diet-pop absolute left-1/2 top-[calc(100%+8px)] -ml-[100px] w-[200px] bg-white rounded-2xl p-1.5 shadow-[0_8px_28px_rgba(3,27,38,0.18)]" style={{ transformOrigin: 'top center' }}>
                    {sections.map(sec => {
                      const kcal = getItemsTotal(sec.items).kcal;
                      const current = sec.id === meal.id;
                      return (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => { setActiveMeal(sec.id); setMealMenuOpen(false); }}
                          className="w-full flex items-center justify-between px-3 py-[11px] rounded-[10px] active:bg-[#f1f3f5]"
                        >
                          <span className={`font-semibold text-[14px] leading-[17px] ${current ? 'text-[#7171ff]' : 'text-[#171a1d]'}`}>{sec.name}</span>
                          <span className={`text-[11px] leading-[13px] ${current ? 'text-[#7171ff]' : 'text-[#868e96]'}`}>{kcal > 0 ? `${comma(kcal)}kcal` : '기록 없음'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            right={(
              <button type="button" onClick={() => { setMoreSheetOpen(true); setEditingGoal(false); }} aria-label="더보기" className="w-10 h-7 flex items-center justify-center font-bold text-[14px] leading-none text-[rgba(255,255,255,0.85)] active:opacity-60">
                •••
              </button>
            )}
          />
        )}
        footer={(
          <div className="bg-white rounded-t-[20px] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-4 pt-3 flex flex-col gap-3" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
            {chips.length > 0 && (
              <div data-no-pull className="diet-fade-in flex gap-1.5 overflow-x-auto -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
                {chips.map(food => (
                  <button
                    key={food.name}
                    type="button"
                    onPointerDown={keepFocus}
                    onClick={() => handleAddRecentFood(meal.id, food)}
                    className="flex-none px-3 py-2 rounded-xl bg-[#f1f3f5] font-medium text-[13px] leading-4 text-[#171a1d] whitespace-nowrap active:bg-[#e9ecef]"
                  >
                    {food.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end">
              <div ref={plusRef} className={`diet-plus relative flex-none h-[52px] flex items-center ${showPlus ? 'w-10 mr-2 opacity-100' : 'w-0 mr-0 opacity-0 pointer-events-none'}`}>
                <button
                  type="button"
                  onPointerDown={keepFocus}
                  onClick={() => {
                    // 팝업을 여닫을 때는 키보드를 내린다 (키보드는 적을 때만)
                    document.activeElement?.blur?.();
                    setPlusOpen(open => !open);
                  }}
                  aria-expanded={plusOpen}
                  aria-label="다른 방법으로 넣기"
                  tabIndex={showPlus ? 0 : -1}
                  className="w-10 h-10 rounded-full bg-[#f1f3f5] flex items-center justify-center active:bg-[#e9ecef]"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={`diet-turn ${plusOpen ? 'rotate-45' : ''}`}>
                    <path d="M8 2.5v11M2.5 8h11" stroke="#495057" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
                {/* ⑤ ＋ 팝업 */}
                {plusOpen && (
                  <div className="diet-pop-up absolute left-0 bottom-[calc(100%+8px)] w-[240px] bg-white rounded-2xl p-1.5 shadow-[0_8px_28px_rgba(3,27,38,0.18)] z-30" style={{ transformOrigin: 'bottom left' }}>
                    {[
                      ['내 음식', '저장된 음식에서 고르기', () => setFoodListOpen(true)],
                      ['식품 검색', '식약처 자료에서 정확한 값 찾기', () => handleOpenSearchModal(meal.id, inputValue)],
                      ['영양정보 직접 입력', '포장지 숫자 그대로 · 내 음식에도 저장', () => handleOpenManualMacro(meal.id)],
                    ].map(([title, desc, open]) => (
                      <button
                        key={title}
                        type="button"
                        onClick={() => { setPlusOpen(false); setPicked([]); open(); }}
                        className="w-full flex flex-col gap-0.5 px-3 py-[11px] rounded-[10px] text-left active:bg-[#f1f3f5]"
                      >
                        <span className="font-semibold text-[14px] leading-[17px] text-[#171a1d]">{title}</span>
                        <span className="text-[11px] leading-[13px] text-[#868e96]">{desc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* 입력창: 흰 바탕 + 브랜드 그라데이션 테두리, 높이 52 */}
              <div ref={inputBoxRef} className={`diet-input flex-1 min-w-0 rounded-[18px] p-px ${inputFocused ? 'is-focused' : ''}`} style={{ background: 'linear-gradient(90deg, #7171ff, #f79fff)' }}>
              <div className="flex items-end gap-1 rounded-[17px] bg-white pl-4 pr-2 py-[7px]">
                <AutoTextarea
                  value={inputValue}
                  onChange={e => setAiInputs(prev => ({ ...prev, [meal.id]: e.target.value }))}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder="예: 제육덮밥이랑 콜라"
                  className="flex-1 min-w-0 max-h-[100px] py-2 bg-transparent border-none outline-none font-pretendard text-[15px] leading-5 tracking-[-0.025em] text-[#171a1d] placeholder:text-[#adb5bd]"
                />
                <button
                  type="button"
                  onPointerDown={keepFocus}
                  onClick={() => handleAIAnalyze(meal.id)}
                  disabled={analyzing || !inputValue.trim()}
                  aria-label={`${meal.name} 식단 AI 분석`}
                  className="flex-none w-9 h-9 flex items-center justify-center rounded-full transition-opacity disabled:opacity-35 active:opacity-60"
                >
                  {analyzing
                    ? <span className="w-4 h-4 border-2 border-[#c509d6]/30 border-t-[#228bed] rounded-full animate-spin" />
                    : <IcSpark active={typing && Boolean(inputValue.trim())} />}
                </button>
              </div>
              </div>
            </div>
            {showSave && (
              <Pressable
                pressScale={0.97}
                onClick={handleSaveClick}
                disabled={saving}
                className="w-full h-12 rounded-[14px] bg-[#7171ff] font-pretendard font-bold text-[15px] text-white disabled:opacity-40"
              >
                기록 완료
              </Pressable>
            )}
          </div>
        )}
      >
        <div className="flex flex-col min-h-full px-4 pt-4 pb-6" style={{ gap: mealItems.length > 0 ? 10 : 16 }}>
          <IntakeSummary totals={totals} target={goalKcal} added={mealTotals} />
          {mealItems.length === 0 ? (
            <>
              {/* 빈 끼니 (Figma 1173:9581): 추천은 카드 없이 바탕에, 질문 묶음은 아래 입력 영역 가까이에 */}
              <div key={meal.id} className="stagger-in flex flex-col gap-2">
                {previous && (
                  <div className="relative px-4 py-3 flex items-center gap-3">
                    <FadeLine at="bottom" />
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-[11px] leading-[13px] text-[#495057]">{previous.label} {meal.name} 그대로</span>
                        <span className="font-bold text-[15px] leading-[18px] text-[#343a40]">{comma(previous.kcal)}kcal</span>
                      </div>
                      <span className="truncate text-[12px] leading-[14px] text-[#868e96]">{previous.items.map(item => getPortionDisplayName(item.name)).join(', ')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddFoods(meal.id, previous.items)}
                      className="flex-none rounded-full bg-[rgba(113,113,255,0.1)] shadow-[0_2px_6px_rgba(3,27,38,0.05)] px-[14px] py-2 font-bold text-[13px] leading-4 text-[#7171ff] active:opacity-60"
                    >
                      넣기
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  {[
                    ['내 음식에서 고르기', foodSuggestions.length > 0 ? foodSuggestions.slice(0, 4).map(food => food.name).join(' · ') : '저장된 음식이 없어요', () => { setPicked([]); setFoodListOpen(true); }],
                    ['새 음식 등록', '자주 먹는 음식 저장해 두기', () => handleOpenManualMacro(meal.id)],
                  ].map(([label, desc, run], index) => (
                    <button key={label} type="button" onClick={run} className="relative flex-1 min-w-0 px-4 py-3 flex items-center gap-2 text-left active:opacity-60">
                      {index === 0 && <FadeLine at="right" />}
                      <span className="flex-1 min-w-0 flex flex-col gap-3">
                        <span className="font-semibold text-[11px] leading-[13px] text-[#495057]">{label}</span>
                        <span className="truncate text-[12px] leading-[14px] text-[#868e96]">{desc}</span>
                      </span>
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
                        <path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="#adb5bd" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
              <p className="m-0 pt-1.5 text-center text-[12px] leading-[14px] text-[#adb5bd]">또는 아래에 편하게 적어주세요</p>
              <div className="flex-1 flex flex-col items-center justify-end gap-4 pt-6 pb-2 text-center">
                <div className="flex flex-col gap-2 text-[#495057]">
                  <p className="m-0 font-bold text-[15px] leading-[18px]">{meal.name}에 뭐 드셨어요?</p>
                  <p className="m-0 text-[14px] leading-[17px]">말하듯 적으면 AI가 칼로리와 탄단지를 정리해드려요</p>
                </div>
                <div className="flex flex-col items-center gap-[7px]">
                  {examples.map(text => (
                    <button key={text} type="button" onClick={() => fillExample(text)} className="p-3 rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.1)] text-[12px] leading-[14px] text-[#495057] whitespace-nowrap active:opacity-60">
                      “{text}"
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* 음식 목록 (Figma 1173:9759): 윗줄 이름·칼로리, 아랫줄 탄단지와 분량·수량 조절 */}
              <div className={`${CARD} px-4 py-1 shadow-[0_2px_12px_rgba(3,27,38,0.05)]`}>
                <div key={meal.id} className="stagger-in">
                  {mealItems.map((item, index) => {
                    const manual = isLooseManual(item);
                    const openItem = () => (manual ? handleOpenManualMacro(meal.id, item) : handleOpenEdit(meal.id, item));
                    return (
                      <div key={item.id} className="relative flex flex-col gap-4 py-3">
                        {index > 0 && <FadeLine />}
                        <button type="button" onClick={openItem} aria-label={`${getPortionDisplayName(item.name)} 고치기`} className="w-full flex items-center justify-between gap-3 text-left active:opacity-60">
                          <span className="min-w-0 truncate font-semibold text-[16px] leading-[19px] text-[#171a1d]">{getPortionDisplayName(item.name)}</span>
                          <span className="flex-none font-medium text-[14px] leading-[17px] text-[#7171ff]">{comma(item.kcal)}kcal</span>
                        </button>
                        <div className="flex items-center justify-between gap-3">
                          <button type="button" onClick={openItem} tabIndex={-1} className="min-w-0 flex flex-col gap-1 text-left active:opacity-60">
                            <span className="truncate font-medium text-[12px] leading-[14px] text-[#495057]">탄 {comma(item.carb)} 단 {comma(item.protein)} 지 {comma(item.fat)}</span>
                            <span className="truncate text-[11px] leading-[13px] text-[#adb5bd]">{manual ? '직접 입력' : describePortion(item)}</span>
                          </button>
                          {!manual && (
                            <PortionStepper
                              item={item}
                              onAdjust={direction => handleAdjustPortion(meal.id, item.id, direction)}
                              onSetAmount={amount => handleSetPortionAmount(meal.id, item.id, amount)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* 끼니 한줄평 (Figma 1196:6851): 로고가 붙은 흰 카드 */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-white">
                <img src="/logo-badge.svg" alt="" width="24" height="24" className="flex-none" />
                <p className="m-0 flex-1 min-w-0 text-[11px] leading-4 text-[#868e96]">
                  <span className="text-[#7171ff]">{meal.name} {comma(mealTotals.kcal)}kcal</span>
                  {tip ? ` · ${tip}` : ''}
                </p>
              </div>
            </>
          )}
        </div>
      </ScreenFrame>

      {/* ⑥ 내 음식 여러 개 고르기 */}
      {foodListOpen && (
        <div className={viewClass(!manualMacroTarget)}>
          <ScreenFrame
            header={<ViewHeader onBack={closeFoodList} title={pickHeaderTitle('내 음식')} />}
            footer={(
              <BottomBar
                label={picked.length > 0 ? `${picked.length}개 넣기` : '넣기'}
                disabled={picked.length === 0}
                onClick={() => leave('view', () => { handleAddFoods(meal.id, picked.map(p => p.food)); resetFoodList(); })}
              />
            )}
          >
            <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
              <IntakeSummary totals={addTotals(totals, pickedTotals)} target={goalKcal} added={addTotals(mealTotals, pickedTotals)} />
              <input
                value={foodFilter}
                onChange={e => setFoodFilter(e.target.value)}
                placeholder="음식 이름으로 찾기"
                className="w-full rounded-[14px] bg-[#f1f3f5] border-[1.5px] border-transparent px-[14px] py-[9.5px] outline-none font-pretendard text-[14px] leading-5 tracking-[-0.025em] text-[#171a1d] placeholder:text-[#adb5bd] transition-colors focus:bg-white focus:border-[#7171ff]"
              />
              {shownFoods.length > 0 ? (
                <div className={`${CARD} px-4 py-0.5`}>
                  <div className="stagger-in">
                    {shownFoods.map((food, index) => (
                      <FoodPickRow
                        key={food.name}
                        food={food}
                        first={index === 0}
                        selected={picked.some(p => p.key === food.name)}
                        onToggle={() => togglePicked(food.name, food)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="m-0 py-8 text-center text-[13px] leading-5 text-[#adb5bd]">
                  {foodSuggestions.length > 0 ? '찾는 이름의 음식이 없어요' : '아직 저장된 음식이 없어요'}
                </p>
              )}
              {filteredFoods.length > shownFoods.length && (
                <p className="m-0 text-center text-[12px] leading-[14px] text-[#adb5bd]">이름으로 찾으면 나머지 {filteredFoods.length - shownFoods.length}개도 볼 수 있어요</p>
              )}
              <button type="button" onClick={() => handleOpenManualMacro(meal.id)} className="self-center font-semibold text-[13px] leading-4 text-[#868e96] underline underline-offset-2 active:opacity-60">
                새 음식 직접 만들기
              </button>
            </div>
          </ScreenFrame>
        </div>
      )}

      {/* ⑦ 식품 검색 */}
      {searchModal && (
        <div className={viewClass(!manualMacroTarget)}>
          <ScreenFrame
            header={<ViewHeader onBack={closeSearch} title={pickHeaderTitle('식품 검색')} />}
            footer={(
              <BottomBar
                label={picked.length > 0 ? `${picked.length}개 넣기` : '넣기'}
                disabled={picked.length === 0}
                onClick={() => leave('view', () => { handleAddFoods(meal.id, picked.map(p => normalizeSearchItem(p.food))); resetSearch(); })}
              />
            )}
          >
            <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
              <IntakeSummary totals={addTotals(totals, pickedTotals)} target={goalKcal} added={addTotals(mealTotals, pickedTotals)} />
              <div className="flex items-center gap-1 rounded-[14px] bg-[#f1f3f5] border-[1.5px] border-transparent pl-[14px] pr-1.5 transition-colors focus-within:bg-white focus-within:border-[#7171ff]">
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runSearch()}
                  enterKeyHint="search"
                  placeholder="음식 이름으로 찾기"
                  className="flex-1 min-w-0 py-[9.5px] bg-transparent border-0 outline-none font-pretendard text-[14px] leading-5 tracking-[-0.025em] text-[#171a1d] placeholder:text-[#adb5bd]"
                />
                <button type="button" onClick={runSearch} disabled={searching || !searchQuery.trim()} aria-label="검색" className="flex-none w-8 h-8 flex items-center justify-center disabled:opacity-40 active:opacity-60">
                  {searching
                    ? <span className="w-4 h-4 border-2 border-[#7171ff]/30 border-t-[#7171ff] rounded-full animate-spin" />
                    : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="11" cy="11" r="7.5" stroke="#7171ff" strokeWidth="2" />
                        <path d="M20.5 20.5l-4-4" stroke="#7171ff" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                </button>
              </div>
              {searchRows.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="font-semibold text-[11px] leading-[13px] text-[#868e96]">검색 결과</span>
                    {!multiSearch && !searchResult && (
                      <button type="button" onClick={() => { setPicked([]); handleUseAiEstimate(); }} disabled={estimatingSearch} className="font-semibold text-[11px] leading-[13px] text-[#7171ff] disabled:opacity-40">
                        {estimatingSearch ? '추정 중...' : 'AI 추정값 사용'}
                      </button>
                    )}
                  </div>
                  <div className={`${CARD} px-4 py-0.5`}>
                    <div key={searchRows.map(food => food.name).join('|')} className="stagger-in">
                      {searchRows.map((food, index) => {
                        const key = `${food.name}-${food.kcal}-${food.carb}`;
                        return (
                          <FoodPickRow
                            key={key}
                            food={food}
                            first={index === 0}
                            badge={searchBadge(food.source)}
                            selected={picked.some(p => p.key === key)}
                            onToggle={() => togglePicked(key, food)}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <p className="m-0 pt-2 text-center text-[12px] leading-[14px] text-[#adb5bd]">넣은 뒤 음식을 눌러 양을 맞춰요</p>
                </div>
              ) : (
                <p className="m-0 py-8 text-center text-[13px] leading-5 text-[#adb5bd]">
                  {searching ? '찾고 있어요' : '식약처 자료에서 정확한 값을 찾아요'}
                </p>
              )}
            </div>
          </ScreenFrame>
        </div>
      )}

      {/* ⑧ 영양정보 직접 입력 */}
      {manualMacroTarget && (
        <div className={viewClass(true)}>
          <ScreenFrame
            header={(
              <ViewHeader
                onBack={closeManual}
                title={pickHeaderTitle('영양정보 직접 입력')}
                right={manualMacroTarget.itemId && (
                  <button type="button" onClick={() => leave('view', handleDeleteManualMacro)} className="h-7 px-1 font-semibold text-[14px] leading-none text-[rgba(255,255,255,0.85)] active:opacity-60">삭제</button>
                )}
              />
            )}
            footer={(
              <BottomBar
                label={manualMacroTarget.itemId ? '수정 완료' : '넣기'}
                disabled={!manualMacroCanSave}
                onClick={() => leave('view', handleManualDone)}
              />
            )}
          >
            <div className="px-4 pt-4 pb-6">
              <div className="bg-white rounded-2xl px-4 py-6 flex flex-col gap-8">
                <label className="flex flex-col gap-2">
                  <span className={LABEL}>음식 이름 <span className="text-[#7171ff]">•</span></span>
                  <input
                    value={manualMacroForm.name}
                    onChange={e => setManualMacroForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={`비우면 '${manualMacroSectionName} 직접 기록'`}
                    className="w-full pb-2 bg-transparent border-0 border-b border-[#e9ecef] outline-none font-pretendard font-semibold text-[14px] leading-5 tracking-[-0.025em] text-[#171a1d] placeholder:font-normal placeholder:text-[#adb5bd] transition-colors focus:border-[#7171ff]"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className={LABEL}>열량</span>
                  <span className="flex items-center gap-2 pb-2 border-b border-[#e9ecef] transition-colors focus-within:border-[#7171ff]">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={manualMacroForm.kcal}
                      onChange={e => setManualMacroForm(prev => ({ ...prev, kcal: e.target.value }))}
                      placeholder={manualMacroCalculatedKcal > 0 ? `비우면 탄단지로 계산한 ${comma(manualMacroCalculatedKcal)}` : '0'}
                      className="flex-1 min-w-0 p-0 bg-transparent border-0 outline-none font-pretendard font-semibold text-[14px] leading-5 tracking-[-0.025em] text-[#171a1d] placeholder:font-normal placeholder:text-[#adb5bd]"
                    />
                    <span className="flex-none font-medium text-[14px] leading-5 text-[#868e96]">kcal</span>
                  </span>
                </label>
                <div className="flex flex-col gap-2">
                  <span className={LABEL}>탄수화물 · 단백질 · 지방</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[['carb', '탄수화물'], ['protein', '단백질'], ['fat', '지방']].map(([field, label]) => (
                      <label key={field} className="flex items-center gap-1 rounded-xl bg-white border-[1.5px] border-[#e9ecef] px-3 py-[9.5px] transition-colors focus-within:border-[#7171ff]">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={manualMacroForm[field]}
                          onChange={e => setManualMacroForm(prev => ({ ...prev, [field]: e.target.value }))}
                          placeholder={label}
                          aria-label={label}
                          className="flex-1 min-w-0 p-0 bg-transparent border-0 outline-none font-pretendard font-semibold text-[14px] leading-5 tracking-[-0.025em] text-[#171a1d] placeholder:font-normal placeholder:text-[#adb5bd]"
                        />
                        <span className="flex-none font-medium text-[14px] leading-5 text-[#868e96]">g</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5 rounded-xl border-[1.5px] border-dashed border-[#ced4da] p-3 transition-colors focus-within:border-[#7171ff]">
                  <span className="font-bold text-[13px] leading-4 text-[#7171ff]">성분표 글자 붙여넣기</span>
                  <textarea
                    value={manualMacroForm.paste}
                    onChange={e => handleParseManualMacroPaste(e.target.value)}
                    rows={2}
                    placeholder={'"715kcal, 탄수 98g, 단백질 27g…" 처럼 붙이면 칸이 채워져요'}
                    className="w-full resize-none p-0 bg-transparent border-0 outline-none font-pretendard text-[12px] leading-[17px] tracking-[-0.025em] text-[#495057] placeholder:text-[#868e96]"
                  />
                </label>
                {(() => {
                  const named = Boolean(manualMacroForm.name.trim());
                  const on = saveAsFood && named;
                  return (
                    <button type="button" onClick={() => setSaveAsFood(value => !value)} disabled={!named} aria-pressed={on} className="flex items-center gap-3 text-left disabled:opacity-50">
                      <span className={`flex-none w-6 h-6 rounded-full flex items-center justify-center border-[1.5px] transition-colors ${on ? 'bg-[#7171ff] border-[#7171ff]' : 'bg-white border-[#dee2e6]'}`}>
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`diet-check ${on ? 'scale-100' : 'scale-0'}`}>
                          <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="font-semibold text-[14px] leading-[17px] text-[#171a1d]">내 음식에도 저장</span>
                        <span className="text-[12px] leading-[14px] text-[#868e96]">{named ? '다음부터 내 음식에서 바로 골라요' : '음식 이름을 적으면 저장할 수 있어요'}</span>
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>
          </ScreenFrame>
        </div>
      )}

      {/* ④ 고치기 시트 */}
      {editTarget && editItem && (
        <Sheet leaving={sheetLeaving} onClose={closeEdit}>
          <div className="flex items-center gap-3">
            <input
              value={editForm.name}
              onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
              aria-label="음식 이름"
              className="flex-1 min-w-0 p-0 bg-transparent border-0 outline-none font-pretendard font-bold text-[18px] leading-5 tracking-[-0.025em] text-[#171a1d]"
            />
            <button
              type="button"
              onClick={() => leave('sheet', () => { handleRemoveItem(editTarget.secId, editTarget.itemId); setEditTarget(null); })}
              className="flex-none font-semibold text-[13px] leading-4 text-[#868e96] active:opacity-60"
            >
              삭제
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[14px] leading-[17px] text-[#868e96]">단위 구분</span>
            <div className="flex p-[3px] rounded-[10px] bg-[#f1f3f5]">
              {[['count', '개수'], ['weight', 'g']].map(([mode, label]) => {
                const on = (editPortion.mode === 'count') === (mode === 'count');
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={!editPortion.gramsKnown}
                    onClick={() => { if (!on) handleSwitchPortionMode(editTarget.secId, editTarget.itemId); }}
                    aria-pressed={on}
                    className={`px-3 py-[5px] rounded-lg font-semibold text-[12px] leading-[14px] transition-colors duration-200 disabled:opacity-40 ${on ? 'bg-white text-[#171a1d] shadow-[0_1px_3px_rgba(3,27,38,0.08)]' : 'text-[#868e96]'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[11px] leading-[13px] text-[#868e96]">
              영양성분 · 눌러서 고치기{editPortion.gramsKnown ? '' : ' · 무게를 몰라 개수로만 조절해요'}
            </span>
            <NutritionBoxes form={editForm} onChange={(field, value) => setEditForm(prev => ({ ...prev, [field]: value }))} />
          </div>
          <SheetButton label="수정 완료" disabled={!String(editForm.name || '').trim() || !isValidNutritionInput(editForm)} onClick={handleEditDone} />
        </Sheet>
      )}

      {/* 더보기 시트 */}
      {moreSheetOpen && (
        <Sheet leaving={sheetLeaving} onClose={closeMore}>
          <div className="flex flex-col -my-2">
            <div className="py-[13px]">
              <button type="button" onClick={() => { setEditingGoal(open => !open); setGoalInput(String(goalKcal)); }} className="w-full flex items-center justify-between text-left active:opacity-60">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-[15px] leading-[18px] text-[#171a1d]">목표 칼로리 수정</span>
                  <span className="text-[12px] leading-[14px] text-[#868e96]">현재 {comma(goalKcal)}kcal</span>
                </span>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={`diet-turn ${editingGoal ? 'rotate-180' : ''}`}>
                  <path d="M4 6l4 4 4-4" fill="none" stroke="#adb5bd" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {editingGoal && (
                <div className="diet-fade-in flex items-center gap-2 mt-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={goalInput}
                    onChange={e => setGoalInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGoalSave()}
                    placeholder="목표 칼로리"
                    autoFocus
                    className="flex-1 min-w-0 rounded-xl bg-[#f8f9fa] border-[1.5px] border-transparent px-3 py-[9.5px] outline-none font-pretendard font-semibold text-[14px] leading-5 text-[#171a1d] transition-colors focus:bg-white focus:border-[#7171ff]"
                  />
                  <span className="font-medium text-[14px] text-[#868e96]">kcal</span>
                  <button type="button" onClick={handleGoalSave} className="rounded-xl bg-[#7171ff] px-4 py-[11px] font-bold text-[13px] leading-5 text-white active:opacity-80">확인</button>
                </div>
              )}
            </div>
            {[
              ['내 음식', `등록하거나 기록한 음식 ${foodSuggestions.length}개`, () => leave('sheet', () => { setMoreSheetOpen(false); setPicked([]); setFoodListOpen(true); }), false],
              ['클립보드 복사', '현재 식단 기록을 글자로 복사해요', handleMoreCopy, false],
              ['전체 초기화', '모든 끼니의 기록을 지우고 처음부터 시작해요', () => leave('sheet', handleMoreReset), true],
            ].map(([title, desc, run, danger]) => (
              <button key={title} type="button" onClick={run} className="relative w-full flex flex-col gap-0.5 py-[13px] text-left active:opacity-60">
                <FadeLine />
                <span className={`font-semibold text-[15px] leading-[18px] ${danger ? 'text-[#e03e52]' : 'text-[#171a1d]'}`}>{title}</span>
                <span className="text-[12px] leading-[14px] text-[#868e96]">{desc}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {saving && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/20">
          <div className="bg-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#7171FF]/30 border-t-[#7171FF] rounded-full animate-spin" />
            <span className="font-semibold text-[14px] text-[#171a1d]">저장 중...</span>
          </div>
        </div>
      )}

      <Toast show={manualMacroSavedToast} message="영양정보를 추가했어요" />
      <Toast show={draftRestored} message="작성 중이던 식단 기록을 복원했어요" />
    </div>
  );
}
