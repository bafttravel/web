'use client';
import ProtectedRoute from './ProtectedRoute';
import AdminLayout from './AdminLayout';
export default function OperationsShell({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute><AdminLayout>{children}</AdminLayout></ProtectedRoute>;
}
