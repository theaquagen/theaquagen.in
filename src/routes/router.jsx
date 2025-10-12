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

import GuestOnlyPublic from "./GuestOnlyPublic";
import GuestOnlyAdmin from "./GuestOnlyAdmin";

export const router = createBrowserRouter([
  // PUBLIC site
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/about", element: <About /> },

      // 🔒 If already logged in (public session), redirect away from auth pages
      { path: "/login", element: (
          <GuestOnlyPublic redirectTo="/">
            <PublicLogin />
          </GuestOnlyPublic>
        )
      },
      { path: "/signup", element: (
          <GuestOnlyPublic redirectTo="/">
            <Signup />
          </GuestOnlyPublic>
        )
      },

      { path: "/profile", element: <Profile /> },
    ],
  },

  // ADMIN login (unprotected route group but with admin auth context)
  {
    element: (
      <AdminAuthProvider>
        <AdminAuthLayout />
      </AdminAuthProvider>
    ),
    children: [
      // 🔒 If already an admin, redirect to /admin (dashboard)
      { path: "/admin/login", element: (
          <GuestOnlyAdmin redirectTo="/admin">
            <AdminLogin />
          </GuestOnlyAdmin>
        )
      },
    ],
  },

  // ADMIN protected area (RBAC)
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