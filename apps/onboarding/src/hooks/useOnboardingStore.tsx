"use client";

import { createContext, useContext, useReducer, useEffect, ReactNode } from "react";

export type OnboardingState = {
  fullName: string;
  email: string;
  phoneNumber: string;
  currentStep: number;
  emailVerified: boolean;
  phoneVerified: boolean;
};

type OnboardingAction =
  | { type: "SET_FULL_NAME"; payload: string }
  | { type: "SET_EMAIL"; payload: string }
  | { type: "SET_PHONE"; payload: string }
  | { type: "SET_STEP"; payload: number }
  | { type: "SET_EMAIL_VERIFIED"; payload: boolean }
  | { type: "SET_PHONE_VERIFIED"; payload: boolean }
  | { type: "HYDRATE"; payload: OnboardingState }
  | { type: "RESET" };

const initialState: OnboardingState = {
  fullName: "",
  email: "",
  phoneNumber: "",
  currentStep: 1,
  emailVerified: false,
  phoneVerified: false,
};

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case "SET_FULL_NAME":
      return { ...state, fullName: action.payload };
    case "SET_EMAIL":
      return { ...state, email: action.payload };
    case "SET_PHONE":
      return { ...state, phoneNumber: action.payload };
    case "SET_STEP":
      return { ...state, currentStep: action.payload };
    case "SET_EMAIL_VERIFIED":
      return { ...state, emailVerified: action.payload };
    case "SET_PHONE_VERIFIED":
      return { ...state, phoneVerified: action.payload };
    case "HYDRATE":
      return { ...action.payload };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

const OnboardingContext = createContext<{
  state: OnboardingState;
  dispatch: React.Dispatch<OnboardingAction>;
}>({ state: initialState, dispatch: () => null });

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(onboardingReducer, initialState);

  // Load from session storage on mount
  useEffect(() => {
    const savedState = sessionStorage.getItem("nodiox_onboarding");
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        dispatch({ type: "HYDRATE", payload: parsed });
      } catch (e) {
        console.error("Failed to parse onboarding state from sessionStorage");
      }
    }
  }, []);

  // Save to session storage on change
  useEffect(() => {
    sessionStorage.setItem("nodiox_onboarding", JSON.stringify(state));
  }, [state]);

  return (
    <OnboardingContext.Provider value={{ state, dispatch }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}
