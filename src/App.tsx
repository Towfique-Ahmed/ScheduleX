import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Compose from './pages/Compose';
import Posts from './pages/Posts';
import Calendar from './pages/Calendar';
import Analytics from './pages/Analytics';
import Accounts from './pages/Accounts';
import Queue from './pages/Queue';
import Library from './pages/Library';
import Categories from './pages/Categories';
import Team from './pages/Team';
import Approvals from './pages/Approvals';
import SignIn from './pages/SignIn';
import { AppProvider, useApp } from './context/AppContext';
import { useAuth } from './context/AuthContext';

function Shell() {
  const { error } = useApp();
  const { can } = useAuth();
  return (
    <div className="app">
      <Sidebar />
      <div className="main-content">
        <Header />
        {error && <div className="notice notice-error server-banner" role="alert">{error}</div>}
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/compose" element={<Compose />} />
            <Route path="/compose/:id" element={<Compose />} />
            <Route path="/posts" element={<Posts />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/library" element={<Library />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/approvals" element={can.approve ? <Approvals /> : <Navigate to="/" replace />} />
            <Route path="/team" element={can.manageMembers ? <Team /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, needsSetup, loading } = useAuth();
  if (loading) return <div className="auth-page"><p className="subtitle">Loading…</p></div>;
  return (
    <Routes>
      <Route path="/invite/:token" element={<SignIn mode="invite" />} />
      <Route path="*" element={
        !user ? (needsSetup ? <SignIn mode="setup" /> : <SignIn mode="login" />)
          // Keyed by user so switching accounts never shows the previous person's data.
          : <AppProvider key={user.id}><Shell /></AppProvider>
      } />
    </Routes>
  );
}
