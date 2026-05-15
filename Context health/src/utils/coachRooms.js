export const STATIC_COACH_ROOM_IDS = ['powerbuilding', 'dumbbell', 'diet', 'mobility', 'routine'];

export const COACH_ROOM_LOOKS = {
  powerbuilding: { name: '스트렝스 멘토', emoji: '🏋️‍♂️', bg: '#EAF0FF', subtitle: '스트렝스 & 근비대 상담' },
  dumbbell: { name: '덤벨 마스터', emoji: '💪', bg: '#FFF0F5', subtitle: '덤벨 및 홈트 상담' },
  diet: { name: '식단 관리사', emoji: '🥗', bg: '#F0FDF4', subtitle: '식단과 영양 상담' },
  mobility: { name: '스트레칭 코치', emoji: '🧘‍♂️', bg: '#FEF3C7', subtitle: '모빌리티와 통증 상담' },
  routine: { name: '루틴 설계사', emoji: '📅', bg: '#F3E8FF', subtitle: '운동 루틴 상담' },
  general: { name: 'AI 코치', emoji: '✨', bg: '#EEF2FF', subtitle: '종합 상담' },
};

const CATEGORY_RULES = [
  { type: 'diet', pattern: /식단|음식|칼로리|단백질|탄수|탄단지|지방|다이어트|감량|증량식|간식|아침|점심|저녁|식사|영양|배고|폭식|야식/ },
  { type: 'dumbbell', pattern: /덤벨|아령|홈트|컬|프레스|레이즈|킥백|플라이/ },
  { type: 'mobility', pattern: /스트레칭|모빌리티|가동성|통증|부상|워밍업|쿨다운|어깨|허리|무릎|목|손목|발목/ },
  { type: 'routine', pattern: /루틴|분할|스케줄|주\s*\d|운동\s*순서|프로그램|계획|짜줘|플랜/ },
  { type: 'powerbuilding', pattern: /파워빌딩|벤치|스쿼트|데드|중량|과부하|1rm|스트렝스|근비대|볼륨|세트|반복|증량/ },
];

const CASUAL_PATTERN = /^(안녕|하이|hello|hi|테스트|잘\s*들리|들리니|뭐해|누구야|시작|ㅎㅇ|반가워)[\s!?~.。]*$/i;

export function classifyCoachPrompt(text) {
  const value = String(text || '').trim().toLowerCase();
  if (!value || CASUAL_PATTERN.test(value)) return { type: 'general', isMixed: false, isCasual: true };

  const hits = CATEGORY_RULES.filter(rule => rule.pattern.test(value)).map(rule => rule.type);
  const unique = [...new Set(hits)];
  if (unique.length === 0) return { type: 'general', isMixed: false, isCasual: true };
  if (unique.length > 1) return { type: 'general', isMixed: true, isCasual: false, topics: unique };
  return { type: unique[0], isMixed: false, isCasual: false };
}

export function makeCoachRoomTitle(text, classification) {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  if (classification?.isCasual) return 'AI 코치와 대화';
  if (classification?.isMixed) return '종합 코칭 상담';

  if (/10\s*kg|10키로|십\s*키로/.test(value) && /감량|다이어트|빼/.test(value)) return '10kg 감량 플랜';
  if (/식단|칼로리|단백질|탄단지|음식|식사/.test(value)) return '식단 관리 상담';
  if (/루틴|분할|스케줄|프로그램|계획/.test(value)) return '운동 루틴 상담';
  if (/덤벨|홈트|아령/.test(value)) return '덤벨 운동 상담';
  if (/통증|스트레칭|모빌리티|부상/.test(value)) return '컨디션 관리 상담';
  if (/벤치|스쿼트|데드|중량|과부하|1rm|볼륨/.test(value)) return '스트렝스 상담';

  return value.length > 18 ? `${value.slice(0, 18)}...` : value || 'AI 코치와 대화';
}

export function createDynamicCoachRoomMeta(firstMessage) {
  const classification = classifyCoachPrompt(firstMessage);
  const look = COACH_ROOM_LOOKS[classification.type] || COACH_ROOM_LOOKS.general;
  const now = Date.now();
  return {
    id: `chat_${now}_${Math.random().toString(36).slice(2, 7)}`,
    type: classification.type,
    title: makeCoachRoomTitle(firstMessage, classification),
    subtitle: classification.isMixed ? '여러 주제를 함께 다루는 상담' : look.subtitle,
    emoji: look.emoji,
    bg: look.bg,
    createdAt: now,
    updatedAt: now,
    isDynamic: true,
  };
}

export function refineDynamicCoachRoomMeta(meta, text) {
  if (!meta?.isDynamic || meta.type !== 'general') return meta;
  const classification = classifyCoachPrompt(text);
  if (classification.type === 'general') return meta;
  const look = COACH_ROOM_LOOKS[classification.type] || COACH_ROOM_LOOKS.general;
  return {
    ...meta,
    type: classification.type,
    title: makeCoachRoomTitle(text, classification),
    subtitle: classification.isMixed ? '여러 주제를 함께 다루는 상담' : look.subtitle,
    emoji: look.emoji,
    bg: look.bg,
    updatedAt: Date.now(),
  };
}
