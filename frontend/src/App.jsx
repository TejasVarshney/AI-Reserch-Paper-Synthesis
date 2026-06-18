import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Buckets from './pages/Buckets.jsx';
import Workspace from './pages/Workspace.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/buckets" element={<Buckets />} />
      <Route path="/bucket/:id" element={<Workspace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
