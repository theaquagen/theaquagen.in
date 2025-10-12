import { createBrowserRouter } from "react-router-dom";
import PublicLayout from "../layouts/PublicLayout";
import AdminLayout from "../layouts/AdminLayout";
import AdminAuthLayout from "../layouts/AdminAuthLayout";
import ProtectedRouteAdmin from "./ProtectedRouteAdmin";

import { AdminAuthProvider } from "../providers/AdminAuthProvider";

import Home from "../pages/public/Home";
import About from "../pages/public/About";
import PublicLogin from "../pages/public/auth/Login";
import Signup from "../pages/public/auth/Signup";
import Profile from "../pages/public/Profile";

import AdminLogin from "../pages/admin/auth/Login";
import Dashboard from "../pages/admin/Dashboard";
import Users from "../pages/admin/Users";

export const router = createBrowserRouter([
  // Public site (uses PUBLIC provider at app root)
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/about", element: <About /> },
      { path: "/login", element: <PublicLogin /> },
      { path: "/signup", element: <Signup /> },
      { path: "/profile", element: <Profile /> },
    ],
  },

  // Admin login (unprotected) — provide ADMIN auth context here
  {
    element: (
      <AdminAuthProvider>
        <AdminAuthLayout />
      </AdminAuthProvider>
    ),
    children: [{ path: "/admin/login", element: <AdminLogin /> }],
  },

  // Protected admin area — ADMIN provider must wrap ProtectedRouteAdmin
  {
    element: (
      <AdminAuthProvider>
        <ProtectedRouteAdmin requireRole="admin">
          <AdminLayout />
        </ProtectedRouteAdmin>
      </AdminAuthProvider>
    ),
    children: [
      { path: "/admin", element: <Dashboard /> },
      { path: "/admin/users", element: <Users /> },
    ],
  },
]);
