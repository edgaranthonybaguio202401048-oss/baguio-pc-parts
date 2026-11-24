import { createContext, useContext } from 'react';
import useOnlineStatus from '../hooks/useOnlineStatus';

const NetworkStatusContext = createContext({ online: true });

export function NetworkStatusProvider({ children }) {
  const online = useOnlineStatus();
  return <NetworkStatusContext.Provider value={{ online }}>{children}</NetworkStatusContext.Provider>;
}

export const useNetwork = () => useContext(NetworkStatusContext);
