import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const ACTIVE_GROUP_KEY = "crictrack_active_group";
const ACTIVE_GROUP_NAME_KEY = "crictrack_active_group_name";

const ActiveGroupContext = createContext(null);

export function ActiveGroupProvider({ children }) {
  const [activeGroupId, setActiveGroupId] = useState(
    () => localStorage.getItem(ACTIVE_GROUP_KEY) || "",
  );
  const [activeGroupName, setActiveGroupName] = useState(
    () => localStorage.getItem(ACTIVE_GROUP_NAME_KEY) || "",
  );

  // Keep state in sync if another tab changes localStorage.
  useEffect(() => {
    const sync = () => {
      setActiveGroupId(localStorage.getItem(ACTIVE_GROUP_KEY) || "");
      setActiveGroupName(localStorage.getItem(ACTIVE_GROUP_NAME_KEY) || "");
    };

    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const switchGroup = useCallback((id, name) => {
    setActiveGroupId(id);
    setActiveGroupName(name);
    localStorage.setItem(ACTIVE_GROUP_KEY, id);
    localStorage.setItem(ACTIVE_GROUP_NAME_KEY, name);
  }, []);

  return (
    <ActiveGroupContext.Provider
      value={{ activeGroupId, activeGroupName, switchGroup }}
    >
      {children}
    </ActiveGroupContext.Provider>
  );
}

export function useActiveGroup() {
  const ctx = useContext(ActiveGroupContext);
  if (!ctx)
    throw new Error("useActiveGroup must be used inside ActiveGroupProvider");
  return ctx;
}
