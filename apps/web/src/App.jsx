import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Layout from "./components/Layout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import TasksPage from "./pages/TasksPage.jsx";
import ApprovalsPage from "./pages/ApprovalsPage.jsx";
import ApprovalBasesPage from "./pages/ApprovalBasesPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";
import DirectoryPage from "./pages/DirectoryPage.jsx";
import DrivePage from "./pages/DrivePage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import AuditPage from "./pages/AuditPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/drive" element={<DrivePage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/approvals/bases" element={<ApprovalBasesPage />} />
        <Route path="/approvals/bases/:typeId" element={<ApprovalBasesPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/directory" element={<DirectoryPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
