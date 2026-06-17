import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const flash = useCallback((message, error = false) => {
    setToast({ message, error });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <ToastCtx.Provider value={flash}>
      {children}
      {toast && (
        <div className={`toast${toast.error ? ' toast--error' : ''}`} role="status">
          {toast.message}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
