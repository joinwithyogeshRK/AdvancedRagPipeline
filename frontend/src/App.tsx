import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import ChatPage from "./pages/ChatPage";
import GithubOAuthCallbackBridge from "./pages/GithubOAuthCallbackBridge";
import SsoCallbackPage from "./pages/SsoCallbackPage";
import MixDesignPage from "./pages/MixDesignPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/github/callback" element={<GithubOAuthCallbackBridge />} />
        <Route path="/sso-callback" element={<SsoCallbackPage />} />
        <Route path="/mix-design" element={<MixDesignPage />} />
        <Route path="/" element={<ChatPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
