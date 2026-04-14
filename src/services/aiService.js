const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

/**
 * AI를 사용하여 운동 메모를 정갈하게 정리합니다.
 */
export async function summarizeWorkout(sections) {
  const rawText = sections.map(s => `부위: ${s.part}\n${s.items.map(i => `- 종목: ${i.title}\n  기록: ${i.body}`).join('\n')}`).join('\n\n');
  
  const prompt = `다음 사용자의 거친 운동 메모 데이터를 보기 좋게 정리해서 JSON 배열로 반환해줘.
응답 형식: [{ "part": "운동부위", "items": [{ "title": "운동종목", "body": "• 세트 1: 20kg 15회\\n• 세트 2: 40kg 20회" }] }]
중요 규칙:
1. 각 세트별 기록은 반드시 '• 세트 N: 무게 횟수' 형태로 작성해줘.
2. 여러 세트인 경우 쉼표(,) 대신 반드시 줄바꿈(\\n)으로 구분해서 작성해줘.
3. [가장 중요] 세트 번호(N)는 종목이 바뀌더라도 절대 1부터 다시 시작하지 말고, 이전 종목의 마지막 세트 번호에 이어서 전체 누적으로 계속 카운트해줘. (예: 앞 종목이 3세트에서 끝났으면 다음 종목은 세트 4부터 시작)
4. JSON 이외의 다른 텍스트(마크다운 등)는 절대 포함하지 마. 원본을 잘 파악해서 깔끔하게 정리해.

사용자 입력:
${rawText}`;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    if (!json.candidates || !json.candidates[0]) throw new Error("AI 응답 실패");
    
    const text = json.candidates[0].content.parts[0].text;
    const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("summarizeWorkout error:", error);
    throw error;
  }
}

/**
 * 운동 결과에 따른 동기부여 한줄평을 생성합니다.
 */
export async function generateAIComment(workoutSummary, overloadMsg) {
  const prompt = `운동 기록을 분석해서 동기부여가 되는 한줄평을 써줘. 
필수 포함 문구: "${overloadMsg}"
규칙: 
1. 반드시 저 문구가 제일 앞에 나오게 해.
2. 30자 이내로 짧고 강렬하게 한국어로 써.
3. 순수 텍스트만 반환해.
정보: ${workoutSummary}`;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const json = await res.json();
    if (json.candidates && json.candidates[0]) {
      return json.candidates[0].content.parts[0].text.trim();
    }
    return null;
  } catch (error) {
    console.error("generateAIComment error:", error);
    return null;
  }
}
