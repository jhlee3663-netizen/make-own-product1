# QA 코드 증거 스냅샷

2026-09-07 현재 작업 트리. 비밀값·실사용자 데이터 제외. 코드 변경 없음.

## src/App.jsx:19-65

```text
19: /* ── 프로필 localStorage 유틸 ── */
20: function loadProfile() {
21:   try { return JSON.parse(localStorage.getItem('user_profile')) || null; } catch { return null; }
22: }
23: function saveProfile(p) { localStorage.setItem('user_profile', JSON.stringify(p)); }
24: 
25: /* ── 코치 메시지 localStorage 유틸 ── */
26: function loadCoachRooms() {
27:   try {
28:     const parse = (key) => {
29:       const raw = localStorage.getItem(key);
30:       if (!raw) return null;
31:       return JSON.parse(raw).map(m => ({ ...m, timestamp: m.timestamp ? new Date(m.timestamp) : undefined }));
32:     };
33:     const result = {};
34:     STATIC_COACH_ROOM_IDS.forEach(roomId => { result[roomId] = parse(`coach_msgs_${roomId}`); });
35:     for (let i = 0; i < localStorage.length; i += 1) {
36:       const key = localStorage.key(i);
37:       if (!key?.startsWith('coach_msgs_chat_')) continue;
38:       result[key.replace('coach_msgs_', '')] = parse(key);
39:     }
40:     return result;
41:   } catch { return {}; }
42: }
43: 
44: function loadCoachRoomMeta() {
45:   try {
46:     const result = {};
47:     for (let i = 0; i < localStorage.length; i += 1) {
48:       const key = localStorage.key(i);
49:       if (!key?.startsWith('coach_room_meta_')) continue;
50:       const meta = JSON.parse(localStorage.getItem(key));
51:       if (meta?.id) result[meta.id] = meta;
52:     }
53:     return result;
54:   } catch { return {}; }
55: }
56: 
57: function saveCoachRoomMeta(meta) {
58:   if (!meta?.id) return;
59:   try { localStorage.setItem(`coach_room_meta_${meta.id}`, JSON.stringify(meta)); } catch {}
60: }
61: 
62: /* ── AI 목표 localStorage 유틸 ── */
63: function loadAiGoals() {
64:   try { return JSON.parse(localStorage.getItem('ai_goals')) || []; } catch { return []; }
65: }
```

## src/App.jsx:170-235

```text
170:       if (!active) return;
171:       setUser(current => current === undefined ? null : current);
172:       setUserDataReady(true);
173:     }, 8000);
174:     const unsub = onAuthStateChanged(auth, async (fu) => {
175:       setUserDataReady(false);
176:       if (!fu) {
177:         window.clearTimeout(authTimeout);
178:         localStorage.removeItem('auth_user');
179:         if (active) {
180:           setUser(null);
181:           setUserDataReady(true);
182:         }
183:         return;
184:       }
185: 
186:       let storedUser = null;
187:       try {
188:         storedUser = JSON.parse(localStorage.getItem('auth_user') || 'null');
189:       } catch {}
190: 
191:       // 기존 Kakao/Naver 익명 세션은 저장 정보를 지우지 않고 로그인 화면으로 보낸다.
192:       // 재로그인 시 Google은 계정 연결, Kakao/Naver는 서버 이전으로 기존 데이터를 보존한다.
193:       if (fu.isAnonymous) {
194:         window.clearTimeout(authTimeout);
195:         if (active) {
196:           setUser(null);
197:           setUserDataReady(true);
198:         }
199:         return;
200:       }
201: 
202:       try {
203:         const tokenResult = await fu.getIdTokenResult();
204:         if (!active) return;
205:         window.clearTimeout(authTimeout);
206:         const claimedProvider = tokenResult.claims.socialProvider;
207:         const provider = claimedProvider
208:           || (fu.providerData.some(item => item.providerId === 'google.com') ? 'google'
209:           : fu.providerData.some(item => item.providerId === 'apple.com') ? 'apple'
210:           : 'unknown');
211:         const sameStoredUser = storedUser?.uid === fu.uid ? storedUser : null;
212: 
213:         if (storedUser?.uid && storedUser.uid !== fu.uid) {
214:           localStorage.removeItem('user_profile');
215:           localStorage.removeItem('onboarding_completed');
216:           localStorage.removeItem('ai_goals');
217:         }
218: 
219:         const nextUser = {
220:           uid: fu.uid,
221:           name: fu.displayName || sameStoredUser?.name || '사용자',
222:           email: fu.email || tokenResult.claims.socialEmail || sameStoredUser?.email || '',
223:           photo: fu.photoURL || sameStoredUser?.photo || '',
224:           provider,
225:         };
226:         localStorage.setItem('auth_user', JSON.stringify(nextUser));
227:         setUser(nextUser);
228:       } catch (error) {
229:         window.clearTimeout(authTimeout);
230:         console.error('[Auth state]', error);
231:         if (active) {
232:           localStorage.removeItem('auth_user');
233:           setUser(null);
234:           setUserDataReady(true);
235:         }
```

## src/App.jsx:282-347

```text
282:   /* ── Firestore 동기화 (로그인 후 1회) ── */
283:   useEffect(() => {
284:     if (!user?.uid) {
285:       if (user !== undefined) setUserDataReady(true);
286:       return;
287:     }
288:     let cancelled = false;
289:     async function sync() {
290:       setUserDataReady(false);
291:       const [userData, fsRooms] = await Promise.all([
292:         loadUserData(user.uid),
293:         loadAllCoachRooms(user.uid),
294:       ]);
295:       if (cancelled) return;
296:       if (userData?.profile) {
297:         saveProfile(userData.profile);
298:         setProfile(userData.profile);
299:       } else {
300:         localStorage.removeItem('user_profile');
301:         setProfile(null);
302:       }
303:       if (userData?.onboardingDone || userData?.profile) {
304:         localStorage.setItem('onboarding_completed', '1');
305:         setOnboardingDone(true);
306:         if (!userData?.onboardingDone) {
307:           saveUserData(user.uid, { onboardingDone: true }).catch(() => {});
308:         }
309:       }
310:       if (userData?.goals) {
311:         localStorage.setItem('ai_goals', JSON.stringify(userData.goals));
312:         setAiGoals(userData.goals);
313:       }
314:       setCoachRooms(prev => {
315:         const next = { ...prev };
316:         const nextMeta = {};
317:         for (const [roomId, value] of Object.entries(fsRooms)) {
318:           const data = Array.isArray(value) ? { messages: value, meta: null } : value;
319:           if (data?.messages) {
320:             next[roomId] = data.messages;
321:             try { localStorage.setItem(`coach_msgs_${roomId}`, JSON.stringify(data.messages)); } catch {}
322:           }
323:           if (data?.meta?.id) {
324:             nextMeta[roomId] = data.meta;
325:             saveCoachRoomMeta(data.meta);
326:           }
327:         }
328:         if (Object.keys(nextMeta).length) setCoachRoomMeta(prevMeta => ({ ...prevMeta, ...nextMeta }));
329:         return next;
330:       });
331:     }
332:     sync().catch(() => {}).finally(() => {
333:       if (!cancelled) setUserDataReady(true);
334:     });
335:     return () => { cancelled = true; };
336:   }, [user?.uid]);
337: 
338:   /* ── 핸들러 ── */
339:   function handleLogin(u)    { localStorage.setItem('auth_user', JSON.stringify(u)); setUser(u); }
340:   function handleOnboardingComplete(p) {
341:     localStorage.setItem('onboarding_completed', '1');
342:     saveProfile(p); setProfile(p); setOnboardingDone(true);
343:     if (user?.uid) saveUserData(user.uid, { profile: p, onboardingDone: true }).catch(() => {});
344:   }
345:   function handleProfileSave(p) {
346:     saveProfile(p); setProfile(p);
347:     if (user?.uid) saveUserData(user.uid, { profile: p }).catch(() => {});
```

## src/App.jsx:366-400

```text
366:     const latestUserText = [...(msgs || [])].reverse().find(m => m.role === 'user' && m.text)?.text;
367:     const refinedMeta = latestUserText ? refineDynamicCoachRoomMeta(meta, latestUserText) : meta;
368:     if (refinedMeta && refinedMeta !== meta) {
369:       meta = refinedMeta;
370:       setCoachRoomMeta(prev => ({ ...prev, [roomId]: refinedMeta }));
371:       saveCoachRoomMeta(refinedMeta);
372:     }
373:     setCoachRooms(prev => ({ ...prev, [roomId]: msgs }));
374:     try { localStorage.setItem(`coach_msgs_${roomId}`, JSON.stringify(msgs)); } catch {}
375:     if (user?.uid) saveCoachRoom(user.uid, roomId, msgs, meta).catch(() => {});
376:   }
377: 
378:   function handleStartNewCoachRoom(meta, message) {
379:     saveCoachRoomMeta(meta);
380:     setCoachRoomMeta(prev => ({ ...prev, [meta.id]: meta }));
381:     setCoachPendingMessage(message);
382:     navigateApp({ tab: 'coach', screen: 'home', coachRoom: meta.id, coachOverlay: null });
383:   }
384: 
385:   function handleCoachRoomDelete(roomId) {
386:     setCoachRooms(prev => ({ ...prev, [roomId]: null }));
387:     setCoachRoomMeta(prev => {
388:       const next = { ...prev };
389:       delete next[roomId];
390:       return next;
391:     });
392:     try { localStorage.removeItem(`coach_msgs_${roomId}`); } catch {}
393:     try { localStorage.removeItem(`coach_room_meta_${roomId}`); } catch {}
394:     if (coachRoom === roomId) {
395:       replaceApp({ tab: 'coach', screen: 'home', coachRoom: null, coachOverlay: null });
396:     }
397:     if (coachOverlay?.roomId === roomId) {
398:       replaceApp({ tab: 'home', screen, coachRoom: null, coachOverlay: null });
399:     }
400:     if (user?.uid) deleteCoachRoom(user.uid, roomId).catch(() => {});
```

## src/App.jsx:451-463

```text
451: 
452:   /* 탭 순서: 홈(0) | 코치(1) | 마이(2) — 인덱스 기반으로 정확한 방향 결정 */
453:   const TAB_ORDER = ['home', 'coach', 'my'];
454:   function tabStyle(panelId) {
455:     const pIdx = TAB_ORDER.indexOf(panelId);
456:     const aIdx = TAB_ORDER.indexOf(tab);
457:     const x = pIdx < aIdx ? -100 : pIdx > aIdx ? 100 : 0;
458:     return { transform: x === 0 ? 'none' : `translateX(${x}%)`, pointerEvents: panelId === tab ? 'auto' : 'none' };
459:   }
460:   function tabClass(panelId) {
461:     return `tab-panel${(panelId === tab || panelId === prevTab) ? '' : ' no-transition'}`;
462:   }
463: 
```

## src/components/screens/MyPageScreen.jsx:138-207

```text
138:   useEffect(() => {
139:     if (!trashOpen || !user?.uid) return;
140:     setTrashLoading(true);
141:     const q = query(collection(db, 'logs'), where('uid', '==', user.uid), orderBy('timestamp', 'desc'), limit(200));
142:     getDocs(q).then(snap => {
143:       const now = Date.now();
144:       const cutoff = now - 30 * 86400000;
145:       const items = snap.docs
146:         .map(d => ({ ...d.data(), docId: d.id }))
147:         .filter(d => d.deletedAt)
148:         .filter(d => {
149:           const ms = d.deletedAt.seconds ? d.deletedAt.seconds * 1000 : 0;
150:           return ms > cutoff;
151:         })
152:         .sort((a, b) => (b.deletedAt?.seconds || 0) - (a.deletedAt?.seconds || 0));
153:       setTrashedLogs(items);
154:     }).finally(() => setTrashLoading(false));
155:   }, [trashOpen, user?.uid]);
156: 
157:   async function handleRestore(docId) {
158:     setRestoringId(docId);
159:     try {
160:       await updateDoc(doc(db, 'logs', docId), { deletedAt: deleteField() });
161:       setTrashedLogs(prev => prev.filter(l => l.docId !== docId));
162:     } finally {
163:       setRestoringId(null);
164:     }
165:   }
166: 
167:   function handleSave() {
168:     onProfileSave(form);
169:     setEditing(false);
170:   }
171: 
172:   async function handleLogout() {
173:     localStorage.removeItem('auth_user');
174:     localStorage.removeItem('user_profile');
175:     localStorage.removeItem('onboarding_completed');
176:     localStorage.removeItem('ai_goals');
177:     const keysToRemove = [];
178:     for (let i = 0; i < localStorage.length; i++) {
179:       const k = localStorage.key(i);
180:       if (k?.startsWith('coach_msgs_') || k?.startsWith('coach_room_meta_')) keysToRemove.push(k);
181:     }
182:     keysToRemove.forEach(k => localStorage.removeItem(k));
183:     try { await signOut(auth); } catch {}
184:     try {
185:       await terminate(db);
186:       await clearIndexedDbPersistence(db);
187:     } catch {}
188:     window.location.reload();
189:   }
190: 
191:   async function handleDeleteAccount() {
192:     if (deleting) return;
193:     setDeleting(true);
194:     try {
195:       const token = await auth.currentUser.getIdToken();
196:       const res = await fetch('/api/delete-account', {
197:         method: 'POST',
198:         headers: { Authorization: `Bearer ${token}` },
199:       });
200:       if (!res.ok) throw new Error('delete-failed');
201:       await handleLogout();
202:     } catch {
203:       setDeleting(false);
204:       setDeleteOpen(false);
205:       alert('탈퇴 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
206:     }
207:   }
```

## src/components/screens/WorkoutMemoScreen.jsx:187-215

```text
187: /* 동일 문서에 대해 백그라운드 AI 정리가 중복 실행되는 것을 막는다 (재저장/재진입 시 두 작업이 서로의 aiStatus 쓰기를 덮어써 processing에 멈추는 문제 방지) */
188: const activeBackgroundAI = new Set();
189: 
190: export default function WorkoutMemoScreen({ onBack, onSave, initialData, uid, profile, onOpenCoachWithMessage }) {
191:   const originalSectionsRef = useRef(null);
192:   const [showExitModal, setShowExitModal] = useState(false);
193: 
194:   useEffect(() => {
195:     if (!originalSectionsRef.current) {
196:       originalSectionsRef.current = JSON.stringify(sections);
197:     }
198:   // eslint-disable-next-line react-hooks/exhaustive-deps
199:   }, []);
200: 
201:   const handleBackClick = () => {
202:     let isDirty = false;
203:     if (freeMode) {
204:       const currentHtml = editorRef.current?.innerHTML || '';
205:       isDirty = currentHtml !== (initialData?.freeHtml || '');
206:     } else {
207:       isDirty = JSON.stringify(sections) !== originalSectionsRef.current;
208:     }
209:     
210:     if (isDirty) {
211:       setShowExitModal(true);
212:     } else {
213:       onBack();
214:     }
215:   };
```

## src/components/screens/WorkoutMemoScreen.jsx:228-238

```text
228:   const [currentHighlight, setCurrentHighlight] = useState('transparent');
229: 
230:   useEffect(() => {
231:     if (freeMode && editorRef.current && !editorRef.current.innerHTML) {
232:       editorRef.current.innerHTML = initialData?.freeHtml || '';
233:       // 기존 메모 편집 시 auto-focus는 iOS 스크롤 버그를 유발하므로 새 메모만 포커스
234:       if (!initialData?.freeHtml) {
235:         editorRef.current.focus();
236:       }
237:     }
238:   }, [freeMode]);
```

## src/components/screens/WorkoutMemoScreen.jsx:918-985

```text
918:   async function runBackgroundAI(docRef, currentSections, title, capturedMode, rawTextOverride) {
919:     if (activeBackgroundAI.has(docRef.id)) return;
920:     activeBackgroundAI.add(docRef.id);
921:     try {
922:       await runBackgroundAIInner(docRef, currentSections, title, capturedMode, rawTextOverride);
923:     } finally {
924:       activeBackgroundAI.delete(docRef.id);
925:     }
926:   }
927: 
928:   async function runBackgroundAIInner(docRef, currentSections, title, capturedMode, rawTextOverride) {
929:     const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
930:     try {
931:       // 글 정리
932:       const rawText = rawTextOverride || currentSections.map(s =>
933:         `부위: ${s.part}\n${s.items.map(i => `- 종목: ${i.title}\n  기록: ${i.body}`).join('\n')}`
934:       ).join('\n\n');
935:       const summarizePrompt = `다음 사용자의 거친 운동 메모 데이터를 보기 좋게 정리해서 JSON 배열로 반환해줘.
936: 응답 형식: [{ "part": "운동부위", "items": [{ "title": "운동종목", "body": "• 세트 1: 20kg 15회\\n• 세트 2: 40kg 20회", "note": "느낀점(선택)" }] }]
937: 중요 규칙:
938: 0. part는 반드시 다음 카테고리 중 하나여야 한다: ${BODY_PART_OPTIONS}
939: 0-1. 클라이밍, 러닝/조깅, 사이클, 인터벌, 줄넘기, 로잉머신 등 유산소성 운동은 반드시 '유산소'로 분류할 것.
940: 1. 각 세트별 기록은 반드시 '• 세트 N: 무게 횟수' 형태로 작성해줘.
941: 2. 여러 세트인 경우 쉼표(,) 대신 반드시 줄바꿈(\\n)으로 구분해서 작성해줘.
942: 3. [가장 중요] 세트 번호(N)는 종목이 바뀌더라도 절대 1부터 다시 시작하지 말고, 이전 종목의 마지막 세트 번호에 이어서 전체 누적으로 계속 카운트해줘.
943: 4. [가장 중요] 원문에 있는 (드랍), (드랍세트), (슈퍼세트), (컴파운드), (강제반복), (저중량) 같은 세트 타입 표기와, "양쪽" / "각 사이드" 같이 좌우 양쪽을 뜻하는 표기는 절대 삭제하지 말고 해당 세트의 body 텍스트 안에 그대로 유지해.
944: 5. 드랍/슈퍼세트 등 세트 타입 표기는 note로 분리하지 마. 우리 앱은 body 안의 텍스트를 감지해 별도 뱃지로 처리한다.
945: 6. [가장 중요] 세트 기록과 함께 또는 독립적으로 적힌 주관적 느낌·코멘트는 반드시 note 필드로 분리해. kg/회/세트 숫자나 세트 타입 표기가 아닌 주관적 경험·느낌 텍스트만 note로. 없으면 note 필드 생략.
946: 7. 운동 기록이 전혀 없고 코멘트만 있는 경우, body는 빈 문자열로, note에 해당 문장 전체를 넣어.
947: 8. JSON 이외의 다른 텍스트(마크다운 등)는 절대 포함하지 마.
948: 9. [중요] 풀업/친업/딥스 계열 종목은 반드시 아래 세 가지 중 하나로 명확히 구분해서 title에 표기해줘: 보조 기구(어시스티드 머신)를 사용한 경우 → "어시스티드 풀업"/"어시스티드 친업"/"어시스티드 딥스", 체중에 무게를 추가한 경우 → "가중 풀업"/"가중 친업"/"가중 딥스", 맨몸인 경우 → "풀업"/"친업"/"딥스".
949: 사용자 입력:\n${rawText}`;
950: 
951:       const sumCtrl = new AbortController();
952:       const sumTimer = setTimeout(() => sumCtrl.abort(), 45000);
953:       let sumRes;
954:       try {
955:         sumRes = await fetch(GEMINI_URL, {
956:           method: "POST",
957:           headers: { "Content-Type": "application/json" },
958:           body: JSON.stringify({ contents: [{ parts: [{ text: summarizePrompt }] }] }),
959:           signal: sumCtrl.signal,
960:         });
961:       } finally {
962:         clearTimeout(sumTimer);
963:       }
964:       const sumJson = await sumRes.json();
965:       if (sumJson.error || !sumJson.candidates?.[0]) throw new Error("글 정리 실패");
966: 
967:       const sumParts = sumJson.candidates[0].content.parts;
968:       const sumText = (sumParts.find(p => !p.thought) ?? sumParts[sumParts.length - 1]).text;
969:       const cleanedSum = sumText.replace(/```json/gi, '').replace(/```/g, '').trim();
970:       const jsonMatch = cleanedSum.match(/\[[\s\S]*\]/);
971:       if (!jsonMatch) throw new Error("JSON 배열 파싱 실패: " + cleanedSum.slice(0, 200));
972:       const parsed = JSON.parse(jsonMatch[0]);
973: 
974:       const structuredSections = parsed.map(s => ({
975:         part: s.part || "운동 부위",
976:         items: (s.items || []).map(it => ({ title: it.title, body: it.body, ...(it.note ? { note: it.note } : {}) }))
977:       }));
978:       const structuredExercises = structuredSections.flatMap(s => s.items.map(it => ({ name: it.title }))).filter(ex => ex.name);
979:       const totalVolume = parseVolume(structuredSections, profile?.weight);
980:       const cardioMinutes = parseCardioMinutes(structuredSections);
981: 
982:       const lastVolume = await findComparableLastVolume(structuredSections, title, docRef.id);
983:       const overloadMsg = buildWorkoutSummaryMessage(totalVolume, lastVolume, capturedMode, cardioMinutes);
984: 
985:       await updateDoc(docRef, { sections: structuredSections, exercises: structuredExercises, totalVolume, cardioMinutes, overloadMsg, aiStatus: 'summarized' });
```

## src/components/screens/WorkoutMemoScreen.jsx:1009-1139

```text
1009:           aiComment = (cParts.find(p => !p.thought) ?? cParts[cParts.length - 1]).text.trim() || overloadMsg;
1010:         }
1011:       } catch {}
1012:       finally { clearTimeout(commentTimer); }
1013:       await updateDoc(docRef, { aiComment, aiStatus: 'done', aiError: null });
1014:     } catch (err) {
1015:       console.error("백그라운드 AI 처리 실패:", err);
1016:       try {
1017:         const fallback = await buildWorkoutFallbackSummary(docRef.id, currentSections, title, capturedMode);
1018:         await updateDoc(docRef, {
1019:           sections: fallback.sectionsForSave,
1020:           exercises: fallback.exercisesForSave,
1021:           totalVolume: fallback.totalVolume,
1022:           cardioMinutes: fallback.cardioMinutes,
1023:           overloadMsg: fallback.overloadMsg,
1024:           aiComment: fallback.overloadMsg,
1025:           aiStatus: 'done',
1026:           aiError: null,
1027:         });
1028:       } catch {
1029:         try { await updateDoc(docRef, { aiStatus: 'done', aiError: null }); } catch {}
1030:       }
1031:     }
1032:   }
1033: 
1034:   /* ── 저장 ── */
1035:   async function handleSave() {
1036:     try {
1037:       // 자유 메모 모드
1038:       if (freeMode) {
1039:         const html = editorRef.current?.innerHTML || '';
1040:         const plainText = editorRef.current?.innerText || '';
1041:         const title = plainText.split('\n').find(l => l.trim()) || '운동 메모';
1042:         const freeFallbackSections = [{ part: title.substring(0, 40), items: [{ title: title.substring(0, 40), body: plainText }] }];
1043:         const cardioMinutes = parseCardioMinutes(freeFallbackSections);
1044: 
1045:         let docRef;
1046:         const fallbackComment = cardioMinutes > 0
1047:           ? `오늘 유산소 ${formatCardioDuration(cardioMinutes)} 기록!`
1048:           : '운동 메모 저장 완료!';
1049:         if (initialData?.docId) {
1050:           docRef = doc(db, 'logs', initialData.docId);
1051:           await updateDoc(docRef, {
1052:             title: title.substring(0, 40),
1053:             freeHtml: html,
1054:             originalText: plainText,
1055:             cardioMinutes,
1056:             overloadMsg: fallbackComment,
1057:             aiStatus: 'processing',
1058:             aiError: null,
1059:           });
1060:         } else {
1061:           const res = await addDoc(collection(db, 'logs'), {
1062:             type: 'workout', uid, timestamp: serverTimestamp(),
1063:             title: title.substring(0, 40),
1064:             freeHtml: html,
1065:             originalText: plainText,
1066:             mode: 'free',
1067:             exercises: [],
1068:             sections: [],
1069:             totalVolume: 0,
1070:             cardioMinutes,
1071:             overloadMsg: fallbackComment,
1072:             aiStatus: 'processing',
1073:             aiError: null,
1074:           });
1075:           docRef = res;
1076:         }
1077: 
1078:         originalSectionsRef.current = JSON.stringify(sections);
1079:         if (onSave) onSave();
1080:         runBackgroundAI(docRef, freeFallbackSections, title, workoutMode, plainText).catch(() => {});
1081:         return;
1082:       }
1083: 
1084:       const title = sections.map(s => s.part).filter(Boolean).join(", ") || "운동 기록";
1085:       const exercises = sections.flatMap(s => s.items.map(it => ({ name: it.title }))).filter(ex => ex.name);
1086:       const originalText = sections.flatMap(s => s.items.map(it => it.body)).filter(Boolean).join("\n");
1087:       const sectionsData = sections.map(s => ({
1088:         part: s.part,
1089:         items: s.items.map(it => ({ title: it.title, body: it.body, supersetGroup: it.supersetGroup ?? null }))
1090:       }));
1091:       const roughVolume = parseVolume(sections, profile?.weight);
1092:       const cardioMinutes = parseCardioMinutes(sectionsData);
1093:       const fallbackComment = roughVolume > 0
1094:         ? `오늘 볼륨 ${roughVolume.toLocaleString()}kg 기록 완료!`
1095:         : cardioMinutes > 0
1096:           ? `오늘 유산소 ${formatCardioDuration(cardioMinutes)} 기록!`
1097:         : "운동 기록 저장 완료!";
1098: 
1099:       let docRef;
1100:       if (initialData && initialData.docId) {
1101:         docRef = doc(db, "logs", initialData.docId);
1102:         await updateDoc(docRef, {
1103:           title,
1104:           exercises,
1105:           originalText,
1106:           sections: sectionsData,
1107:           totalVolume: roughVolume,
1108:           cardioMinutes,
1109:           overloadMsg: fallbackComment,
1110:           aiStatus: 'processing',
1111:           aiError: null,
1112:         });
1113:       } else {
1114:         const res = await addDoc(collection(db, "logs"), {
1115:           type: "workout", timestamp: serverTimestamp(),
1116:           uid,
1117:           title,
1118:           exercises,
1119:           originalText,
1120:           sections: sectionsData,
1121:           totalVolume: roughVolume,
1122:           cardioMinutes,
1123:           overloadMsg: fallbackComment,
1124:           aiStatus: 'processing',
1125:           aiError: null,
1126:         });
1127:         docRef = res;
1128:       }
1129: 
1130:       originalSectionsRef.current = JSON.stringify(sections);
1131:       if (onSave) onSave();
1132: 
1133:       // 백그라운드 AI 처리 (컴포넌트 언마운트 후에도 계속 실행됨)
1134:       runBackgroundAI(docRef, sections, title, workoutMode).catch(() => {});
1135:     } catch (e) {
1136:       alert("저장 중 오류가 발생했습니다: " + e.message);
1137:     }
1138:   }
1139: 
```

## src/components/screens/WorkoutMemoScreen.jsx:1500-1511

```text
1500: 
1501:       {/* 하단 저장 액션바 */}
1502:       <div className="flex-none bg-white border-t border-ui-2 px-5 pt-4 pb-10">
1503:         <Pressable
1504:           pressScale={0.97}
1505:           onClick={handleSave}
1506:           className="w-full h-[56px] bg-brand rounded-2xl font-pretendard font-bold text-[16px] text-white tracking-[-0.4px]"
1507:         >
1508:           저장하기
1509:         </Pressable>
1510:       </div>
1511: 
```

## src/components/screens/DietDetailScreen.jsx:153-170

```text
153: const RECENT_KEY = 'diet_recent_foods';
154: const CUSTOM_FOODS_KEY = 'diet_custom_foods';
155: 
156: function loadRecentFoods() {
157:   try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
158: }
159: 
160: function loadCustomFoods() {
161:   try { return JSON.parse(localStorage.getItem(CUSTOM_FOODS_KEY)) || []; } catch { return []; }
162: }
163: 
164: function saveCustomFoods(foods) {
165:   try { localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(foods)); } catch {}
166: }
167: 
168: function applyCustomFood(food, customFoods) {
169:   const custom = findCustomFood(customFoods, food?.name);
170:   if (!custom) return food;
```

## src/components/screens/DietDetailScreen.jsx:212-217

```text
212: function serializeDietDraft(sections, aiInputs, goalKcal) {
213:   const filledInputs = Object.fromEntries(
214:     Object.entries(aiInputs || {}).filter(([, value]) => String(value || '').trim())
215:   );
216:   return JSON.stringify({ sections, aiInputs: filledInputs, goalKcal });
217: }
```

## src/components/screens/DietDetailScreen.jsx:296-304

```text
296:   const handleBackClick = () => {
297:     const currentDraft = serializeDietDraft(sections, aiInputs, goalKcal);
298:     const isDirty = originalSectionsRef.current && originalSectionsRef.current !== currentDraft;
299:     if (isDirty) {
300:       setShowExitModal(true);
301:     } else {
302:       onBack();
303:     }
304:   };
```

## src/components/screens/DietDetailScreen.jsx:344-365

```text
344: 
345:   function upsertCustomFood(food) {
346:     const custom = {
347:       key: normalizeFoodKey(food.name),
348:       name: String(food.name || '').trim(),
349:       kcal: Number(food.kcal || 0),
350:       carb: Number(food.carb || 0),
351:       protein: Number(food.protein || 0),
352:       fat: Number(food.fat || 0),
353:       source: 'custom',
354:       matchedName: '내가 수정한 기준',
355:       updatedAt: Date.now(),
356:     };
357:     if (!custom.key || !custom.name) return null;
358:     const next = [custom, ...customFoods.filter(food => food.key !== custom.key)].slice(0, 80);
359:     setCustomFoods(next);
360:     saveCustomFoods(next);
361:     setRecentFoods(prev => pushRecent([custom], prev));
362:     return custom;
363:   }
364: 
365:   /* AI 텍스트 분석 */
```

## src/components/screens/DietDetailScreen.jsx:529-542

```text
529:   function handleSaveCustomFood() {
530:     upsertCustomFood({
531:       name: addForm.name,
532:       kcal: addForm.kcal,
533:       carb: addForm.carb,
534:       protein: addForm.protein,
535:       fat: addForm.fat,
536:     });
537:     setAddFoodOpen(false);
538:     setAddForm({ name: '', kcal: '', carb: '', protein: '', fat: '' });
539:     if (foodToastTimerRef.current) clearTimeout(foodToastTimerRef.current);
540:     setFoodSavedToast(true);
541:     foodToastTimerRef.current = setTimeout(() => setFoodSavedToast(false), 2500);
542:   }
```

## src/components/screens/DietDetailScreen.jsx:573-619

```text
573:       id: sec.id,
574:       name: sec.name,
575:       items: (sec.items || []).map(item => {
576:         const clean = {
577:           id:      item.id,
578:           name:    String(item.name || ''),
579:           kcal:    Number(item.kcal || 0),
580:           carb:    Number(item.carb || 0),
581:           protein: Number(item.protein || 0),
582:           fat:     Number(item.fat || 0),
583:           source:  item.source || 'ai',
584:         };
585:         if (item.matchedName != null)    clean.matchedName    = item.matchedName;
586:         if (item.adjustmentNote != null) clean.adjustmentNote = item.adjustmentNote;
587:         if (item.intakeModifiers?.length) clean.intakeModifiers = item.intakeModifiers;
588:         return clean;
589:       }),
590:     }));
591:   }
592: 
593:   async function handleSaveClick() {
594:     setSaving(true);
595:     try {
596:       const isNew      = !initialData?.docId;
597:       const totalItems = sections.reduce((acc, sec) => acc + (sec.items || []).length, 0);
598:       let comment      = aiComment;
599:       if (totalItems > 0) {
600:         comment = getDietSummaryComment(totals, profile, goalKcal);
601:         setAiComment(comment);
602:       }
603:       const docData = { type: 'diet', goal: goalKcal, kcal: totals.kcal,
604:         carb: totals.carb, protein: totals.protein, fat: totals.fat,
605:         sections: sanitizeSections(sections),
606:         aiComment: comment || '식단이 기록되었습니다.' };
607:       if (isNew) {
608:         await addDoc(collection(db, 'logs'), { ...docData, uid, timestamp: serverTimestamp() });
609:       } else {
610:         await updateDoc(doc(db, 'logs', initialData.docId), { ...docData });
611:       }
612:       onSave();
613:     } catch (e) {
614:       alert('저장 실패: ' + e.message);
615:     } finally {
616:       setSaving(false);
617:     }
618:   }
619: 
```

## src/components/screens/DietDetailScreen.jsx:628-640

```text
628:         subtitle="저장하지 않고 나가면 현재까지 작성한 내용은 사라집니다."
629:         confirmText="저장하고 나가기"
630:         cancelText="계속 작성"
631:         tertiaryText="그냥 나가기"
632:         onConfirm={() => {
633:           setShowExitModal(false);
634:           handleSaveClick();
635:         }}
636:         onTertiary={onBack}
637:         onCancel={() => setShowExitModal(false)}
638:       />
639:       <header className="flex-none bg-white z-20">
640:         <div className="flex items-center justify-between h-14 px-4">
```

## src/components/screens/DietDetailScreen.jsx:1170-1200

```text
1170:               />
1171:             </div>
1172:             <div className="grid grid-cols-4 gap-2 mb-6">
1173:               {[
1174:                 { key: 'kcal', label: 'kcal', unit: 'kcal' },
1175:                 { key: 'carb', label: '탄수화물', unit: 'g' },
1176:                 { key: 'protein', label: '단백질', unit: 'g' },
1177:                 { key: 'fat', label: '지방', unit: 'g' },
1178:               ].map(({ key, label, unit }) => (
1179:                 <div key={key}>
1180:                   <label className="font-pretendard text-[11px] text-[#868e96] tracking-[-0.2px] mb-1 block">{label}</label>
1181:                   <div className="relative">
1182:                     <input
1183:                       type="number"
1184:                       value={addForm[key]}
1185:                       onChange={e => setAddForm(p => ({ ...p, [key]: e.target.value }))}
1186:                       className="w-full bg-[#f8f9fa] rounded-[8px] px-2 py-2 font-pretendard text-[13px] text-[#171a1d] outline-none border border-transparent focus:border-[#3476EE] transition-colors"
1187:                     />
1188:                     <span className="absolute right-1.5 top-1/2 -translate-y-1/2 font-pretendard text-[10px] text-[#adb5bd]">{unit}</span>
1189:                   </div>
1190:                 </div>
1191:               ))}
1192:             </div>
1193:             <button
1194:               onClick={handleSaveCustomFood}
1195:               disabled={!addForm.name.trim() || Number(addForm.kcal) <= 0}
1196:               className="w-full bg-[#3476EE] text-white font-pretendard font-semibold text-[16px] tracking-[-0.4px] py-3.5 rounded-[12px] transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40"
1197:             >
1198:               저장
1199:             </button>
1200:           </div>
```

## src/components/screens/AICoachScreen.jsx:96-109

```text
96: async function fetchRecentLogs(uid) {
97:   if (!uid) return { workouts: [], diets: [] };
98:   const q = query(collection(db, 'logs'), where('uid', '==', uid), orderBy('timestamp', 'desc'), limit(30));
99:   const snap = await getDocs(q);
100:   const all = snap.docs
101:     .map(d => d.data())
102:     .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
103:   return {
104:     workouts: all.filter(d => !d.type || d.type === 'workout').slice(0, 10),
105:     diets: all.filter(d => d.type === 'diet').slice(0, 10),
106:   };
107: }
108: 
109: function buildSystemPrompt(profile, workouts, diets, roomType) {
```

## src/components/screens/AICoachScreen.jsx:191-230

```text
191: 
192: async function callGemini(messages, profile, workouts, diets, roomType) {
193:   const systemPrompt = buildSystemPrompt(profile, workouts, diets, roomType);
194:   const firstUserIdx = messages.findIndex(m => m.role === 'user');
195:   const conversationMessages = firstUserIdx >= 0 ? messages.slice(firstUserIdx) : [];
196: 
197:   const body = {
198:     systemInstruction: { parts: [{ text: systemPrompt }] },
199:     contents: conversationMessages.map((m) => ({
200:       role: m.role === 'user' ? 'user' : 'model',
201:       parts: [{ text: m.role === 'user' ? (m.text || m.displayText || '') : sanitizeAiText(m.text || m.displayText || '') }],
202:     })),
203:   };
204: 
205:   const res = await fetch(
206:     `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
207:     {
208:       method: 'POST',
209:       headers: { 'Content-Type': 'application/json' },
210:       body: JSON.stringify(body),
211:     }
212:   );
213:   const data = await res.json();
214:   if (data.error) throw new Error(data.error.message);
215:   const parts = data.candidates?.[0]?.content?.parts;
216:   if (!parts) return { text: '죄송해요, 잠시 후 다시 시도해 주세요.', suggestion: null };
217:   let rawText = (parts.find(p => !p.thought) ?? parts[parts.length - 1]).text;
218:   
219:   let suggestion = null;
220:   const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/);
221:   if (jsonMatch) {
222:     try {
223:       suggestion = sanitizeSuggestion(JSON.parse(jsonMatch[1]));
224:       rawText = rawText.replace(/```json\n([\s\S]*?)\n```/, '').trim();
225:     } catch(e) {}
226:   }
227:   return { text: sanitizeAiText(rawText), suggestion };
228: }
229: 
230: function normalizeOutgoingMessage(payload) {
```

## src/components/screens/AICoachScreen.jsx:447-451

```text
447: 
448:   useEffect(() => {
449:     fetchRecentLogs(user?.uid).then(setContext);
450:   }, [user?.uid]);
451: 
```

## src/components/screens/AICoachScreen.jsx:488-520

```text
488:   }
489: 
490:   async function sendMessage(payload) {
491:     const outgoing = normalizeOutgoingMessage(payload);
492:     if (!outgoing || loading) return;
493: 
494:     const newMessages = [
495:       ...messages.map(m => ({ ...m, showQuickReplies: false })),
496:       { role: 'user', ...outgoing, timestamp: new Date() },
497:     ];
498:     updateMessages(newMessages);
499:     setInput('');
500:     setLoading(true);
501: 
502:     try {
503:       const reply = await callGemini(
504:         newMessages,
505:         { ...profile, name },
506:         context.workouts,
507:         context.diets,
508:         roomType
509:       );
510:       updateMessages([...newMessages, { role: 'model', text: reply.text, suggestion: reply.suggestion, timestamp: new Date() }]);
511:       const category = ROOM_CATEGORY[roomType] || 'workout';
512:       localStorage.setItem(`coaching_insight_${category}`, JSON.stringify({ text: reply.text, timestamp: Date.now(), roomType, category }));
513:     } catch {
514:       updateMessages([...newMessages, { role: 'model', text: '네트워크 오류가 발생했어요. 다시 시도해 주세요.', timestamp: new Date() }]);
515:     } finally {
516:       setLoading(false);
517:     }
518:   }
519: 
520:   function handleKeyDown(e) {
```

## src/components/screens/HomeScreen.jsx:152-186

```text
152:   useEffect(() => {
153:     if (!user?.uid) return;
154:     let cancelled = false;
155:     let unsubRef = null;
156: 
157:     function subscribe() {
158:       if (cancelled) return;
159:       const q = query(collection(db, "logs"), where("uid", "==", user.uid), orderBy("timestamp", "desc"), limit(200));
160:       unsubRef = onSnapshot(q, (snap) => {
161:         if (cancelled) return;
162:         const all = snap.docs.map(d => ({ ...d.data(), docId: d.id }));
163:         all.forEach(d => {
164:           if (d.type !== 'workout') return;
165:           const prev = prevAiStatusRef.current[d.docId];
166:           if ((prev === 'processing' || prev === 'summarized') && d.aiStatus === 'done') {
167:             const msg = d.overloadMsg ? `✨ ${d.overloadMsg}` : '✨ AI 기록 정리 완료!';
168:             if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
169:             setToast({ show: true, message: msg });
170:             toastTimerRef.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
171:           }
172:           prevAiStatusRef.current[d.docId] = d.aiStatus;
173:         });
174: 
175:         const active = all.filter(d => !d.deletedAt);
176:         const sorted = active.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
177:         setWorkoutLogs(sorted.filter(d => !d.type || d.type === "workout"));
178:         setDietLogs(sorted.filter(d => d.type === "diet"));
179:       }, (err) => {
180:         console.error("Firestore 쿼리 오류:", err);
181:         if (!cancelled) setTimeout(subscribe, 4000);
182:       });
183:     }
184: 
185:     subscribe();
186:     return () => { cancelled = true; unsubRef?.(); if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
```

## src/components/screens/HomeScreen.jsx:188-198

```text
188: 
189:   useEffect(() => {
190:     try {
191:       const stored = localStorage.getItem(`coaching_insight_${mainTab}`);
192:       if (!stored) { setCoachingInsight(null); return; }
193:       const insight = JSON.parse(stored);
194:       const dismissedAt = parseInt(localStorage.getItem(`coaching_insight_dismissed_${mainTab}`) || '0');
195:       if (insight.timestamp > dismissedAt) setCoachingInsight(insight);
196:       else setCoachingInsight(null);
197:     } catch { setCoachingInsight(null); }
198:   }, [mainTab]);
```

## src/components/screens/HomeScreen.jsx:329-359

```text
329: 
330:   function handleDeleteCancel() {
331:     setDeleteTarget(null);
332:   }
333: 
334:   function handleDeleteConfirm() {
335:     if (!deleteTarget?.docId) return;
336:     const docId = deleteTarget.docId;
337:     setDeleteTarget(null);
338:     setDeletingId(docId);
339:     setTimeout(async () => {
340:       await updateDoc(doc(db, "logs", docId), { deletedAt: serverTimestamp() });
341:       setDeletingId(null);
342:     }, 400);
343:   }
344: 
345:   function handleDateChangeRequest(data) {
346:     const dt = data.timestamp?.seconds ? new Date(data.timestamp.seconds * 1000) : new Date();
347:     const y = dt.getFullYear();
348:     const m = String(dt.getMonth() + 1).padStart(2, '0');
349:     const d = String(dt.getDate()).padStart(2, '0');
350:     setDateInput(`${y}-${m}-${d}`);
351:     setDateChangeTarget(data);
352:   }
353: 
354:   async function handleDateChangeConfirm() {
355:     if (!dateChangeTarget?.docId || !dateInput) return;
356:     const newDate = new Date(`${dateInput}T12:00:00`);
357:     await updateDoc(doc(db, 'logs', dateChangeTarget.docId), { timestamp: Timestamp.fromDate(newDate) });
358:     setDateChangeTarget(null);
359:   }
```

## src/lib/userStore.js:1-43

```text
1: import { db } from './firebase';
2: import { collection, deleteDoc, doc, getDoc, getDocs, query, limit, setDoc } from 'firebase/firestore';
3: 
4: const ROOMS = ['powerbuilding', 'dumbbell', 'diet', 'mobility', 'routine'];
5: 
6: export async function loadUserData(uid) {
7:   const snap = await getDoc(doc(db, 'users', uid));
8:   return snap.exists() ? snap.data() : null;
9: }
10: 
11: export async function saveUserData(uid, data) {
12:   await setDoc(doc(db, 'users', uid), data, { merge: true });
13: }
14: 
15: export async function loadAllCoachRooms(uid) {
16:   const result = {};
17:   ROOMS.forEach(roomId => { result[roomId] = null; });
18: 
19:   const snap = await getDocs(query(collection(db, 'users', uid, 'coachRooms'), limit(20)));
20:   snap.forEach((roomDoc) => {
21:     const { messages = [], meta = null } = roomDoc.data();
22:     result[roomDoc.id] = {
23:       messages: messages.map(m => ({
24:         ...m,
25:         timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
26:       })),
27:       meta,
28:     };
29:   });
30:   return result;
31: }
32: 
33: export async function saveCoachRoom(uid, roomId, messages, meta = null) {
34:   const serialized = messages.map(m => ({
35:     ...m,
36:     timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
37:   }));
38:   await setDoc(doc(db, 'users', uid, 'coachRooms', roomId), { messages: serialized, meta }, { merge: true });
39: }
40: 
41: export async function deleteCoachRoom(uid, roomId) {
42:   await deleteDoc(doc(db, 'users', uid, 'coachRooms', roomId));
43: }
```

## src/lib/firebase.js:16-27

```text
16: export const auth = getAuth(app);
17: export const googleProvider = new GoogleAuthProvider();
18: googleProvider.setCustomParameters({ prompt: 'select_account' });
19: 
20: export const appleProvider = new OAuthProvider('apple.com');
21: appleProvider.addScope('email');
22: appleProvider.addScope('name');
23: 
24: // 로그인 영구 유지 (브라우저 재시작 후에도)
25: export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
26:   console.error('[Auth persistence]', error.code || error.message);
27: });
```

## src/components/common/Toast.jsx:1-12

```text
1: import React from 'react';
2: 
3: export default function Toast({ show, message }) {
4:   return (
5:     <div
6:       className={`fixed bottom-[100px] left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-[13px] font-semibold font-pretendard tracking-[-0.3px] leading-snug text-white max-w-[calc(100vw-48px)] text-center pointer-events-none z-[1000] transition-all duration-300 ease-out shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${show ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'}`}
7:       style={{ background: '#2B2D33' }}
8:     >
9:       {message}
10:     </div>
11:   );
12: }
```

## src/utils/utils.js:3-16

```text
3: function isBodyweightBase(title) {
4:   if (!title) return false;
5:   const base = title.replace(/^(어시스티드|가중)\s*/u, '').trim();
6:   return BODYWEIGHT_BASES.has(base);
7: }
8: 
9: export function sumReps(body) {
10:   let reps = 0;
11:   for (const m of body.matchAll(/(?:(\d+)\s*회|[x×]\s*(\d+))/gi))
12:     reps += parseInt(m[1] || m[2]);
13:   return reps;
14: }
15: 
16: export function parseVolumeFromBody(body) {
```

## src/utils/utils.js:36-73

```text
36:       const isAssisted = /어시스티드/i.test(title);
37:       const isWeighted = /가중/i.test(title);
38:       const isBW = isBodyweightBase(title);
39:       const hasKg = /\d+\s*kg/i.test(body);
40: 
41:       if (isAssisted && bw > 0) {
42:         if (hasKg) {
43:           for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))/gi))
44:             total += Math.max(0, bw - parseFloat(m[1])) * parseInt(m[2] || m[3]);
45:         } else {
46:           total += bw * sumReps(body);
47:         }
48:         return;
49:       }
50: 
51:       if (isWeighted && isBW && bw > 0 && hasKg) {
52:         for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))/gi))
53:           total += (bw + parseFloat(m[1])) * parseInt(m[2] || m[3]);
54:         return;
55:       }
56: 
57:       if (isBW && bw > 0 && !hasKg) {
58:         total += bw * sumReps(body);
59:         return;
60:       }
61: 
62:       for (const line of body.split('\n')) {
63:         const side = /양쪽|각\s*사이드/i.test(line) ? 2 : 1;
64:         for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))\s*(?:(?:(\d+)\s*세트|[x×]\s*(\d+)))?/gi))
65:           total += parseFloat(m[1]) * parseInt(m[2] || m[3]) * (m[4] ? parseInt(m[4]) : m[5] ? parseInt(m[5]) : 1) * side;
66:         for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*(?:lbs?|파운드)\s*(?:(\d+)\s*회|[x×]\s*(\d+))\s*(?:(?:(\d+)\s*세트|[x×]\s*(\d+)))?/gi))
67:           total += parseFloat(m[1]) * 0.453592 * parseInt(m[2] || m[3]) * (m[4] ? parseInt(m[4]) : m[5] ? parseInt(m[5]) : 1) * side;
68:         for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*칸\s*(?:(\d+)\s*회|[x×]\s*(\d+))\s*(?:(?:(\d+)\s*세트|[x×]\s*(\d+)))?/gi))
69:           total += parseFloat(m[1]) * 5 * parseInt(m[2] || m[3]) * (m[4] ? parseInt(m[4]) : m[5] ? parseInt(m[5]) : 1) * side;
70:       }
71:     });
72:   });
73:   return Math.round(total);
```

## functions/index.js:107-153

```text
107:   const sourceUserRef = db.doc(`users/${sourceUid}`);
108:   const targetUserRef = db.doc(`users/${targetUid}`);
109:   const [sourceUser, targetUser] = await Promise.all([sourceUserRef.get(), targetUserRef.get()]);
110:   if (!sourceUser.exists || targetUser.exists) return;
111: 
112:   const [rooms, logs] = await Promise.all([
113:     sourceUserRef.collection('coachRooms').get(),
114:     db.collection('logs').where('uid', '==', sourceUid).get(),
115:   ]);
116: 
117:   const writes = [
118:     { type: 'set', ref: targetUserRef, data: sourceUser.data() },
119:     ...rooms.docs.map((room) => ({
120:       type: 'set',
121:       ref: targetUserRef.collection('coachRooms').doc(room.id),
122:       data: room.data(),
123:     })),
124:     ...logs.docs.map((log) => ({
125:       type: 'update',
126:       ref: log.ref,
127:       data: { uid: targetUid },
128:     })),
129:   ];
130: 
131:   for (let i = 0; i < writes.length; i += 400) {
132:     const batch = db.batch();
133:     writes.slice(i, i + 400).forEach((write) => {
134:       if (write.type === 'set') batch.set(write.ref, write.data, { merge: true });
135:       else batch.update(write.ref, write.data);
136:     });
137:     await batch.commit();
138:   }
139: }
140: 
141: exports.socialAuth = onRequest({ region: 'us-central1', timeoutSeconds: 30 }, async (req, res) => {
142:   setCors(req, res);
143:   if (req.method === 'OPTIONS') return res.status(204).send('');
144:   if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });
145: 
146:   const origin = req.get('origin');
147:   if (origin && !ALLOWED_ORIGINS.has(origin)) {
148:     return res.status(403).json({ error: 'origin-not-allowed' });
149:   }
150: 
151:   const provider = cleanText(req.body?.provider);
152:   const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken : '';
153:   if (!['kakao', 'naver'].includes(provider) || !accessToken || accessToken.length > 4096) {
```

## functions/index.js:263-300

```text
263:         githubFilePath = `${PROJECT_PATH}/${match[0]}`;
264:         try {
265:           const { data: fileData } = await octokit.repos.getContent({
266:             owner: GITHUB_OWNER,
267:             repo: GITHUB_REPO,
268:             path: githubFilePath,
269:           });
270:           sourceContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
271:           fileSha = fileData.sha;
272:         } catch (_) {}
273:       }
274:     }
275: 
276:     // Claude에게 분석 + 수정 요청
277:     const prompt = sourceContent
278:       ? `다음 Sentry 에러를 분석하고 수정된 코드를 제공해주세요.
279: 
280: 에러: ${errorTitle}
281: 위치: ${culprit}
282: 메시지: ${errorValue}
283: 파일: ${filename}
284: 
285: 소스 코드:
286: \`\`\`
287: ${sourceContent}
288: \`\`\`
289: 
290: 수정된 전체 파일 코드를 \`\`\`fix 블록 안에 넣고, 수정 이유를 간단히 설명해주세요.`
291:       : `다음 Sentry 에러를 분석해주세요.
292: 
293: 에러: ${errorTitle}
294: 위치: ${culprit}
295: 메시지: ${errorValue}
296: 
297: 원인과 해결 방법을 한국어로 설명해주세요.`;
298: 
299:     const message = await anthropic.messages.create({
300:       model: 'claude-sonnet-4-6',
```

## firestore.rules:1-20

```text
1: rules_version = '2';
2: service cloud.firestore {
3:   match /databases/{database}/documents {
4:     match /logs/{docId} {
5:       allow read, delete: if request.auth != null && request.auth.uid == resource.data.uid;
6:       allow update: if request.auth != null
7:         && request.auth.uid == resource.data.uid
8:         && request.resource.data.uid == resource.data.uid;
9:       allow create: if request.auth != null
10:         && request.auth.uid == request.resource.data.uid
11:         && request.resource.data.keys().hasAll(['uid', 'type', 'timestamp']);
12:     }
13:     match /users/{uid} {
14:       allow read, write: if request.auth != null && request.auth.uid == uid;
15:     }
16:     match /users/{uid}/coachRooms/{roomId} {
17:       allow read, write: if request.auth != null && request.auth.uid == uid;
18:     }
19:   }
20: }
```

## vite.config.js:1-47

```text
1: import { defineConfig } from 'vite'
2: import react from '@vitejs/plugin-react'
3: import { VitePWA } from 'vite-plugin-pwa'
4: 
5: export default defineConfig({
6:   plugins: [
7:     react(),
8:     VitePWA({
9:       registerType: 'autoUpdate',
10:       includeAssets: ['logo-main.png', 'apple-touch-icon.png'],
11:       manifest: {
12:         name: 'Context Health',
13:         short_name: 'Context Health',
14:         description: 'AI 기반 운동·식단 관리',
15:         theme_color: '#ffffff',
16:         background_color: '#ffffff',
17:         display: 'standalone',
18:         orientation: 'portrait',
19:         scope: '/',
20:         start_url: '/',
21:         icons: [
22:           {
23:             src: 'pwa-192x192.png',
24:             sizes: '192x192',
25:             type: 'image/png',
26:           },
27:           {
28:             src: 'pwa-512x512.png',
29:             sizes: '512x512',
30:             type: 'image/png',
31:           },
32:           {
33:             src: 'pwa-512x512.png',
34:             sizes: '512x512',
35:             type: 'image/png',
36:             purpose: 'any maskable',
37:           },
38:         ],
39:       },
40:       workbox: {
41:         cleanupOutdatedCaches: true,
42:         skipWaiting: true,
43:         clientsClaim: true,
44:       },
45:     }),
46:   ],
47: })
```

## tsconfig.json:1-17

```text
1: {
2:   "compilerOptions": {
3:     "target": "ES2020",
4:     "lib": ["ES2020", "DOM", "DOM.Iterable"],
5:     "module": "ESNext",
6:     "moduleResolution": "bundler",
7:     "jsx": "react-jsx",
8:     "strict": true,
9:     "esModuleInterop": true,
10:     "skipLibCheck": true,
11:     "noEmit": true,
12:     "isolatedModules": true,
13:     "allowImportingTsExtensions": true,
14:     "paths": {}
15:   },
16:   "include": ["*.tsx", "*.ts"]
17: }
```
