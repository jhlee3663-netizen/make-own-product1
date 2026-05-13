export function getDietSummaryComment(totals, profile, goalKcal) {
  const kcal = Number(totals?.kcal || 0);
  if (kcal <= 0) return '식단이 기록되었습니다.';

  const weight = Number(profile?.weight) || 70;
  const kcalTarget = Number(goalKcal || profile?.targetKcal || 2500);
  const protein = Number(totals?.protein || 0);
  const carb = Number(totals?.carb || 0);
  const fat = Number(totals?.fat || 0);
  const proteinTarget = Math.round(weight * 1.8);
  const proteinGap = Math.max(0, proteinTarget - protein);
  const carbRatio = (carb * 4) / kcal;
  const proteinRatio = (protein * 4) / kcal;
  const fatRatio = (fat * 9) / kcal;

  if (proteinGap > 0 && protein < proteinTarget * 0.85) {
    return `단백질 ${proteinGap}g 부족해요 💪`;
  }
  if (kcal > kcalTarget * 1.1) {
    if (fatRatio > 0.35) return '칼로리·지방이 높아요 😅';
    if (carbRatio > 0.6) return '칼로리·탄수 비중이 높아요 🍚';
    return '칼로리는 초과, 단백질은 충분해요';
  }
  if (fatRatio > 0.35) return '지방 비율이 높아요 🥗';
  if (carbRatio > 0.65 && proteinRatio < 0.2) return '탄수 비중이 높아요 🍚';
  if (proteinRatio >= 0.18 && fatRatio >= 0.18 && fatRatio <= 0.32 && carbRatio >= 0.35 && carbRatio <= 0.6) {
    return '탄단지 균형이 좋아요 👍';
  }
  return '오늘 식단 흐름 좋아요 👍';
}
