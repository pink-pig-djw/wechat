import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useStore } from './lib/store.js';
import { onUnauthorized } from './lib/api.js';
import { logout } from './lib/actions.js';
import { toast } from './lib/ui.js';
import { initNative } from './lib/native.js';
import { useIsMobile } from './lib/hooks.js';
import { AppShell } from './components/AppShell.jsx';
import { BannerHost, DialogHost, ImageViewerHost, MenuHost, ToastHost } from './components/Overlays.jsx';
import AuthPage from './pages/AuthPage.jsx';
import { ChatsSection } from './pages/chats/ChatList.jsx';
import { ChatWindow } from './pages/chats/ChatWindow.jsx';
import ChatInfo from './pages/chats/ChatInfo.jsx';
import { ContactsSection } from './pages/contacts/ContactList.jsx';
import NewFriends from './pages/contacts/NewFriends.jsx';
import AddFriend from './pages/contacts/AddFriend.jsx';
import GroupList from './pages/contacts/GroupList.jsx';
import UserProfile from './pages/contacts/UserProfile.jsx';
import Discover from './pages/Discover.jsx';
import Moments from './pages/moments/Moments.jsx';
import { MeSection } from './pages/me/Me.jsx';
import EditProfile from './pages/me/EditProfile.jsx';
import Settings from './pages/me/Settings.jsx';

export default function App() {
  const token = useStore((s) => s.token);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    // Android app: back button + splash screen. Registered once; the handler reads the route itself.
    initNative(navigate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      logout();
      toast('登录已过期，请重新登录');
    });
  }, []);

  return (
    <>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/chats" replace /> : <AuthPage mode="login" />} />
        <Route path="/register" element={token ? <Navigate to="/chats" replace /> : <AuthPage mode="register" />} />
        <Route element={token ? <AppShell /> : <Navigate to="/login" replace />}>
          <Route index element={<Navigate to="/chats" replace />} />
          <Route path="chats" element={<ChatsSection />}>
            <Route path=":id" element={<ChatWindow />}>
              <Route path="info" element={<ChatInfo />} />
            </Route>
          </Route>
          <Route path="contacts" element={<ContactsSection />}>
            <Route path="new" element={<NewFriends />} />
            <Route path="add" element={<AddFriend />} />
            <Route path="groups" element={<GroupList />} />
            <Route path="u/:userId" element={<UserProfile />} />
          </Route>
          <Route path="discover" element={isMobile ? <Discover /> : <Navigate to="/moments" replace />} />
          <Route path="moments" element={<Moments />} />
          <Route path="moments/u/:userId" element={<Moments />} />
          <Route path="me" element={<MeSection />}>
            <Route path="profile" element={<EditProfile />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/chats" replace />} />
        </Route>
      </Routes>
      {token && <BannerHost />}
      <ToastHost />
      <MenuHost />
      <DialogHost />
      <ImageViewerHost />
    </>
  );
}
