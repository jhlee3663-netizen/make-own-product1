import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where,
  orderBy, 
  limit, 
  getDocs,
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../lib/firebase";

/**
 * 운동 메모에서 총 볼륨을 계산합니다.
 */
export function calculateTotalVolume(sections) {
  let total = 0;
  sections.forEach(s => {
    (s.items || []).forEach(it => {
      const body = it.body || "";
      // Regular expression to match weight(kg) reps(회) sets(세트)
      const matches = body.match(/(\d+(?:\.\d+)?)\s*kg\s*(\d+)\s*회\s*(?:(\d+)\s*세트)?/gi);
      if (matches) {
        matches.forEach(m => {
          const parts = m.match(/(\d+(?:\.\d+)?)\s*kg\s*(\d+)\s*회\s*(?:(\d+)\s*세트)?/i);
          if (parts) {
            const weight = parseFloat(parts[1]);
            const reps = parseInt(parts[2]);
            const sets = parts[3] ? parseInt(parts[3]) : 1;
            total += weight * reps * sets;
          }
        });
      }
    });
  });
  return total;
}

/**
 * 특정 부위의 가장 최근 운동 볼륨을 가져옵니다. (성능 최적화: Firestore 쿼리 활용)
 */
export async function getLastWorkoutVolume(currentParts, excludeDocId = null) {
  if (!currentParts || currentParts.length === 0) return 0;

  // 1. 우선 모든 운동 기록을 최신순으로 가져옵니다 (필터링 성능 위해)
  // 팁: 나중에 데이터가 정말 많아지면 "parts"를 배열로 저장하고 array-contains-any 쿼리를 쓰는 것이 최고입니다.
  const q = query(
    collection(db, "logs"), 
    where("type", "==", "workout"),
    orderBy("timestamp", "desc"), 
    limit(20) // 최근 20개 정도면 충분히 이전 기록을 찾을 수 있습니다.
  );
  
  const querySnapshot = await getDocs(q);
  
  for (const d of querySnapshot.docs) {
    if (excludeDocId && d.id === excludeDocId) continue;
    const data = d.data();
    
    // 현재 작성 중인 부위 중 하나라도 포함되어 있는지 확인
    const hasMatch = currentParts.some(p => (data.title || "").includes(p));
    if (hasMatch && data.totalVolume) {
      return data.totalVolume;
    }
  }
  
  return 0;
}

/**
 * 운동 기록을 저장하거나 업데이트합니다.
 */
export async function saveWorkoutLog(sections, docId = null) {
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

  const totalVolume = calculateTotalVolume(sections);
  const currentParts = sections.map(s => s.part).filter(Boolean);
  
  // 이전 볼륨 조회
  const lastVolume = await getLastWorkoutVolume(currentParts, docId);
  
  let overloadMsg = "";
  if (lastVolume > 0) {
    const diff = totalVolume - lastVolume;
    const pct = ((diff / lastVolume) * 100).toFixed(1);
    overloadMsg = `오늘 볼륨 ${totalVolume.toLocaleString()}kg, 저번보다 ${Math.abs(pct)}% 과부하 ${diff >= 0 ? "성공" : "실패"}!`;
  } else {
    overloadMsg = `오늘 첫 기록 볼륨 ${totalVolume.toLocaleString()}kg 달성!`;
  }

  let finalDocRef;
  const logData = {
    title,
    exercises,
    originalText,
    sections: sectionsData,
    totalVolume,
    overloadMsg // 상태 비교 메시지도 함께 저장
  };

  if (docId) {
    const logDoc = doc(db, "logs", docId);
    await updateDoc(logDoc, logData);
    finalDocRef = logDoc;
  } else {
    const logCol = collection(db, "logs");
    const docRef = await addDoc(logCol, {
      ...logData,
      type: "workout",
      timestamp: serverTimestamp(),
    });
    finalDocRef = docRef;
  }

  return { docRef: finalDocRef, totalVolume, title, overloadMsg };
}

/**
 * 운동 기록을 삭제합니다.
 */
export async function deleteWorkoutLog(docId) {
  await deleteDoc(doc(db, "logs", docId));
}
