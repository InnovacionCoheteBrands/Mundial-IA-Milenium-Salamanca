import { createContext, useContext, useState, type ReactNode } from "react";
import type { TeamId } from "@shared/schema";

interface AppState {
  selectedTeam: TeamId | null;
  capturedImage: string | null;
  transformedImage: string | null;
  isProcessing: boolean;
  error: string | null;
}

interface AppContextType extends AppState {
  setSelectedTeam: (team: TeamId | null) => void;
  setCapturedImage: (image: string | null) => void;
  setTransformedImage: (image: string | null) => void;
  setIsProcessing: (processing: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState: AppState = {
  selectedTeam: null,
  capturedImage: null,
  transformedImage: null,
  isProcessing: false,
  error: null,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);

  const setSelectedTeam = (team: TeamId | null) => {
    setState((prev) => ({ ...prev, selectedTeam: team }));
  };

  const setCapturedImage = (image: string | null) => {
    setState((prev) => ({ ...prev, capturedImage: image }));
  };

  const setTransformedImage = (image: string | null) => {
    setState((prev) => ({ ...prev, transformedImage: image }));
  };

  const setIsProcessing = (processing: boolean) => {
    setState((prev) => ({ ...prev, isProcessing: processing }));
  };

  const setError = (error: string | null) => {
    setState((prev) => ({ ...prev, error: error }));
  };

  const reset = () => {
    setState(initialState);
  };

  return (
    <AppContext.Provider
      value={{
        ...state,
        setSelectedTeam,
        setCapturedImage,
        setTransformedImage,
        setIsProcessing,
        setError,
        reset,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
