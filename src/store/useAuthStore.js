import { create } from 'zustand';
import api from '../lib/api';

const useAuthStore = create((set) => ({
  user: null,
  loading: true,

  setUser: (user) => set({ user, loading: false }),

  checkAuth: async () => {
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.user, loading: false });
      return data.user;
    } catch {
      set({ user: null, loading: false });
      return null;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    set({ user: null });
  },
}));

export default useAuthStore;
