import React, { useEffect } from 'react';
import OBR from '@owlbear-rodeo/sdk';

export const RollPopup: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const playerName = params.get('playerName') || 'Игрок';
  const characterName = params.get('characterName') || 'Персонаж';
  const rollName = params.get('rollName') || 'Бросок';
  const total = params.get('total') || '0';
  const rollDetails = params.get('rollDetails') || '';

  useEffect(() => {
    // Automatically close the popover after 5.5 seconds
    const timer = setTimeout(() => {
      OBR.popover.close('com.antigravity.dnd-sheet/roll-popup');
    }, 5500);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    OBR.popover.close('com.antigravity.dnd-sheet/roll-popup');
  };

  return (
    <div className="w-full h-full bg-[#1a202c]/95 border border-[#4fd1c5]/30 rounded-2xl p-4 flex flex-col items-center justify-between text-white font-sans overflow-hidden select-none shadow-[0_0_30px_rgba(79,209,197,0.25)] relative backdrop-blur-md">
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors p-1"
        aria-label="Закрыть"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Roller Name */}
      <div className="text-center w-full mt-1">
        <span className="text-[10px] text-teal-400 font-bold uppercase tracking-widest bg-teal-950/50 px-2.5 py-0.5 rounded border border-teal-900/30 truncate max-w-full inline-block">
          {playerName}
        </span>
      </div>

      {/* 3D-like spinning Dice visual */}
      <div className="relative w-32 h-32 flex items-center justify-center my-1">
        {/* Glowing aura */}
        <div className="absolute inset-2 bg-teal-500/10 rounded-full blur-xl animate-pulse" />
        
        {/* SVG d20 icon settling */}
        <svg 
          className="w-full h-full text-slate-800 animate-roll-settle filter drop-shadow-[0_0_15px_rgba(79,209,197,0.45)]"
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 100 100"
        >
          <polygon points="50,2 95,26 95,74 50,98 5,74 5,26" fill="#1e293b" stroke="#4fd1c5" strokeWidth="3" />
          <polygon points="50,32 88,54 12,54" fill="#334155" stroke="#4fd1c5" strokeWidth="1.5" />
          <line x1="50" y1="2" x2="50" y2="32" stroke="#4fd1c5" strokeWidth="1.5" />
          <line x1="95" y1="26" x2="88" y2="54" stroke="#4fd1c5" strokeWidth="1.5" />
          <line x1="5" y1="26" x2="12" y2="54" stroke="#4fd1c5" strokeWidth="1.5" />
          <line x1="95" y1="74" x2="88" y2="54" stroke="#4fd1c5" stroke-width="1.5" />
          <line x1="5" y1="74" x2="12" y2="54" stroke="#4fd1c5" stroke-width="1.5" />
          <line x1="50" y1="98" x2="50" y2="76" stroke="#4fd1c5" stroke-width="1.5" />
          <line x1="12" y1="54" x2="50" y2="76" stroke="#4fd1c5" strokeWidth="1.5" />
          <line x1="88" y1="54" x2="50" y2="76" stroke="#4fd1c5" stroke-width="1.5" />
          <line x1="50" y1="32" x2="5" y2="26" stroke="#4fd1c5" stroke-width="1.5" />
          <line x1="50" y1="32" x2="95" y2="26" stroke="#4fd1c5" stroke-width="1.5" />
          <line x1="12" y1="54" x2="5" y2="74" stroke="#4fd1c5" stroke-width="1.5" />
          <line x1="88" y1="54" x2="95" y2="74" stroke="#4fd1c5" stroke-width="1.5" />
          <line x1="50" y1="76" x2="5" y2="74" stroke="#4fd1c5" stroke-width="1.5" />
          <line x1="50" y1="76" x2="95" y2="74" stroke="#4fd1c5" stroke-width="1.5" />
        </svg>

        {/* Big roll number in the center of the d20 */}
        <div className="absolute inset-0 flex items-center justify-center mt-[-4px]">
          <span className="text-4xl font-black text-teal-300 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] tracking-tight">
            {total}
          </span>
        </div>
      </div>

      {/* Roll Details Footer */}
      <div className="text-center w-full mb-1">
        <h4 className="text-xs font-bold text-slate-100 truncate">{characterName}</h4>
        <p className="text-[10px] text-slate-400 truncate mt-0.5">{rollName}</p>
        <p className="text-[9px] text-teal-400 font-mono truncate mt-0.5 max-w-full px-2">
          {rollDetails}
        </p>
      </div>
    </div>
  );
};
