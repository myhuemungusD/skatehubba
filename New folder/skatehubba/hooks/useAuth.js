import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading and no user initially
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  }, []);

  const signIn = async () => {
    try {
      // Demo sign in - simulate successful authentication
      console.log('Demo sign in successful');
      setUser({ uid: 'demo-user', email: 'demo@skatehubba.com', displayName: 'Demo User' });
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const signOut = async () => {
    try {
      setUser(null);
      console.log('Demo sign out successful');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
