'use client';

import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';
import { AnimatePresence } from 'framer-motion';
import { ThemeProvider } from 'next-themes';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// 1. Instancie QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 heures, comme mentionné dans project.mdc
    },
  },
});

// 2. Crée le persister pour idb-keyval
const asyncStoragePersister = createAsyncStoragePersister({
  storage: {
    getItem: async (key: string) => {
      const value = await get(key);
      if (value === undefined) return null;
      return JSON.stringify(value);
    },
    setItem: async (key: string, value: string) => {
      await set(key, JSON.parse(value));
    },
    removeItem: async (key: string) => {
      await del(key);
    },
  },
  throttleTime: 1000,
});

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    persistQueryClient({
      queryClient,
      persister: asyncStoragePersister,
      maxAge: 1000 * 60 * 60 * 24, // 24 heures (même que gcTime)
    });
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
    >
      <QueryClientProvider client={queryClient}>
        <AnimatePresence
          mode="wait"
          initial={false}
        >
          {children}
        </AnimatePresence>
        <ToastContainer
          position="bottom-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="dark" // Adapter au thème actuel ou utiliser "colored"
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
} 