import React, { useState } from 'react';
import HomeScreen from './components/screens/HomeScreen';
import WorkoutMemoScreen from './components/screens/WorkoutMemoScreen';
import Toast from './components/common/Toast';

function App() {
  const [screen, setScreen] = useState("home");
  const [showToast, setShowToast] = useState(false);
  const [memoKey, setMemoKey] = useState(0);
  const [editingLog, setEditingLog] = useState(null);

  function handleSaveMemo() {
    setScreen("home");
    setEditingLog(null);
    setShowToast(true);
    setMemoKey(k => k + 1);
    setTimeout(() => setShowToast(false), 3000);
  }

  function handleCardClick(data) {
    setEditingLog(data);
    setMemoKey(k => k + 1);
    setScreen("memo");
  }

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <div className={`screen screen-home${screen !== "home" ? " pushed" : ""}`}>
        <HomeScreen onNavigateToMemo={() => { setEditingLog(null); setMemoKey(k => k + 1); setScreen("memo"); }} onCardClick={handleCardClick} />
      </div>
      <div className={`screen screen-memo${screen === "memo" ? " active" : ""}`}>
        <WorkoutMemoScreen key={memoKey} onBack={() => setScreen("home")} onSave={handleSaveMemo} initialData={editingLog} />
      </div>
      <Toast show={showToast} message="메모가 저장되었습니다" />
    </div>
  );
}

export default App;
