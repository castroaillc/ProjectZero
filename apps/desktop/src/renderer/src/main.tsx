import "./zod-config";
import { configureApiClient, createQueryClient } from "@projectzero/api-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { getToken, loadToken } from "./auth";
import "./styles.css";

configureApiClient({ baseUrl: __API_URL__, getToken, credentials: "omit" });
const queryClient = createQueryClient();

// Read the stored token before the first render so a signed-in user lands on their todos.
void loadToken().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});
