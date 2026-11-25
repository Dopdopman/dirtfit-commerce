'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiRequest,
  clearAccessToken,
  refreshAccessTokenSingleFlight,
  setAccessToken,
} from '@/lib/api-client';
import { DEFAULT_RIDER_PROFILE } from '@/lib/simulator-helpers';
import { useI18n } from '@/providers/I18nProvider';

const AuthContext = createContext(null);
const RiderProfileContext = createContext(null);
const CartContext = createContext(null);

const RIDER_PROFILE_STORAGE_KEY = 'dirtfit_guest_rider_profile_v1';

/**
 * Global Storefront Providers: Auth (in-memory JWT + cookie refresh), RiderProfile, and Persistent Cart.
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @returns {import('react').JSX.Element}
 */
export default function AppProviders({ children }) {
  const { t } = useI18n();
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [riderProfile, setRiderProfileState] = useState(DEFAULT_RIDER_PROFILE);
  const [cart, setCart] = useState(null);
  const [cartLoading, setCartLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, tone = 'info') => {
    setToast({ message, tone, id: Date.now() });
    setTimeout(() => {
      setToast((prev) => (prev && Date.now() - prev.id >= 3400 ? null : prev));
    }, 3600);
  }, []);

  const refreshCart = useCallback(async () => {
    setCartLoading(true);
    try {
      const data = await apiRequest('/api/v1/cart', { skipAuthRetry: false });
      setCart(data?.cart ?? null);
    } catch {
      // Guest cart might not exist yet or API is temporarily waking
    } finally {
      setCartLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest('/api/v1/auth/me');
      setUser(data?.user ?? null);
      return data?.user ?? null;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RIDER_PROFILE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.heightCm === 'number' && typeof parsed.weightKg === 'number') {
          setRiderProfileState((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {
      // Ignore invalid local storage state
    }

    let mounted = true;
    (async () => {
      const token = await refreshAccessTokenSingleFlight();
      if (!mounted) return;
      if (token) {
        try {
          const meData = await apiRequest('/api/v1/auth/me', { skipAuthRetry: true });
          if (mounted) {
            setUser(meData?.user ?? null);
            const defaultProfile = meData?.user?.bodyProfiles?.find((p) => p.isDefault);
            if (defaultProfile) {
              setRiderProfileState((prev) => ({
                ...prev,
                heightCm: defaultProfile.heightCm,
                weightKg: defaultProfile.weightKg,
                inseamCm: defaultProfile.inseamCm ?? null,
                gender: defaultProfile.gender ?? prev.gender,
                bodyProportion: defaultProfile.bodyProportion ?? prev.bodyProportion,
                footwear: defaultProfile.footwear ?? prev.footwear,
                ridingExperience: defaultProfile.ridingExperience ?? prev.ridingExperience,
              }));
            }
          }
        } catch {
          if (mounted) setUser(null);
        }
      }
      if (mounted) {
        setAuthReady(true);
        await refreshCart();
      }
    })();

    return () => {
      mounted = false;
    };
  }, [refreshCart]);

  const setRiderProfile = useCallback((updater) => {
    setRiderProfileState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      try {
        window.localStorage.setItem(RIDER_PROFILE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  const login = useCallback(
    async ({ email, password }) => {
      const data = await apiRequest('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password },
        skipAuthRetry: true,
      });
      setAccessToken(data.accessToken);
      const hydratedUser = await refreshUser();
      await refreshCart();
      return hydratedUser ?? data.user;
    },
    [refreshCart, refreshUser]
  );

  const register = useCallback(
    async ({ email, password, fullName, phone }) => {
      const payload = { email, password, fullName };
      if (phone) payload.phone = phone;
      const data = await apiRequest('/api/v1/auth/register', {
        method: 'POST',
        body: payload,
        skipAuthRetry: true,
      });
      setAccessToken(data.accessToken);
      setUser(data.user);
      await refreshCart();
      return data.user;
    },
    [refreshCart]
  );

  const completeOAuthLogin = useCallback(
    async (ticket) => {
      const data = await apiRequest('/api/v1/auth/oauth/exchange', {
        method: 'POST',
        body: { ticket },
        skipAuthRetry: true,
      });
      setAccessToken(data.accessToken);
      const hydratedUser = await refreshUser();
      const activeUser = hydratedUser ?? data.user;
      const defaultProfile = activeUser?.bodyProfiles?.find((p) => p.isDefault);
      if (defaultProfile) {
        setRiderProfileState((prev) => ({
          ...prev,
          heightCm: defaultProfile.heightCm,
          weightKg: defaultProfile.weightKg,
          inseamCm: defaultProfile.inseamCm ?? null,
          gender: defaultProfile.gender ?? prev.gender,
          bodyProportion: defaultProfile.bodyProportion ?? prev.bodyProportion,
          footwear: defaultProfile.footwear ?? prev.footwear,
          ridingExperience: defaultProfile.ridingExperience ?? prev.ridingExperience,
        }));
      }
      await refreshCart();
      return {
        user: activeUser,
        returnTo: data.returnTo || '/account',
      };
    },
    [refreshCart, refreshUser]
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/v1/auth/logout', { method: 'POST', body: {} });
    } catch {
      // Clear local session regardless
    } finally {
      clearAccessToken();
      setUser(null);
      await refreshCart();
    }
  }, [refreshCart]);

  const addItem = useCallback(
    async (payload) => {
      const data = await apiRequest('/api/v1/cart/items', {
        method: 'POST',
        body: payload,
      });
      setCart(data.cart);
      showToast(t('toasts.addedToCart'), 'success');
      return data.cart;
    },
    [showToast, t]
  );

  const addComboBundle = useCallback(
    async ({ bikeId, accessoryIds, quantity = 1 }) => {
      const data = await apiRequest('/api/v1/cart/items', {
        method: 'POST',
        body: { bikeId, accessoryIds, quantity },
      });
      setCart(data.cart);
      showToast(t('toasts.addedBundleToCart', { count: accessoryIds?.length ?? 0 }), 'success');
      return data.cart;
    },
    [showToast, t]
  );

  const updateItemQty = useCallback(async (itemId, quantity) => {
    const data = await apiRequest(`/api/v1/cart/items/${itemId}`, {
      method: 'PATCH',
      body: { quantity },
    });
    setCart(data.cart);
    return data.cart;
  }, []);

  const removeItem = useCallback(async (itemId) => {
    const data = await apiRequest(`/api/v1/cart/items/${itemId}`, {
      method: 'DELETE',
    });
    setCart(data.cart);
    return data.cart;
  }, []);

  const clearCart = useCallback(async () => {
    const data = await apiRequest('/api/v1/cart', { method: 'DELETE' });
    setCart(data.cart);
    return data.cart;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        login,
        register,
        completeOAuthLogin,
        logout,
        refreshUser,
      }}
    >
      <RiderProfileContext.Provider value={{ riderProfile, setRiderProfile }}>
        <CartContext.Provider
          value={{
            cart,
            cartLoading,
            refreshCart,
            addItem,
            addComboBundle,
            updateItemQty,
            removeItem,
            clearCart,
            showToast,
          }}
        >
          {children}
          {toast && (
            <div
              role="status"
              className="fixed bottom-5 right-5 z-50 border border-line-strong bg-ink px-4 py-3 text-sm font-medium text-surface shadow-sm"
            >
              {toast.message}
            </div>
          )}
        </CartContext.Provider>
      </RiderProfileContext.Provider>
    </AuthContext.Provider>
  );
}

/**
 * Access authenticated user session and auth actions.
 * @returns {object}
 */
export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Access shared Rider Fit body measurements across Quick Fit Bar, Catalog, Simulator, and Compare.
 * @returns {object}
 */
export function useRiderProfile() {
  return useContext(RiderProfileContext);
}

/**
 * Access persistent cart state and mutation actions.
 * @returns {object}
 */
export function useCart() {
  return useContext(CartContext);
}
