import React, { useState } from 'react';
import HomeScreen from './components/screens/HomeScreen';
import WorkoutMemoScreen from './components/screens/WorkoutMemoScreen';
import Toast from './components/common/Toast';

import DietDetailScreen from './components/screens/DietDetailScreen';

function App() {
  const [screen, setScreen] = useState("home");
  const [showToast, setShowToast] = useState(false);
  const [memoKey, setMemoKey] = useState(0);
  const [dietKey, setDietKey] = useState(0);
  const [editingLog, setEditingLog] = useState(null);
  const [editingDietLog, setEditingDietLog] = useState(null);

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

  function handleSaveDiet() {
    setScreen("home");
    setEditingDietLog(null);
    setShowToast(true);
    setDietKey(k => k + 1);
    setTimeout(() => setShowToast(false), 3000);
  }

  function handleDietCardClick(data) {
    setEditingDietLog(data);
    setDietKey(k => k + 1);
    setScreen("diet-detail");
  }

  return (
    <div className="min-h-screen bg-[#f1f3f5] flex justify-center items-start sm:items-center">
      <div className="w-full max-w-[430px] h-screen bg-white relative overflow-hidden shadow-2xl">
        <div className={`screen screen-home${screen !== "home" ? " pushed" : ""}`}>
          <HomeScreen 
            onNavigateToMemo={() => { setEditingLog(null); setMemoKey(k => k + 1); setScreen("memo"); }} 
            onCardClick={handleCardClick} 
            onDietCardClick={handleDietCardClick}
          />
        </div>
        <div className={`screen screen-memo${screen === "memo" ? " active" : ""}`}>
          <WorkoutMemoScreen key={`memo-${memoKey}`} onBack={() => setScreen("home")} onSave={handleSaveMemo} initialData={editingLog} />
        </div>
        <div className={`screen screen-diet${screen === "diet-detail" ? " active" : ""}`}>
          <DietDetailScreen key={`diet-${dietKey}`} onBack={() => setScreen("home")} onSave={handleSaveDiet} initialData={editingDietLog} />
        </div>
        <Toast show={showToast} message="저장되었습니다" />
      </div>
    </div>
  );
}

export default App;
