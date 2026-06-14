import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "./context/ThemeProvider"
import { ClerkThemeProvider } from "./components/ClerkThemeProvider"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ClerkThemeProvider>
        <App />
      </ClerkThemeProvider>
    </ThemeProvider>
  </StrictMode>
)