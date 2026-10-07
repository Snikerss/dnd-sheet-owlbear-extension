import React, { createContext, useContext } from 'react';
import type { Character, CharacterAction } from '../types';

export const CharacterStateContext = createContext<Character | undefined>(undefined);
export const CharacterDispatchContext = createContext<React.Dispatch<CharacterAction> | undefined>(undefined);
export const CharacterIdContext = createContext<string | undefined>(undefined);

export const CharacterProvider: React.FC<{
    children: React.ReactNode;
    character: Character;
    characterId?: string;
    dispatch: React.Dispatch<CharacterAction>;
}> = ({ children, character, characterId, dispatch }) => {
    return (
        <CharacterIdContext.Provider value={characterId}>
            <CharacterDispatchContext.Provider value={dispatch}>
                <CharacterStateContext.Provider value={character}>
                    {children}
                </CharacterStateContext.Provider>
            </CharacterDispatchContext.Provider>
        </CharacterIdContext.Provider>
    );
};

export const useCharacter = (): { character: Character, dispatch: React.Dispatch<CharacterAction> } => {
    const character = useContext(CharacterStateContext);
    const dispatch = useContext(CharacterDispatchContext);
    if (character === undefined || dispatch === undefined) {
        throw new Error('useCharacter must be used within a CharacterProvider');
    }
    return { character, dispatch };
};

export const useCharacterState = (): Character => {
    const context = useContext(CharacterStateContext);
    if (context === undefined) {
        throw new Error('useCharacterState must be used within a CharacterProvider');
    }
    return context;
};

export const useCharacterDispatch = (): React.Dispatch<CharacterAction> => {
    const context = useContext(CharacterDispatchContext);
    if (context === undefined) {
        throw new Error('useCharacterDispatch must be used within a CharacterProvider');
    }
    return context;
};

export const useCharacterId = (): string | undefined => {
    return useContext(CharacterIdContext);
};

