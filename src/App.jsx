// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import UserLayout from "./layouts/UserLayout";
import AdminLayout from "./layouts/AdminLayout";
import RequireAuth from "./routes/RequireAuth";
import RequireAdmin from "./routes/RequireAdmin";
import RedirectIfAuthed from "./routes/RedirectIfAuthed";

// User pages
import Home from "./pages/user/Home";
import About from "./pages/user/About";
import Marketplace from "./pages/user/Marketplace";
import MarketplaceNew from "./pages/user/MarketplaceNew";
import ItemDetail from "./pages/user/ItemDetail";
import Favorites from "./pages/user/Favorites";
import SellerPublic from "./pages/user/SellerPublic";

import Profile from "./pages/user/Profile";
import Login from "./pages/user/auth/Login";
import Signup from "./pages/user/auth/Signup";
import ForgotPassword from "./pages/user/auth/ForgotPassword";

// Admin pages
import AdminLogin from "./pages/admin/auth/AdminLogin";
import Dashboard from "./pages/admin/Dashboard";

export default function App() {
    return (
        <Routes>
            <Route element={<RedirectIfAuthed target="/" />}>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
            </Route>

            <Route element={<UserLayout />}>
                <Route element={<RequireAuth />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/marketplace" element={<Marketplace />} />
                    <Route path="/marketplace/new" element={<MarketplaceNew />} />
                    <Route path="/marketplace/:id" element={<ItemDetail />} />
                    <Route path="/favorites" element={<Favorites />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/s/:slug" element={<SellerPublic />} />
                </Route>
            </Route>

            {/* Admin area */}
            <Route path="/admin" element={<AdminLayout />}>
                <Route
                    element={<RedirectIfAuthed adminOnly target="/admin/dashboard" />}
                >
                    <Route path="login" element={<AdminLogin />} />
                </Route>
                <Route element={<RequireAdmin />}>
                    <Route index element={<Dashboard />} />
                    <Route path="dashboard" element={<Dashboard />} />
                </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
}
