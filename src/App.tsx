import React from 'react';
import { Routes, Route } from 'react-router-dom';
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
import { useApp } from './context/AppContext';

export default function App() {
  const { error } = useApp();
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
            <Route path="/queue" element={<Queue />} />
            <Route path="/library" element={<Library />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/posts" element={<Posts />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/accounts" element={<Accounts />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
