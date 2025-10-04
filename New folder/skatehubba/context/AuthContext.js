import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ROLES } from '../utils/roles';
import { analyticsService, EventCategory } from '../services/analytics';

const AuthContext = createContext({
  user: null,
  userRole: ROLES.USER,
  isLoading: true,
  isAuthenticated: false,
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(ROLES.USER);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      try {
        if (user) {
          // Get user data from Firestore including role
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const userData = userDoc.data();
          const role = userData?.role || ROLES.USER;
          
          setUser(user);
          setUserRole(role);

          // Set analytics user properties
          await analyticsService.setUserProperties(user.uid, {
            role,
            email: user.email,
            displayName: user.displayName,
            ...userData,
          });

          // Log login event
          await analyticsService.logLogin('firebase', user.uid);
        } else {
          setUser(null);
          setUserRole(ROLES.USER);
          
          // Clear analytics user
          await analyticsService.setUserProperties(null);
        }
      } catch (error) {
        console.error('Auth state change error:', error);
        analyticsService.logError(error, {
          category: EventCategory.AUTH,
          action: 'auth_state_change',
        });
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    userRole,
    isLoading,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
