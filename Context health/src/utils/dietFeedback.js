export function getDietSummaryComment(totals, profile, goalKcal) {
  const kcal = Number(totals?.kcal || 0);
  if (kcal <= 0) return '식단이 기록되었습니다.';

  const weight = Number(profile?.weight) || 70;
  const kcalTarget = Number(goalKcal || profile?.targetKcal || 2500);
  const protein = Number(totals?.protein || 0);
  const carb = Number(totals?.carb || 0);
  const fat = Number(totals?.fat || 0);
  const proteinTarget = Math.round(weight * 1.6);
  const proteinGap = Math.max(0, proteinTarget - protein);
  const macroKcal = Math.max(1, carb * 4 + protein * 4 + fat * 9);
  const carbRatio = (carb * 4) / macroKcal;
  const proteinRatio = (protein * 4) / macroKcal;
  const fatRatio = (fat * 9) / macroKcal;
  const kcalRatio = kcal / kcalTarget;

  if (kcalRatio < 0.7) {
    if (carbRatio < 0.35) return '칼로리와 탄수화물이 부족해요';
    if (fatRatio < 0.15) return '칼로리와 지방이 조금 낮아요';
    return '아직 총 섭취량이 부족해요';
  }
  if (kcal > kcalTarget * 1.1) {
    if (fatRatio > 0.35) return '칼로리와 지방 비중이 높아요';
    if (carbRatio > 0.6) return '칼로리와 탄수 비중이 높아요';
    return '목표 칼로리를 조금 넘었어요';
  }
  if (fatRatio > 0.38) return '지방 비율이 높아요';
  if (carbRatio > 0.65) return '탄수 비중이 높아요';
  if (proteinGap > 0 && protein < proteinTarget * 0.7 && proteinRatio < 0.16) {
    return `단백질은 ${proteinGap}g 정도 보완하면 좋아요`;
  }
  if (proteinRatio >= 0.18 && fatRatio >= 0.18 && fatRatio <= 0.32 && carbRatio >= 0.35 && carbRatio <= 0.6) {
    return '탄단지 균형이 좋아요';
  }
  return '오늘 식단 흐름은 괜찮아요';
}
