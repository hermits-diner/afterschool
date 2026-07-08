import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getToken, setToken, User, Role } from '../lib/api';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, role?: Role) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => {
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string, role?: Role) {
    const r = await api.post<{ token: string; user: User }>('/auth/login', {
      username,
      password,
      role,
    });
    setToken(r.token);
    setUser(r.user);
    return r.user;
  }

  function logout() {
    api.post('/auth/logout').catch(() => {});
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
