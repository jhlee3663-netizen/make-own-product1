/* 도구 구현에 넘기는 Firestore 조회 전용 창구. get 계열만 노출하므로
   도구 코드가 실수로라도 문서를 쓰거나 지울 수 없다. */
function readOnlyQuery(query) {
  return {
    where: (...args) => readOnlyQuery(query.where(...args)),
    orderBy: (...args) => readOnlyQuery(query.orderBy(...args)),
    limit: (...args) => readOnlyQuery(query.limit(...args)),
    get: () => query.get(),
  };
}

function readOnlyDb(db) {
  return {
    collection: path => readOnlyQuery(db.collection(path)),
    doc: path => ({ get: () => db.doc(path).get() }),
  };
}

module.exports = { readOnlyDb };
