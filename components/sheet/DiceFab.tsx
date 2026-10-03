import React from 'react';

interface DiceFabProps {
    onOpen: () => void;
}

export const DiceFab: React.FC<DiceFabProps> = ({ onOpen }) => (
    <button
        onClick={onOpen}
        className="dice-fab fixed bottom-24 right-6 md:bottom-6 md:right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-r from-teal-500 to-emerald-600 text-white flex items-center justify-center shadow-[0_0_15px_rgba(20,184,166,0.5)] hover:shadow-[0_0_25px_rgba(20,184,166,0.8)] md:hover:scale-110 active:scale-95 transition-transform duration-150 border border-teal-400/30 group"
        data-tooltip="Открыть универсальный бросок кубиков"
        aria-label="Открыть универсальный бросок кубиков"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-7 h-7 transform group-hover:rotate-12 transition-transform duration-200"
            viewBox="0 0 100 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
        >
            <polygon points="50,0 93.3,25 93.3,75 50,100 6.7,75 6.7,25" fill="none" stroke="currentColor" strokeWidth="4" />
            <polygon points="50,30 93.3,25 50,0" fill="none" stroke="currentColor" strokeWidth="3" />
            <polygon points="50,30 6.7,25 50,0" fill="none" stroke="currentColor" strokeWidth="3" />
            <polygon points="50,30 50,70 93.3,75" fill="none" stroke="currentColor" strokeWidth="3" />
            <polygon points="50,30 50,70 6.7,75" fill="none" stroke="currentColor" strokeWidth="3" />
            <polygon points="50,70 93.3,75 50,100" fill="none" stroke="currentColor" strokeWidth="3" />
            <polygon points="50,70 6.7,75 50,100" fill="none" stroke="currentColor" strokeWidth="3" />
            <polygon points="6.7,25 50,30 6.7,75" fill="none" stroke="currentColor" strokeWidth="3" />
            <polygon points="93.3,25 50,30 93.3,75" fill="none" stroke="currentColor" strokeWidth="3" />
            <text x="50" y="58" textAnchor="middle" fill="currentColor" className="text-xl font-extrabold font-mono tracking-tighter" strokeWidth="0">20</text>
        </svg>
    </button>
);
