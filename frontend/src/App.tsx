import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { startConnection } from './net/connection';
import ControllerPage from './pages/ControllerPage';
import SimulationPage from './pages/SimulationPage';

export default function App() {
  useEffect(() => { startConnection(); }, []); // idempotent; the socket outlives page changes
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<SimulationPage />} />
        <Route path="controller" element={<ControllerPage />} />
      </Route>
    </Routes>
  );
}
