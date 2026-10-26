/* 매일 유튜브 운동·식단 영상을 골라 정리하고, 주제별 큐레이터 계정으로 피드에 올린다.
   - 하루 15개: 운동 10 · 식단 5 (2:1)
   - 후보: 아래 채널 RSS(키 필요 없음)에서 최근 45일 영상. 제목으로 운동/식단을 가른다.
   - 큐레이터 계정은 여러 개지만 전부 Context Health가 운영하는 계정이다(이름 옆에 '큐레이터' 표시).
     일반 사용자인 척하지 않는다.
   - 비용: 영상은 낮은 화질로 읽고, 20분 넘는 영상은 AI를 부르기 전에 건너뛴다. AI 시도는 운동 15·식단 8번까지.
   채널은 2026-10-23 유튜브 검색(부위별 루틴·분할·파워리프팅·홈트·식단·레시피 등 45개 검색어) 상위의
   전문 운동·영양 채널에서 골랐다. 바꾸려면 아래 목록만 고친다. */
const { db } = require('./store');
const { importVideo } = require('./youtube');

const LOGO = 'https://context-health-3eb84.web.app/brand/curator.png';

/* 주제별 큐레이터. match로 어떤 글을 누가 올릴지 정한다 (위에서부터 먼저 맞는 계정) */
const CURATORS = [
  { uid: 'contexthealth', handle: 'contexthealth', name: '루틴 소믈리에', bio: '매일 운동 영상을 맛보고, 괜찮은 루틴만 골라 정리해요' },
  { uid: 'ch-legday', handle: 'legday.lab', name: '하체 장인', bio: '스쿼트와 데드리프트로 하루를 여는 하체 루틴 모음', match: (v) => v.kind === 'workout' && (v.parts || []).some((p) => /하체|엉덩이|둔근|햄스트링|대퇴/.test(p)) },
  { uid: 'ch-upper', handle: 'upper.atelier', name: '상체 공방', bio: '가슴·등·어깨·팔, 상체를 깎는 루틴만 모아요', match: (v) => v.kind === 'workout' && (v.parts || []).some((p) => /가슴|등|어깨|팔|이두|삼두|광배/.test(p)) },
  { uid: 'ch-home', handle: 'home.mate', name: '홈트 메이트', bio: '헬스장 못 가는 날, 집에서 하는 루틴', match: (v) => v.kind === 'workout' && v.tags?.place === '홈트' },
  { uid: 'ch-diet', handle: 'diet.sommelier', name: '식단 소믈리에', bio: '하루 식단을 칼로리·탄단지까지 정리해요', match: (v) => v.kind === 'diet' && v.tags?.style !== '요리' },
  { uid: 'ch-protein', handle: 'protein.chef', name: '단백질 요리사', bio: '단백질 챙기는 요리·레시피 모음', match: (v) => v.kind === 'diet' },
];
const CURATOR_UIDS = new Set(CURATORS.map((c) => c.uid));
const CURATOR_UID = CURATORS[0].uid;

function curatorFor(video) {
  /* 홈트 영상은 부위보다 홈트 계정이 먼저 */
  if (video.kind === 'workout' && video.tags?.place === '홈트') return CURATORS.find((c) => c.uid === 'ch-home');
  return CURATORS.find((c) => c.match?.(video)) || CURATORS[0];
}

const DAILY = { workout: 10, diet: 5 };
const MAX_ATTEMPTS = { workout: 15, diet: 8 };
const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const MAX_VIDEO_SEC = 20 * 60;
const CAPTION_MODEL = 'gemini-3.6-flash';

/* 운동 채널 (전문 트레이너·선수·코치·운동 정보) */
const WORKOUT_CHANNELS = [
  'UCK2YrOMgAbsAraGrWyyAvdw', // 헬마드
  'UCRrZ5RYIalHLiHq5ftzxM6A', // 빵느
  'UCDQ94nUOUel-hB4BHCZ6d5w', // 준규빌더
  'UCfDkQiPchwM0F2SkHWl5JYQ', // 빅씨스
  'UC_gEHC1mWLFuhOLAJRMWhHA', // 제로범TV
  'UCMY_lKUu8yGZaVsu_9lPIGg', // 권혁
  'UCFdUNeQPgh9lXdBQD2Id7vg', // 마선호
  'UCF97u_Y5C3FxAcD0nn1DCKQ', // 보통사람을 위한 운동채널
  'UCyqD2niH4wkYYP9RJvJWpdQ', // Allright24 박재훈
  'UCkvTESC-tRmoGf0FdB4FrHA', // 권일황TV
  'UCQgaJQgV7rXqDFz2jYtV-tg', // 조남은튜브
  'UCFdRrYwKThuQyJMahQ3kHxQ', // 김흑구
  'UCXx37HqzrwpX8pg4r93FuYg', // 홍범석
  'UCHTnyIISE7KaJzSNOCriojQ', // 노익스강
  'UC4yq3FWEWqMvFNFBsV3gbKQ', // 힙으뜸
  'UC25Jrhs_3PFabl1jsgRMWSw', // 급진적 과부하
  'UCsrmHdy4lfx2vNWxzMExlcQ', // 웨이트연구소 덕코치
  'UCuwyPNJScQ5luAV7b8juFfg', // 강경원
  'UCSPUdkcss2YsJorc1oR5Z8A', // 헬린이 탈출을 위한 운동정보
  'UC3hRpIQ4x5niJDwjajQSVPg', // 핏블리
  'UC64f2yVYQsU1eILFcf65e7g', // 피지컬프로
  'UCFp1y0HX24IZ2APlhfrj-7w', // 홍코치
  'UCo_-ny9SP5Pbz8KM1KKchbA', // 세계적으로 유명한 운동 정보
  'UC80zFRpqbg1rmuQUbO6HABQ', // 어썸블리스
  'UCMA7GmwOUuvSlM4XUhN2JFA', // 설기관
  'UC9JKcmoTBNMgwz6kxCsZrzA', // 킹유진
  'UCpg89Ys3E4BaLGgEEWVmI9g', // Thankyou BUBU
  'UCon7odDyMxoTl6TclPuW6BA', // 헬스독학 최마루
  'UCkEQJUPvOVX0xNGLFYcTxfg', // 길환TV
  'UCcn3BZE-StqAt7ICai-mUDQ', // 성철봉
  'UCcCgfu0Vw4DeGIkeiCBG7tg', // 헬창극장
  'UCSbcKmsHu4oTT5fu8zvs00w', // 김효정
  'UCzgfDtpCY5OLraeG1q5WSCQ', // 육체미 빅터
  'UCxPh4fDZagQpZycOTV5vYuA', // 알고하는 헬스
  'UCtnbC5PTFo4m6DdVtBpWKxg', // 정대진
  'UCpdHvsuIfxouMHKlf_8wBeA', // 일반인클라쓰 RONIE
  'UCf-dFha4lNsLMgjAFKkWxNA', // 빈지크
  'UCZf4ZESHAIuRtZ-eoMSL97A', // 시즌비시즌
  'UCOcC03WTSNOCoAkCDide6jA', // 이택민 레슨중
  'UCHjEdCXNYyvgWWcCZVTxWHA', // 티벳동생
  'UC2WZ-lHHSOI81g2Jp4BpsWA', // SomiFit
  'UCygs-_iDpCJOnhuCZibK7JQ', // 흑자헬스
  'UCx9XehuwNHLqWPt4U0t0LRA', // 아모띠
  'UCoJaxUg1Ldl3SwZ7ygYewcQ', // 내추럴 우형재
  'UCbv3Yr_3-MFlmsmBc-MmM-Q', // 조신현
  'UC_8DZvwXkPS-_qMiWZmRX-Q', // 박민재
  'UCWjtCgsTFh5CDK9zFNP9ZDg', // 문찬2
  'UCK7CCtKMo0ufc73Quo2QhtQ', // 몸쌤 무브어게인
  'UCI4AlLcjtJzMSD0YkXy4YDA', // 캥거루대흉근
  'UCHqfBzODSC2BV4I5W_Sn4Cg', // 이도황
  'UCGJSAOzT3aPqf7r5Yc-tKgA', // 요무브
  'UCEyXB3mjiTlZXJn_j1aKM7A', // 몬스터짐
  'UCDVQ0yDp7Bu-BxEfelTHL8g', // 바벨라토르 홈트레이닝
  'UCBjM5M3twHZxFNlIi7PcEcA', // 유경's 크로스핏 일기
  'UC6bYE4W9qDix6WPkaigb1Gw', // 관절사용설명서
  'UC3o4BRglM8eQGE_1CIs4LQw', // 피지컬 아카데미
  'UC3YErqSqukm8LFAHWbSJH5w', // 조선팔도 스트렝스
  'UC2O5XovJ_9xLq6xHEopBpeg', // 다비너스
  'UC0GlzP-I8hC6WEodQcyZZZg', // 쇠질연구소
  'UCtOo6qlWgDuV-viEyzAJEvw', // 훈련소장
  'UCpTvH7U04kUj6bXHDEdNWnw', // 아민 역도센터
  'UCoe-0EVDJnjlSoPK8ygcGwQ', // 김종국 GYM JONG KOOK
  'UCoYO98QN8TdC2yUomnfjb7g', // 범헬스
  'UClPIM09mFUz4IOC-eFh8YsA', // 이웃짐 근육이
  'UCh5w1Kziu9ZbZBeejZiNojg', // 진쓰핏
  'UCfvnrRQjKQ4Loljzb7RnwAQ', // 굿머슬
  'UCdtRAcd3L_UpV4tMXCw63NQ', // 피지컬갤러리
  'UCc_jsWiQ05oASf22o5cNGEA', // 지눅햄 홈트
  'UCcQ6Q5Ag-zUZe9Sq27TzVtA', // 운동가이더
  'UCc5mVNF4R6ywMqbty91J0rQ', // 김명섭의 헬스교실
  'UCbGFTnzdMroZ7GKBpke6oiQ', // 일론짐
  'UCZnMj8WWVg5hGn8FdJNvMug', // 보디빌딩 최코치
  'UCYCj45o-8xwjq-OhuGxJcwQ', // 해리 코치
  'UCtMTIcTAXuTo8yKxSiqnPmw', // 운동 정주행 황철순
  'UCbY7nfn_euNV4xMQAUzd60Q', // CHUL SOON HWANG
];

/* 식단 채널 (영양·다이어트 식단·단백질 레시피) */
const DIET_CHANNELS = [
  'UCt1IY1PhDixsM_DE8-ffrSw', // 오늘의 머슬한입
  'UCw2yk4I2yS8LZEpSNaIv2vA', // 건강한서룩
  'UChXDq9Izwq-pTzeUWzwXL3A', // 다이어트 과학자 최겸
  'UCXxnKERQDm7K3rw4HrxCVng', // 다이어터 주양
  'UCE5Q4Oy9GqzERUmI3E18s-A', // 이손
  'UCASzr1oHX4FB4lQPG3LbMYg', // 하이름
  'UCzUV_ldqQyp17-scwBANlsg', // 다영
  'UCzK074kKGq_rjJdG9LBLeoA', // 달달한끼
  'UCfMx-Jad4kstOwa7lPfnl_Q', // 루루식탁
  'UCemFUqq5jad1f258HrPS5rg', // 식탁일기
  'UCtkEW5upwCXDTdppT6GpQ-A', // 뮈식가
  'UCseECCvDryODtIO8WYo__-g', // 편의점 조합원
  'UChC-JX507HKaFttenZ6q2OQ', // 프로틴마스터훈
  'UCbUNWAsGISwidbzNjr3BEiQ', // AllZero다영
  'UCsfbzTSQg2jNpdq5X9-jPAw', // 탄단지혜
  'UCxRSQfYmcVEI5jP3sOwnlpw', // 정희원의 저속노화
  'UCmfQXFXh9EoWpuTyaC3zdwQ', // 오댕구
];

const WORKOUT_WORDS = /루틴|운동|세트|분할|하체|가슴|등\s|광배|어깨|삼두|이두|팔\s|덤벨|바벨|스쿼트|벤치|데드|풀업|홈트|머신|프로그램|코어|엉덩이|힙/;
const DIET_WORDS = /식단|레시피|요리|도시락|먹는|식사|단백질|다이어트\s?음식|편의점|간식|밀프렙|닭가슴살|샐러드|아침밥|저녁/;
const SKIP_WORDS = /브이로그|vlog|먹방|리뷰|언박싱|Q&A|라이브|live|대회|일상|댄스|dance|층간소음|광고|협찬/i;

/* YouTube Data API (YOUTUBE_KEY): 채널의 업로드 목록. 채널 하나에 1단위, 하루 약 100단위로 무료 한도(10,000)의 1% */
async function apiEntries(channelId, key) {
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=10&playlistId=UU${channelId.slice(2)}&key=${key}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((it) => ({
      videoId: it.contentDetails?.videoId,
      title: it.snippet?.title || '',
      published: Date.parse(it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt || ''),
      channelId,
    })).filter((v) => v.videoId);
  } catch {
    return [];
  }
}

/* 영상 길이·퍼가기 허용을 50개씩 한 번에 확인 (AI 부르기 전에 거른다) */
function isoSeconds(iso) {
  const m = String(iso || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + (Number(m[3] || 0) * 60) + Number(m[4] || 0);
}

async function videoMeta(ids, key) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${ids.slice(i, i + 50).join(',')}&key=${key}`);
      const data = await res.json();
      (data.items || []).forEach((v) => {
        out[v.id] = { sec: isoSeconds(v.contentDetails?.duration), embeddable: v.status?.embeddable !== false && v.status?.privacyStatus === 'public' };
      });
    } catch { /* 못 읽으면 기존 확인 방식으로 */ }
  }
  return out;
}

async function channelEntries(channelId, tries = 2) {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko-KR' } });
    if (!res.ok) {
      /* 유튜브가 한꺼번에 많이 부르면 가끔 500을 준다. 잠깐 쉬고 한 번 더 */
      if (res.status >= 500 && tries > 1) { await new Promise((r) => setTimeout(r, 800)); return channelEntries(channelId, tries - 1); }
      return [];
    }
    const xml = await res.text();
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
      const e = m[1];
      return {
        videoId: (e.match(/<yt:videoId>([^<]+)/) || [])[1],
        title: (e.match(/<title>([^<]+)/) || [])[1] || '',
        published: Date.parse((e.match(/<published>([^<]+)/) || [])[1] || ''),
        channelId,
      };
    }).filter((v) => v.videoId);
  } catch {
    return [];
  }
}

/* 채널을 번갈아 가며 최신 영상부터 (한 채널이 피드를 채우지 않게). 제목으로 운동/식단을 가른다. */
async function candidates(youtubeKey) {
  const all = [...new Set([...WORKOUT_CHANNELS, ...DIET_CHANNELS])];
  const dietSet = new Set(DIET_CHANNELS);
  /* 클라우드에서 한꺼번에 부르면 유튜브가 막는다. 하나씩, 조금씩 쉬면서 부른다 */
  const lists = [];
  if (youtubeKey) {
    for (let i = 0; i < all.length; i += 10) lists.push(...await Promise.all(all.slice(i, i + 10).map((id) => apiEntries(id, youtubeKey))));
  } else {
    for (const id of all) {
      lists.push(await channelEntries(id));
      await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
    }
  }
  const now = Date.now();
  const byKind = { workout: [], diet: [] };
  const fresh = lists.map((list) => list
    .filter((v) => now - v.published < MAX_AGE_MS && !SKIP_WORDS.test(v.title))
    .map((v) => ({ ...v, kind: DIET_WORDS.test(v.title) || (dietSet.has(v.channelId) && !WORKOUT_WORDS.test(v.title)) ? 'diet' : WORKOUT_WORDS.test(v.title) ? 'workout' : null }))
    .filter((v) => v.kind)
    .sort((a, b) => b.published - a.published));
  const seen = new Set();
  for (let round = 0; round < 20; round += 1) {
    fresh.forEach((list) => {
      const v = list[round];
      if (v && !seen.has(v.videoId)) { seen.add(v.videoId); byKind[v.kind].push(v); }
    });
  }
  console.log('curation candidates', { channels: all.length, withEntries: lists.filter((l) => l.length).length, workout: byKind.workout.length, diet: byKind.diet.length });
  return byKind;
}

async function ensureCuratorProfiles() {
  const batch = db().batch();
  for (const c of CURATORS) {
    const ref = db().doc(`profiles/${c.uid}`);
    const exists = (await ref.get()).exists;
    batch.set(ref, {
      handle: c.handle, name: c.name, bio: c.bio, color: '#7171FF', photoUrl: LOGO, official: true,
      ...(exists ? {} : { createdAt: Date.now() }),
      visibility: { workout: false, best: false, diet: false, weight: false },
    }, { merge: true });
    batch.set(db().doc(`handles/${c.handle}`), { uid: c.uid });
  }
  await batch.commit();
}

/* 피드 글: 1~4줄을 무작위로. 광고 말투가 아니라 운동·식단 좋아하는 사람이 친구에게 추천하듯. */
async function writeCaption(video, { apiKey, upstreamBase }) {
  const lines = 1 + Math.floor(Math.random() * 4);
  const body = video.kind === 'diet'
    ? `정리된 식단: ${video.routineTitle} — ${(video.meals || []).map((m) => `${m.name}: ${m.foods.map((f) => f.name).join(', ')}`).join(' / ')} (총 ${video.totals?.kcal}kcal, 단백질 ${video.totals?.protein}g)`
    : `정리된 루틴: ${video.routineTitle} — ${(video.items || []).map((it) => `${it.name} ${it.sets}세트 ${it.reps}`).join(', ')}`;
  const who = video.kind === 'diet' ? '식단 관리를 오래 한 사람' : '헬스를 오래 한 사람';
  const prompt = `${who}이 운동 앱 피드에 짧은 글을 올린다. 아래 유튜브 ${video.kind === 'diet' ? '식단' : '루틴'}을 보고 정확히 ${lines}줄로 써라.
규칙:
- 줄마다 한 문장. 줄은 줄바꿈(\\n)으로 나눈다. 전체 ${lines * 45}자 이내.
- 친구에게 말하듯 ~해요체. 직접 해 본 사람처럼 구체적으로 (언제 하면/먹으면 좋은지, 느낌, 주의할 점, 구성의 의도 중에서 골라서).
- 종목·음식 이름은 두 개까지만 언급하고 나열하지 않는다.
- 광고·홍보 말투 금지: "지금 바로", "꼭 해보세요", "강력 추천", "놓치지 마세요", "최고의" 같은 말, 해시태그, 느낌표 남발, 이모지 금지.
- 영상 제작자 칭찬이나 "이 영상" 같은 말로 시작하지 않는다. 첫 줄의 시작을 매번 다르게.
영상 제목: ${video.title}
채널: ${video.channelName}
${body}
팁: ${(video.tips || []).join(' / ')}
JSON으로만 답: {"caption": "..."}`;
  try {
    const res = await fetch(`${upstreamBase}/models/${CAPTION_MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.9 } }),
    });
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).find((p) => !p.thought && p.text)?.text || '';
    const caption = String(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).caption || '')
      .split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4).join('\n');
    return caption.slice(0, 200) || video.summary || '';
  } catch {
    return video.summary || '';
  }
}

/* 태그 없이 정리된 예전 영상: 제목·채널·종목만 보고 태그를 붙인다 (텍스트만 써서 값싸다) */
async function backfillTags({ apiKey, upstreamBase, log }) {
  const snap = await db().collection('feedPosts').where('curated', '==', true).get();
  const ids = [...new Set(snap.docs.map((d) => d.data().videoId))];
  for (const id of ids) {
    const ref = db().doc(`youtubeRoutines/${id}`);
    const v = (await ref.get()).data();
    if (!v || v.tags?.audience) continue;
    const prompt = `운동 앱이 유튜브 운동 영상을 분류한다. JSON으로만 답: {"level":"초급|중급|상급","place":"헬스장|홈트","goals":["다이어트|근비대|근력|체력|관절·재활 중 해당"],"audience":"여성|남성|무관"}
audience는 제목·채널이 분명히 한 성별을 대상으로 할 때만(예: "여자", "여성", "남자") 정하고 아니면 무관.
place는 맨몸·매트·집에서 하는 운동이면 홈트, 머신·바벨·케이블이 있으면 헬스장.
제목: ${v.title}
채널: ${v.channelName}
종목: ${(v.items || []).map((i) => i.name).join(', ')}`;
    try {
      const res = await fetch(`${upstreamBase}/models/${CAPTION_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
      });
      const data = await res.json();
      const text = (data?.candidates?.[0]?.content?.parts || []).find((p) => !p.thought && p.text)?.text || '';
      const t = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      const pick = (x, allowed) => (allowed.includes(x) ? x : null);
      await ref.update({
        kind: v.kind || 'workout',
        tags: {
          level: pick(t.level, ['초급', '중급', '상급']),
          place: pick(t.place, ['헬스장', '홈트']),
          goals: (Array.isArray(t.goals) ? t.goals : []).map(String).slice(0, 4),
          audience: pick(t.audience, ['여성', '남성', '무관']) || '무관',
          style: null,
        },
      });
      /* 태그가 생기면 주제에 맞는 큐레이터로 다시 맞춘다 (예: 홈트 → 홈트 메이트) */
      const fresh = (await ref.get()).data();
      const owner = curatorFor({ kind: 'workout', ...fresh });
      await Promise.all(snap.docs.filter((d) => d.data().videoId === id).map((d) => d.ref.update({ uid: owner.uid })));
      log('tags', id, t.audience, t.place, owner.uid);
    } catch (error) {
      log('tags-fail', id, error.message);
    }
  }
}

/* 예전 방식으로 올라간 큐레이션 글 정리: 새 글로 다시 쓰고, 주제에 맞는 큐레이터 계정으로 옮긴다 */
async function migrateOld({ apiKey, upstreamBase, log }) {
  const snap = await db().collection('feedPosts').where('uid', '==', CURATOR_UID).get();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.captionV2 && d.curatorV2) continue;
    const v = await db().doc(`youtubeRoutines/${d.videoId}`).get();
    if (!v.exists) continue;
    const video = { kind: 'workout', ...v.data() };
    const patch = { curatorV2: true, uid: curatorFor(video).uid, kind: video.kind };
    if (!d.captionV2) { patch.caption = await writeCaption(video, { apiKey, upstreamBase }); patch.captionV2 = true; }
    await doc.ref.update(patch);
    log('migrate', d.videoId, patch.uid);
  }
}

/* 하루 한 번 실행. 이미 정리한 영상(성공·실패 모두)은 다시 보지 않는다. */
async function runCuration({ apiKey, upstreamBase, youtubeKey, log = console.log }) {
  await ensureCuratorProfiles();
  await backfillTags({ apiKey, upstreamBase, log });
  await migrateOld({ apiKey, upstreamBase, log });
  const byKind = await candidates(youtubeKey);
  /* 길이·퍼가기 허용을 먼저 확인해 AI를 부를 영상만 남긴다 */
  if (youtubeKey) {
    const meta = await videoMeta([...byKind.workout, ...byKind.diet].map((v) => v.videoId), youtubeKey);
    ['workout', 'diet'].forEach((k) => {
      byKind[k] = byKind[k].filter((v) => {
        const m = meta[v.videoId];
        return !m || (m.embeddable && m.sec > 0 && m.sec <= MAX_VIDEO_SEC);
      });
    });
    log('after meta filter', { workout: byKind.workout.length, diet: byKind.diet.length });
  }
  const result = { posted: { workout: 0, diet: 0 }, tried: { workout: 0, diet: 0 } };
  let order = 0;
  for (const kind of ['workout', 'diet']) {
    const list = byKind[kind];
    const seen = list.length ? await db().getAll(...list.map((v) => db().doc(`youtubeRoutines/${v.videoId}`))) : [];
    const fresh = list.filter((_, i) => !seen[i].exists);
    log('fresh', kind, fresh.length, 'of', list.length);
    for (const v of fresh) {
      if (result.posted[kind] >= DAILY[kind] || result.tried[kind] >= MAX_ATTEMPTS[kind]) break;
      result.tried[kind] += 1;
      try {
        const video = await importVideo(v.videoId, { apiKey, upstreamBase, maxSec: MAX_VIDEO_SEC, rememberTooLong: false, kind, dietFallback: false });
        const curator = curatorFor({ kind, ...video });
        await db().collection('feedPosts').add({
          uid: curator.uid,
          videoId: video.videoId,
          caption: await writeCaption({ kind, ...video }, { apiKey, upstreamBase }),
          captionV2: true,
          curatorV2: true,
          curated: true,
          kind,
          /* 올린 시각을 조금씩 벌려 피드에서 한꺼번에 몰리지 않게 */
          at: Date.now() - order * 7 * 60000,
        });
        order += 1;
        result.posted[kind] += 1;
        log('curated', kind, v.videoId, curator.name, video.routineTitle);
      } catch (error) {
        /* AI를 부르기 전에 걸러진 영상(너무 김, 퍼가기 막힘)은 시도로 세지 않는다 */
        if (error.code === 'too-long' || error.code === 'video-unavailable') result.tried[kind] -= 1;
        log('skip', kind, v.videoId, error.code || error.message);
      }
    }
  }
  return result;
}

module.exports = { CURATOR_UID, CURATOR_UIDS, CURATORS, runCuration };
